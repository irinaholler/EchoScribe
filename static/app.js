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
