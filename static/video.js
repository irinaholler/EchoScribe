// === EchoScribe Video → Text ===

const $ = (id) => document.getElementById(id);

const videoInput = $("videoInput");
const vpreview = $("vpreview");
const videoName = $("videoName");
const videoSize = $("videoSize");
const videoDur = $("videoDur");

const vTranscribeBtn = $("vTranscribeBtn");
const statusEl = $("status");
const resultEl = $("result");

// language strip
const langBar = $("langBar");
const langFlag = $("langFlag");
const langName = $("langName");
const langCode = $("langCode");
const confPct = $("confPct");
const confFill = $("confFill");
const metaDur = $("metaDur");
const metaWords = $("metaWords");

// expand-over-card
const transcriptCard = $("transcriptCard");
const expandBtn = $("expandBtn");
const cardExpand = $("cardExpand");
const closeExpandBtn = $("closeExpand");
const resultExpanded = $("resultExpanded");

// progress
const progressRow = $("progressRow");
const progressPct = $("progressPct");
const progressFill = $("progressFill");

let lastVideoFile = null;

// Helpers
const LANG_MAP = {
    en: { name: "English", flag: "🇬🇧" }, de: { name: "German", flag: "🇩🇪" },
    fr: { name: "French", flag: "🇫🇷" }, es: { name: "Spanish", flag: "🇪🇸" },
    it: { name: "Italian", flag: "🇮🇹" }, pt: { name: "Portuguese", flag: "🇵🇹" },
    el: { name: "Greek", flag: "🇬🇷" }, ru: { name: "Russian", flag: "🇷🇺" },
    zh: { name: "Chinese", flag: "🇨🇳" }, ja: { name: "Japanese", flag: "🇯🇵" },
    ko: { name: "Korean", flag: "🇰🇷" }, tr: { name: "Turkish", flag: "🇹🇷" }
};
function fmtBytes(b) {
    if (!b && b !== 0) return "—";
    const u = ["B", "KB", "MB", "GB"]; let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function fmtDuration(sec) {
    if (!isFinite(sec) || sec <= 0) return "0:00";
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}
function wordCount(t) {
    const n = (t || "").trim().match(/\b[\p{L}\p{N}’']+\b/gu);
    return n ? n.length : 0;
}

// File input
videoInput?.addEventListener("change", () => {
    if (!videoInput.files || !videoInput.files[0]) return;
    const file = videoInput.files[0];
    lastVideoFile = file;

    videoName.textContent = file.name;
    videoSize.textContent = fmtBytes(file.size);

    vpreview.src = URL.createObjectURL(file);
    vpreview.load();
    vpreview.onloadedmetadata = () => {
        const dur = vpreview.duration || 0;
        videoDur.textContent = fmtDuration(dur);
        metaDur.textContent = fmtDuration(dur);
    };

    resultEl.textContent = "";
    statusEl.textContent = "Video loaded. Ready to transcribe.";
    langBar.hidden = true;
});

// Transcribe
vTranscribeBtn?.addEventListener("click", async () => {
    if (!lastVideoFile) { statusEl.textContent = "Choose a video first."; return; }

    statusEl.textContent = "Uploading & transcribing…";
    resultEl.textContent = "";
    langBar.hidden = true;

    // Progress UI
    progressRow.hidden = false;
    progressPct.textContent = "0%";
    progressFill.style.width = "0%";

    const form = new FormData();
    // Send under field name "audio" so backend can accept both audio and video at /api/transcribe
    form.append("audio", lastVideoFile, lastVideoFile.name);

    try {
        // Use manual XHR to show upload progress
        const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/transcribe");
            xhr.responseType = "json";

            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable) return;
                const p = Math.round((e.loaded / e.total) * 100);
                progressPct.textContent = `${p}%`;
                progressFill.style.width = `${p}%`;
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
                else reject(new Error(xhr.response?.error || `HTTP ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(form);
        });

        // Language strip
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

        // Transcript
        resultEl.textContent = (data.text || "").trim();
        metaWords.textContent = `${wordCount(resultEl.textContent)} words`;

        statusEl.textContent = "Done ✅";
        progressPct.textContent = "100%";
        progressFill.style.width = "100%";

    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    } finally {
        setTimeout(() => { progressRow.hidden = true; }, 800);
    }
});

// Expand overlay (only over the card)
function openCardExpand() {
    resultExpanded.textContent = resultEl.textContent || "";
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
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && transcriptCard.classList.contains("is-expanded")) closeCardExpand();
});

// Copy / Save
$("copyBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(resultEl.textContent || "");
    statusEl.textContent = "Copied to clipboard ✅";
});
$("saveBtn")?.addEventListener("click", () => {
    const text = (resultEl.textContent || "").trim();
    if (!text) { statusEl.textContent = "Nothing to save yet."; return; }

    const base = lastVideoFile ? lastVideoFile.name.replace(/\.[^/.]+$/, "") : "transcript";
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

// Scroll-to-top
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
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTop(); } });
})();
