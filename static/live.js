const $ = (id) => document.getElementById(id);

const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const langSelect = $("langSelect");
const interimToggle = $("interimToggle");
const statusEl = $("status");
const liveBadge = $("liveBadge");

const finalOut = $("finalOut");
const interimOut = $("interimOut");

// Expand-only-over-card elements
const transcriptCard = $("transcriptCard");
const expandBtn = $("expandBtn");
const cardExpand = $("cardExpand");
const closeExpandBtn = $("closeExpand");
const resultExpanded = $("resultExpanded");

// Copy/Save/Clear
$("copyBtn")?.addEventListener("click", async () => {
    const text = (finalOut.textContent || "") + (interimOut.textContent || "");
    await navigator.clipboard.writeText(text.trim());
    statusEl.textContent = "Copied ✅";
});
$("saveBtn")?.addEventListener("click", () => {
    const text = ((finalOut.textContent || "") + "\n" + (interimOut.textContent || "")).trim();
    if (!text) { statusEl.textContent = "Nothing to save"; return; }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fn = `dictation-${stamp}.txt`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fn; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    statusEl.textContent = "Saved .txt ✅";
});
$("clearBtn")?.addEventListener("click", () => {
    finalOut.textContent = "";
    interimOut.textContent = "";
    statusEl.textContent = "Cleared";
});

// ---- Web Speech API wiring ----
let rec = null;
let isRunning = false;
let autoRestart = true;

function getRecognizer() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SR ? new SR() : null;
}

function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        statusEl.textContent = "This browser doesn't support SpeechRecognition. (Try Chrome/Edge, or use our offline mode later.)";
        return;
    }
    if (isRunning) return;

    rec = new SR();
    rec.lang = langSelect.value || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        isRunning = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusEl.textContent = "Listening…";
        liveBadge.textContent = "LIVE";
        liveBadge.style.color = "var(--neon-green)";
    };

    rec.onresult = (e) => {
        let interim = "";
        let final = finalOut.textContent || "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
                final += (final.endsWith(" ") ? "" : " ") + res[0].transcript.trim();
            } else if (interimToggle.checked) {
                interim += " " + res[0].transcript;
            }
        }
        finalOut.textContent = final.trim();
        interimOut.textContent = interim.trim();
        if (transcriptCard?.classList.contains("is-expanded")) {
            resultExpanded.textContent = (finalOut.textContent + "\n" + interimOut.textContent).trim();
        }
    };

    rec.onerror = (e) => {
        console.warn("Speech error:", e.error);
        statusEl.textContent = "Speech error: " + e.error;
        // Some errors (no-speech, network) can be transient—allow onend to restart
    };

    rec.onend = () => {
        isRunning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        liveBadge.textContent = "IDLE";
        liveBadge.style.color = "var(--muted)";
        if (autoRestart) {
            // tiny delay to avoid rapid spins
            setTimeout(() => {
                if (!isRunning) startRecognition();
            }, 300);
        }
    };

    try {
        rec.start();
    } catch (err) {
        // Chrome throws if start() is called twice
        console.warn("start() failed:", err);
    }
}

function stopRecognition() {
    autoRestart = false;
    if (rec) {
        try { rec.stop(); } catch { }
    }
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = "Stopped.";
    liveBadge.textContent = "IDLE";
    liveBadge.style.color = "var(--muted)";
}

// buttons
startBtn.addEventListener("click", () => {
    autoRestart = true;
    startRecognition();
    ensureVisualizer(); // spin up mic viz too
});
stopBtn.addEventListener("click", () => {
    stopRecognition();
    stopVisualizer();
});

// allow changing language on the fly (will apply on next restart)
langSelect.addEventListener("change", () => {
    statusEl.textContent = `Language: ${langSelect.value}`;
});

// ---- Visualizer (mic level) ----
let audioCtx = null, analyser = null, vizRAF = null, micStream = null;
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
buildBars(desiredBarCount());
let rbTO;
window.addEventListener("resize", () => {
    clearTimeout(rbTO);
    rbTO = setTimeout(() => buildBars(desiredBarCount()), 150);
});

async function ensureVisualizer() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (micStream) return; // already running
    try {
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
    } catch (e) {
        console.warn("Mic permission denied for viz:", e);
        return;
    }
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    const src = audioCtx.createMediaStreamSource(micStream);
    src.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const render = () => {
        analyser.getByteFrequencyData(data);
        const bars = viz.querySelectorAll(".bar");
        const step = Math.max(1, Math.floor(data.length / bars.length));
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
    if (vizRAF) cancelAnimationFrame(vizRAF);
    vizRAF = null;
    if (micStream) {
        try { micStream.getTracks().forEach(t => t.stop()); } catch { }
        micStream = null;
    }
    (viz ? viz.querySelectorAll(".bar") : []).forEach(b => b.style.height = "6px");
}

// Expand overlay
function openCardExpand() {
    resultExpanded.textContent = (finalOut.textContent + "\n" + interimOut.textContent).trim();
    transcriptCard.classList.add("is-expanded");
    cardExpand.setAttribute("aria-hidden", "false");
}
function closeCardExpand() {
    transcriptCard.classList.remove("is-expanded");
    cardExpand.setAttribute("aria-hidden", "true");
}
expandBtn?.addEventListener("click", openCardExpand);
closeExpandBtn?.addEventListener("click", closeCardExpand);
cardExpand?.addEventListener("click", (e) => { if (e.target === cardExpand) closeCardExpand(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && transcriptCard.classList.contains("is-expanded")) closeCardExpand(); });
