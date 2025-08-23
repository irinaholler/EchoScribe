import os, tempfile, subprocess, uuid, shutil, logging
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from faster_whisper import WhisperModel

# --- Paths -------------------------------------------------------------------
# Assume this file is at project root, and you have a folder: ./static
# static contains: home.html, stt.html, video.html, main.css, hub.css, styles.css, app.js, video.js, nav.js, etc.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 512 * 1024 * 1024  # 512MB uploads

# --- Logging -----------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
log = app.logger

# --- Whisper model (load once) -----------------------------------------------
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
# For CPU, int8 is friendly. If you have an Apple Silicon GPU setup, you can tune accordingly.
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")

# --- Extensions we accept -----------------------------------------------------
ALLOWED_AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".webm"}
ALLOWED_VIDEO = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
ALLOWED = ALLOWED_AUDIO | ALLOWED_VIDEO

# --- Utilities ----------------------------------------------------------------
def ffmpeg_exists() -> bool:
    from shutil import which
    return which("ffmpeg") is not None

def to_wav_16k_mono(src_path: str, dst_path: str):
    """
    Convert any audio/video to 16kHz mono WAV for Whisper.
    """
    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-vn",                 # no video in output
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        dst_path
    ]
    # If ffmpeg fails, subprocess.CalledProcessError will be raised
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

# --- Pages --------------------------------------------------------------------
@app.get("/")
def home():
    return app.send_static_file("home.html")

@app.get("/stt")
def stt_page():
    return app.send_static_file("stt.html")

@app.get("/video")
def video_page():
    return app.send_static_file("video.html")

@app.get("/live")
def live_page():
    return app.send_static_file("live.html")

@app.get("/lyrics")
def lyrics_page():
    # you can add a real page later
    return app.send_static_file("home.html")

# Serve any file that’s inside /static (useful if index above doesn’t cover)
@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

# --- Errors -------------------------------------------------------------------
@app.errorhandler(413)
def too_large(_):
    return jsonify(error="File too large (over 512 MB)."), 413

@app.errorhandler(404)
def not_found(_):
    return jsonify(error="Not found"), 404

# --- Single, unified transcribe endpoint -------------------------------------
@app.post("/api/transcribe")
def api_transcribe():
    """
    Accepts form field "audio" which can be an audio OR a video file.
    Converts it to wav (16k mono) via FFmpeg and transcribes with faster-whisper.
    """
    try:
        if "audio" not in request.files:
            return jsonify(error="No file field 'audio'"), 400

        f = request.files["audio"]
        if not f or not f.filename:
            return jsonify(error="Empty filename"), 400

        if not ffmpeg_exists():
            return jsonify(error="FFmpeg not found. Install it and ensure 'ffmpeg' is on PATH."), 500

        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED:
            return jsonify(error=f"Unsupported file type: {ext}"), 400

        work = tempfile.mkdtemp(prefix="echoscribe_")
        try:
            in_path = os.path.join(work, secure_filename(f.filename))
            f.save(in_path)

            wav_path = os.path.join(work, f"{uuid.uuid4().hex}.wav")
            # Convert (audio or video) -> wav
            to_wav_16k_mono(in_path, wav_path)

            # Transcribe
            segments, info = model.transcribe(
                wav_path,
                vad_filter=True,
                beam_size=5,
                word_timestamps=False,
                condition_on_previous_text=True,
            )

            text = " ".join(s.text.strip() for s in segments).strip()
            prob = float(getattr(info, "language_probability", 0.0))
            lang = (getattr(info, "language", None) or "en").lower()

            return jsonify(text=text, language=lang, prob=prob)

        finally:
            shutil.rmtree(work, ignore_errors=True)

    except subprocess.CalledProcessError as e:
        log.exception("FFmpeg failed")
        return jsonify(error="FFmpeg failed to decode the file. Is the codec supported?"), 400
    except Exception as e:
        log.exception("Transcription error")
        return jsonify(error=f"Server error during transcription: {type(e).__name__}"), 500

# --- Run ----------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
