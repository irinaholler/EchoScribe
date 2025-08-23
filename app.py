import os, tempfile, subprocess, uuid, shutil

from flask import Flask, request, jsonify, send_from_directory, abort
from moviepy import VideoFileClip
from werkzeug.utils import secure_filename
from faster_whisper import WhisperModel

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

# --- moviepy ---
def extract_audio(video_path, out_path="temp_audio.wav"):
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(out_path)
    return out_path


# moviepy 512 MB cap; adjust as you like
app.config["MAX_CONTENT_LENGTH"] = 512 * 1024 * 1024

ALLOWED_AUDIO = {".wav",".mp3",".m4a",".aac",".flac",".ogg",".opus",".webm"}
ALLOWED_VIDEO = {".mp4",".mov",".mkv",".avi",".webm",".m4v"}
ALLOWED = ALLOWED_AUDIO | ALLOWED_VIDEO

# load whisper once
model = WhisperModel("base", device="cpu")  # change to your model/device

def run_ffmpeg_extract(in_path, out_wav):
    # mono 16k wav for Whisper; fast and stable
    cmd = [
        "ffmpeg", "-y", "-i", in_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        out_wav
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, check=True)

@app.errorhandler(413)
def too_large(_):
    return jsonify(error="File too large (over limit)."), 413

@app.post("/api/transcribe")
def api_transcribe():
    if "audio" not in request.files:
        return jsonify(error="No file field 'audio'"), 400

    f = request.files["audio"]
    if f.filename == "":
        return jsonify(error="Empty filename"), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED:
        return jsonify(error=f"Unsupported file type: {ext}"), 400

    # Work in an isolated temp dir
    work = tempfile.mkdtemp(prefix="echoscribe_")
    in_path = os.path.join(work, secure_filename(f.filename))
    f.save(in_path)

    try:
        # If it's video, extract audio; if it's audio, still normalize to wav 16k
        out_wav = os.path.join(work, f"{uuid.uuid4().hex}.wav")
        run_ffmpeg_extract(in_path, out_wav)

        # Transcribe (turn off VAD for music completeness; adjust as needed)
        segments, info = model.transcribe(
            out_wav,
            vad_filter=False,
            beam_size=5,
            condition_on_previous_text=True,
            word_timestamps=False,
        )
        text = "".join(s.text for s in segments).strip()

        # language probability: info.language_probability may be None for some versions
        prob = float(info.language_probability) if getattr(info, "language_probability", None) else None

        return jsonify(
            text=text,
            language=(info.language or "en"),
            prob=prob
        )

    except subprocess.CalledProcessError:
        return jsonify(error="FFmpeg failed to decode the file. Is the video/audio corrupt or codec unsupported?"), 400
    except Exception as e:
        # log e in your console
        print("Transcription error:", e)
        return jsonify(error="Server error during transcription."), 500
    finally:
        shutil.rmtree(work, ignore_errors=True)

if __name__ == "__main__":
    app.run(debug=True)
