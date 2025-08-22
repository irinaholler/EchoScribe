// === EchoScribe STT — app.js ===
let mediaRecorder, chunks = [], lastBlob = null;

// shorthands
const $ = (id) => document.getElementById(id);
const recordBtn = $("recordBtn");
const stopBtn = $("stopBtn");
const preview = $("preview");
const fileInput = $("fileInput");
const statusEl = $("status");
const resultEl = $("result");

// language pills
const langBar = $("langBar");
const langTag = $("langTag");
const langProb = $("langProb");

// expand-over-card elements
const transcriptCard = $("transcriptCard");
const expandBtn = $("expandBtn");
const cardExpand = $("cardExpand");
const closeExpandBtn = $("closeExpand");
const resultExpanded = $("resultExpanded");

// ==== Recording ====
recordBtn?.addEventListener("click", async () => {
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
            const blob = new Blob(chunks, { type: "audio/webm" });
            lastBlob = blob;
            preview.src = URL.createObjectURL(blob);
            preview.load();
            statusEl.textContent = "Recording ready to transcribe.";
            // release mic
            try { mediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch { }
            stopVisualizer();
            recordBtn.disabled = false;
            stopBtn.disabled = true;
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

stopBtn?.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    } else {
        // safety: UI reset even if nothing recording
        stopVisualizer();
        recordBtn.disabled = false;
        stopBtn.disabled = true;
    }
});

// file upload
fileInput?.addEventListener("change", () => {
    const nameEl = $("fileName");
    if (fileInput.files && fileInput.files[0]) {
        lastBlob = fileInput.files[0];
        preview.src = URL.createObjectURL(lastBlob);
        preview.load();
        resultEl.textContent = "";
        statusEl.textContent = "File loaded.";
        if (nameEl) nameEl.textContent = `📂 ${lastBlob.name}`;
    }
});

// ==== Transcribe ====
$("transcribeBtn")?.addEventListener("click", async () => {
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

        // language pills
        if (data.language) {
            const code = (data.language || "en").toLowerCase();
            const entry = LANG_MAP[code] || { name: code.toUpperCase(), flag: "🏳️" };
            langFlag.textContent = entry.flag;
            langName.textContent = entry.name;
            langCode.textContent = code.toUpperCase();

            const p = data.prob != null ? Math.round(data.prob * 100) : null;
            confPct.textContent = (p != null ? `${p}%` : "—");
            confFill.style.width = (p != null ? `${Math.max(3, Math.min(100, p))}%` : "0%");
            langBar.hidden = false;
        } else {
            langBar.hidden = true;
        }

        // transcript only
        resultEl.textContent = (data.text || "").trim();
        metaWords.textContent = `${wordCount(resultEl.textContent)} words`;

        if (transcriptCard?.classList.contains("is-expanded")) {
            resultExpanded.textContent = resultEl.textContent;
        }
        statusEl.textContent = "Done ✅";
    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    }
});

// ==== Visualizer wiring ====
let audioCtx = null, analyser = null, vizRAF = null;
const viz = document.getElementById("viz");

function buildBars(n = 40) {
    if (!viz) return;
    viz.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const b = document.createElement("div");
        b.className = "bar";
        viz.appendChild(b);
    }
}
buildBars(40);

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
            const avg = sum / step;
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
    bars.forEach(b => (b.style.height = "6px"));
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

// --- Expand only over the transcription card ---
function openCardExpand() {
    if (!transcriptCard) return;
    resultExpanded.textContent = resultEl.textContent || "";
    transcriptCard.classList.add("is-expanded");
    cardExpand.setAttribute("aria-hidden", "false");
}
function closeCardExpand() {
    if (!transcriptCard) return;
    transcriptCard.classList.remove("is-expanded");
    cardExpand.setAttribute("aria-hidden", "true");
}

expandBtn?.addEventListener("click", openCardExpand);
closeExpandBtn?.addEventListener("click", closeCardExpand);
cardExpand?.addEventListener("click", (e) => {
    if (e.target === cardExpand) closeCardExpand(); // click backdrop area inside card to close
});
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && transcriptCard?.classList.contains("is-expanded")) closeCardExpand();
});

// --- Copy / Save ---
$("copyBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(resultEl.textContent || "");
    statusEl.textContent = "Copied to clipboard ✅";
});

$("saveBtn")?.addEventListener("click", () => {
    const text = (resultEl.textContent || "").trim();
    if (!text) { statusEl.textContent = "Nothing to save yet."; return; }

    const base = (fileInput?.files && fileInput.files[0]?.name)
        ? fileInput.files[0].name.replace(/\.[^/.]+$/, "")
        : "transcript";
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `${base}-${stamp}.txt`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    statusEl.textContent = "Saved .txt ✅";
});

// Language mapping (add more if you like)
const LANG_MAP = {
    en: { name: "English", flag: "🇬🇧" }, de: { name: "German", flag: "🇩🇪" },
    fr: { name: "French", flag: "🇫🇷" }, es: { name: "Spanish", flag: "🇪🇸" },
    it: { name: "Italian", flag: "🇮🇹" }, pt: { name: "Portuguese", flag: "🇵🇹" },
    el: { name: "Greek", flag: "🇬🇷" }, ru: { name: "Russian", flag: "🇷🇺" },
    zh: { name: "Chinese", flag: "🇨🇳" }, ja: { name: "Japanese", flag: "🇯🇵" },
    ko: { name: "Korean", flag: "🇰🇷" }, tr: { name: "Turkish", flag: "🇹🇷" }
};
const langFlag = $("langFlag"), langName = $("langName"), langCode = $("langCode");
const confPct = $("confPct"), confFill = $("confFill");
const metaDur = $("metaDur"), metaWords = $("metaWords");

function fmtDuration(sec) {
    if (!isFinite(sec) || sec <= 0) return "0:00";
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

// after preview.load();
preview.onloadedmetadata = () => { metaDur.textContent = fmtDuration(preview.duration || 0); };

function wordCount(t) {
    const n = (t || "").trim().match(/\b[\p{L}\p{N}’']+\b/gu);
    return n ? n.length : 0;
}

