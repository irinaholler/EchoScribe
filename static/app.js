let mediaRecorder, chunks = [], lastBlob = null;

const $ = (id) => document.getElementById(id);
const recordBtn = $("recordBtn");
const stopBtn = $("stopBtn");
const preview = $("preview");
const fileInput = $("fileInput");
const statusEl = $("status");
const resultEl = $("result");

recordBtn.addEventListener("click", async () => {
    chunks = []; lastBlob = null; resultEl.textContent = ""; statusEl.textContent = "";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        startVisualizer(stream);

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: "audio/webm" });
            lastBlob = blob;
            preview.src = URL.createObjectURL(blob);
            statusEl.textContent = "Recording ready to transcribe.";
        };
        mediaRecorder.start();
        statusEl.textContent = "Recording… speak now.";
        recordBtn.disabled = true; stopBtn.disabled = false;
    } catch (e) {
        console.error(e);
        statusEl.textContent = "Mic permission denied or unsupported.";
    }
});

stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        recordBtn.disabled = false; stopBtn.disabled = true;
    }
});

fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
        lastBlob = fileInput.files[0];
        preview.src = URL.createObjectURL(lastBlob);
        resultEl.textContent = ""; statusEl.textContent = "File loaded.";
    }
});

$("transcribeBtn").addEventListener("click", async () => {
    if (!lastBlob) { statusEl.textContent = "Record or choose a file first."; return; }
    statusEl.textContent = "Uploading & transcribing…"; resultEl.textContent = "";

    const form = new FormData();
    const name = lastBlob.name ? lastBlob.name : "recording.webm";
    form.append("audio", lastBlob, name);

    try {
        const r = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Transcription failed");
        resultEl.textContent =
            `Language: ${data.language} (p≈${(data.prob * 100).toFixed(1)}%)\n\n${data.text}`;
        statusEl.textContent = "Done ✅";
    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    }
});

// ==== Visualizer wiring ====
let audioCtx = null, analyser = null, vizRAF = null;
const viz = document.getElementById("viz");

// build bars once
function buildBars(n = 32) {
    if (!viz) return;
    viz.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const b = document.createElement("div");
        b.className = "bar";
        viz.appendChild(b);
    }
}
buildBars(32);

function startVisualizer(stream) {
    // init audio graph
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;              // frequency resolution
    analyser.smoothingTimeConstant = 0.8; // smoother bars

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    const bars = Array.from(viz.querySelectorAll(".bar"));
    const data = new Uint8Array(analyser.frequencyBinCount);

    document.body.classList.add("recording-active");

    const render = () => {
        analyser.getByteFrequencyData(data);
        // map 0..analyserBins to our 32 bars
        const step = Math.floor(data.length / bars.length);
        for (let i = 0; i < bars.length; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
            const avg = sum / step; // 0..255
            const h = Math.max(6, Math.min(60, (avg / 255) * 60)); // clamp 6..60px
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
    // gently drop bars
    const bars = viz ? viz.querySelectorAll(".bar") : [];
    bars.forEach(b => b.style.height = "6px");
}

// --- Scroll-to-top binding ---
(() => {
    const btn = document.getElementById('scrollTop') || document.querySelector('.footer-decoration');
    if (!btn) return;

    // choose the right scrolling element across browsers
    const root = document.scrollingElement || document.documentElement;

    const goTop = () => {
        // if the main content is a scrollable container, scroll that instead
        const container = document.querySelector('.container');
        const cs = container ? getComputedStyle(container) : null;
        const scrollTarget = (container && /(auto|scroll)/.test(cs?.overflowY || '')) ? container : root;

        if (scrollTarget.scrollTo) {
            scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            scrollTarget.scrollTop = 0; // fallback
            window.scrollTo(0, 0);
        }
    };

    btn.addEventListener('click', goTop);
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTop(); }
    });
})();

