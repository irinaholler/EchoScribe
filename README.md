Turn your voice (or music) into text. Python, Flask app with Whisper + optional lyrics mode.

# 🎙️ EchoScribe

Turn your voice (or music) into text.
A beginner-friendly Speech-to-Text project built with Python, Flask, and Whisper.

Start simple with microphone recording or file uploads — then upgrade into lyrics mode with Demucs,
karaoke highlights, or speaker diarization. Now also includes Live Dictation (real-time speech → text).

✨ Features

🖥️ Web UI with Flask (HTML/CSS/JS frontend)

🎤 Voice → Text: Record mic audio or upload a file → transcribe with faster-whisper

📹 Video → Text: Extract audio from video via ffmpeg → transcribe

📝 Live Dictation (new!): Speak into your mic and see text appear in real time (Web Speech API MVP, offline Whisper streaming planned)

🎶 Lyrics mode: Isolate vocals with Demucs
→ Whisper for lyric transcription

⚡ Visualizer: Animated equalizer while recording

📜 Export: Copy, clear, expand view, or save transcripts as plain text / .srt

🔊 CLI mic tool: Record + transcribe directly from Python

🛠️ Tech Stack

Backend

Flask → web server & API
faster-whisper → Whisper STT engine
FFmpeg → decode/convert mic uploads & video to 16kHz WAV
Werkzeug → safe file uploads

Frontend

HTML + CSS (gaming-inspired UI)
Vanilla JavaScript → mic recording, file uploads, transcription, export
Web Audio API → live input visualizer (equalizer)
Web Speech API → Live Dictation MVP (browser-based speech recognition)

Optional / Future

sounddevice + scipy → CLI mic recorder
demucs (PyTorch) → Lyrics mode (vocal separation)
flask-sock + simple-websocket + numpy + soundfile → Planned Offline Live Dictation (real-time Whisper over WebSockets)
fluent-ffmpeg (Node) → experimental video/audio processing

🔹 Installation

Clone the repo and set up a virtual environment:

git clone https://github.com/irinaholler/EchoScribe.git
cd EchoScribe
python -m venv .venv
source .venv/bin/activate

Install dependencies:
pip install -r requirements.txt

Make sure FFmpeg is installed and available in your system PATH:
ffmpeg -version
(macOS: brew install ffmpeg)

🚀 Run

Start the Flask dev server:
python app.py

Open your browser at:
👉 http://127.0.0.1:5000

📂 Modes

Voice → Text: Upload or record → /stt
Video → Text: Upload video → /video
Live Dictation: Real-time speech → /live
Lyrics → Text: Isolate vocals with Demucs → /lyrics

⚠️ Notes

Live Dictation (MVP) uses the browser’s Web Speech API (requires internet, supported in Chrome/Edge/Safari).
Offline Live Dictation (with faster-whisper streaming) is planned — will require WebSockets & extra Python libs.
Demucs is optional and heavy (PyTorch dependency). Only install if you want Lyrics mode.

📜 License

MIT License — free to use, modify, and learn from.

🔹 Needed for lyrics mode (vocals → Whisper)

demucs → separates vocals from music so Whisper can catch lyrics better
⚠️ Heavy dependency: installs PyTorch, large download, slower install.
