import os, tempfile, uuid, subprocess
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="/static")

# Home page
@app.get("/")
def index():
    return app.send_static_file("home.html")

@app.get("/stt")
def stt_page():
    return app.send_static_file("stt.html")

@app.get("/video")
def video_page():
    return app.send_static_file("video.html")  # simple placeholder for now

@app.get("/lyrics")
def lyrics_page():
    return app.send_static_file("lyrics.html")  # simple placeholder for now

# --- Whisper ---
from faster_whisper import WhisperModel
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")  # CPU-friendly

def to_wav_16k_mono(src_path, dst_path):
    cmd = ["ffmpeg", "-y", "-i", src_path, "-ac", "1", "-ar", "16000", dst_path]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

@app.post("/api/transcribe")
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No 'audio' file field"}), 400
    f = request.files["audio"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    tmpdir = tempfile.gettempdir()
    ext = os.path.splitext(f.filename)[1].lower() or ".webm"
    raw = os.path.join(tmpdir, f"es_{uuid.uuid4().hex}{ext}")
    wav = os.path.join(tmpdir, f"es_{uuid.uuid4().hex}.wav")
    f.save(raw)

    try:
        to_wav_16k_mono(raw, wav)
        segments, info = model.transcribe(wav, vad_filter=True, beam_size=5, word_timestamps=False)
        text = " ".join(s.text.strip() for s in segments).strip()
        return jsonify({"language": info.language, "prob": info.language_probability, "text": text})
    except subprocess.CalledProcessError:
        return jsonify({"error": "FFmpeg failed. Install it and ensure it's on PATH (ffmpeg -version)."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        for p in (raw, wav):
            try:
                if os.path.exists(p): os.remove(p)
            except: pass

if __name__ == "__main__":
    app.run(debug=True)
