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

// language strip elements
const langBar = $("langBar");
const langTag = $("langTag");
const langProb = $("langProb");

// expand-over-card elements
const transcriptCard = $("transcriptCard");
const expandBtn = $("expandBtn");
const cardExpand = $("cardExpand");
const closeExpandBtn = $("closeExpand");
const resultExpanded = $("resultExpanded");

// --- Language mapping + helpers (define BEFORE we use them on click) ---
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
function wordCount(t) {
    const n = (t || "").trim().match(/\b[\p{L}\p{N}’']+\b/gu);
    return n ? n.length : 0;
}

// ==== Recording ====
recordBtn?.addEventListener("click", async () => {
    chunks = []; lastBlob = null; resultEl.textContent = ""; statusEl.textContent = "";

    if (!navigator.mediaDevices?.getUserMedia) { statusEl.textContent = "This browser does not support microphone recording."; return; }
    if (typeof MediaRecorder === "undefined") { statusEl.textContent = "MediaRecorder is not supported in this browser."; return; }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        startVisualizer(stream);

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const mime = (chunks[0] && chunks[0].type) ? chunks[0].type : "audio/webm";
            const blob = new Blob(chunks, { type: mime });
            lastBlob = blob;
            preview.src = URL.createObjectURL(blob);
            preview.load();
            statusEl.textContent = "Recording ready to transcribe.";
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
        stopVisualizer();
        recordBtn.disabled = false;
        stopBtn.disabled = true;
    }
});

stopBtn?.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    } else {
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
        // update duration pill when metadata is ready
        preview.onloadedmetadata = () => { metaDur.textContent = fmtDuration(preview.duration || 0); };
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

        // language + confidence
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

        // transcript
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

// ==== Visualizer (single block, no duplicates) ====
let audioCtx = null, analyser = null, vizRAF = null;
const viz = document.getElementById("viz");

function desiredBarCount() {
    const w = window.innerWidth || document.documentElement.clientWidth;
    if (w <= 380) return 18;
    if (w <= 640) return 24;
    if (w <= 900) return 32;
    return 40;
}

let currentBars = 0;
function buildBars(n) {
    if (!viz) return;
    if (currentBars === n) return;
    currentBars = n;
    viz.style.setProperty('--bar-count', String(n));
    viz.innerHTML = "";
    for (let i = 0; i < n; i++) {
        const b = document.createElement("div");
        b.className = "bar";
        viz.appendChild(b);
    }
}

// initial build (after currentBars is declared)
buildBars(desiredBarCount());

// rebuild on resize (debounced)
let rbTO;
window.addEventListener("resize", () => {
    clearTimeout(rbTO);
    rbTO = setTimeout(() => buildBars(desiredBarCount()), 150);
});

function startVisualizer(stream) {
    if (!viz) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    document.body.classList.add("recording-active");

    const data = new Uint8Array(analyser.frequencyBinCount);

    const render = () => {
        analyser.getByteFrequencyData(data);
        const barEls = viz.querySelectorAll(".bar");
        const step = Math.max(1, Math.floor(data.length / barEls.length));
        for (let i = 0; i < barEls.length; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
            const avg = sum / step; // 0..255
            const h = Math.max(6, Math.min(60, (avg / 255) * 60));
            barEls[i].style.height = h + "px";
        }
        vizRAF = requestAnimationFrame(render);
    };
    vizRAF = requestAnimationFrame(render);
}

function stopVisualizer() {
    document.body.classList.remove("recording-active");
    if (vizRAF) cancelAnimationFrame(vizRAF);
    vizRAF = null;
    (viz ? viz.querySelectorAll(".bar") : []).forEach(b => b.style.height = "6px");
}

// --- Scroll-to-top binding ---
(() => {
    const btn = document.getElementById('scrollTop') || document.querySelector('.footer-decoration');
    if (!btn) return;
    const root = document.scrollingElement || document.documentElement;
    const goTop = () => {
        const container = document.querySelector('.container');
        const cs = container ? getComputedStyle(container) : null;
        const target = (container && /(auto|scroll)/.test(cs?.overflowY || '')) ? container : root;
        if (target.scrollTo) target.scrollTo({ top: 0, behavior: 'smooth' });
        else { target.scrollTop = 0; window.scrollTo(0, 0); }
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
cardExpand?.addEventListener("click", (e) => { if (e.target === cardExpand) closeCardExpand(); });
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

// update duration pill if recording preview loads metadata
preview.onloadedmetadata = () => { metaDur.textContent = fmtDuration(preview.duration || 0); };

// (Optional) Video input stub (safe to keep)
const videoInput = $("videoInput");
videoInput?.addEventListener("change", () => {
    if (videoInput.files && videoInput.files[0]) {
        const file = videoInput.files[0];
        const el = document.getElementById("videoName");
        if (el) el.textContent = `🎥 ${file.name}`;
    }
});
