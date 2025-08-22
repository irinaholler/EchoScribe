let mediaRecorder, chunks = [], lastBlob = null;

const $ = (id) => document.getElementById(id);
const recordBtn = $("recordBtn");
const stopBtn = $("stopBtn");
const preview = $("preview");
const fileInput = $("fileInput");
const statusEl = $("status");
const resultEl = $("result");

// language pills (nice UI instead of raw text)
const langBar = $("langBar");
const langTag = $("langTag");
const langProb = $("langProb");

// --- Fullscreen reader modal ---
const readerModal = document.getElementById("readerModal");
const readerText = document.getElementById("readerText");
const readerClose = document.getElementById("readerClose");

// ==== Recording ====
recordBtn.addEventListener("click", async () => {
    chunks = []; lastBlob = null; resultEl.textContent = "";
    statusEl.textContent = "";

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        startVisualizer(stream);

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
            // build final blob
            const blob = new Blob(chunks, { type: "audio/webm" });
            lastBlob = blob;
            preview.src = URL.createObjectURL(blob);
            preview.load();
            statusEl.textContent = "Recording ready to transcribe.";

            // fully release mic
            try { mediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch { }
        };

        mediaRecorder.start();
        statusEl.textContent = "Recording… speak now.";
        recordBtn.disabled = true;
        stopBtn.disabled = false;

    } catch (e) {
        console.error(e);
        statusEl.textContent = "Mic permission denied or unsupported.";
    }
});

stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    stopVisualizer();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
});

// file upload
fileInput?.addEventListener("change", () => {
    const nameEl = document.getElementById("fileName");
    if (fileInput.files && fileInput.files[0]) {
        lastBlob = fileInput.files[0];
        preview.src = URL.createObjectURL(lastBlob);
        preview.load();

        resultEl.textContent = "";
        statusEl.textContent = "File loaded.";

        // Show the file name
        if (nameEl) {
            nameEl.textContent = `📂 ${lastBlob.name}`;
        }
    }
});

// ==== Transcribe ====
$("transcribeBtn").addEventListener("click", async () => {
    if (!lastBlob) { statusEl.textContent = "Record or choose a file first."; return; }

    statusEl.textContent = "Uploading & transcribing…";
    resultEl.textContent = "";
    if (langBar) langBar.hidden = true;

    const form = new FormData();
    const name = lastBlob.name ? lastBlob.name : "recording.webm";
    form.append("audio", lastBlob, name);

    try {
        const r = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Transcription failed");

        // language badges
        if (data.language) {
            langTag.textContent = (data.language || "en").toUpperCase();
            const p = data.prob != null ? Math.round(data.prob * 100) : null;
            langProb.textContent = (p != null ? `${p}%` : "");
            langBar.hidden = false;
        } else {
            langBar.hidden = true;
        }

        // transcript only
        resultEl.textContent = (data.text || "").trim();
        statusEl.textContent = "Done ✅";
    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    }
});

// ==== Visualizer wiring ====
let audioCtx = null, analyser = null, vizRAF = null;
const viz = document.getElementById("viz");

function buildBars(n = 32) {
    if (!viz) return;
    viz.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const b = document.createElement("div");
        b.className = "bar";
        viz.appendChild(b);
    }
}
buildBars(40); // a tad denser for elegance

function startVisualizer(stream) {
    if (!viz) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    const bars = Array.from(viz.querySelectorAll(".bar"));
    const data = new Uint8Array(analyser.frequencyBinCount);

    document.body.classList.add("recording-active");

    const render = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / bars.length);
        for (let i = 0; i < bars.length; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
            const avg = sum / step; // 0..255
            const h = Math.max(6, Math.min(60, (avg / 255) * 60));
            bars[i].style.height = h + "px";
        }
        vizRAF = requestAnimationFrame(render);
    };
    vizRAF = requestAnimationFrame(render);
}

function stopVisualizer() {
    document.body.classList.remove("recording-active");
    if (vizRAF) cancelAnimationFrame(vizRAF);
    vizRAF = null;
    const bars = viz ? viz.querySelectorAll(".bar") : [];
    bars.forEach(b => b.style.height = "6px");
}

// --- Scroll-to-top binding ---
(() => {
    const btn = document.getElementById('scrollTop') || document.querySelector('.footer-decoration');
    if (!btn) return;

    const root = document.scrollingElement || document.documentElement;

    const goTop = () => {
        const container = document.querySelector('.container');
        const cs = container ? getComputedStyle(container) : null;
        const scrollTarget = (container && /(auto|scroll)/.test(cs?.overflowY || '')) ? container : root;

        if (scrollTarget.scrollTo) scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
        else { scrollTarget.scrollTop = 0; window.scrollTo(0, 0); }
    };

    btn.addEventListener('click', goTop);
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTop(); }
    });
})();

// Expand/collapse transcript
const expandBtn = $("expandBtn");
if (expandBtn) {
    expandBtn.addEventListener("click", () => {
        resultEl.classList.toggle("fullscreen");
        expandBtn.textContent = resultEl.classList.contains("fullscreen") ? "Close" : "Expand";
    });
}

// Copy / Save
$("copyBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(resultEl.textContent || "");
    statusEl.textContent = "Copied to clipboard ✅";
});
$("saveBtn")?.addEventListener("click", () => {
    const blob = new Blob([resultEl.textContent || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(a.href);
});

function openReader() {
    if (!readerModal) return;
    readerText.textContent = resultEl.textContent || "";
    readerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}
function closeReader() {
    if (!readerModal) return;
    readerModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

expandBtn?.addEventListener("click", openReader);
readerClose?.addEventListener("click", closeReader);
readerModal?.addEventListener("click", (e) => {
    if (e.target === readerModal) closeReader(); // click backdrop to close
});
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && readerModal?.getAttribute("aria-hidden") === "false") closeReader();
});