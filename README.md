Turn your voice (or music) into text. Python, Flask app with Whisper + optional lyrics mode.

# 🎙️ EchoScribe

EchoScribe is a beginner-friendly **Speech-to-Text** project built with **Python, Flask, and Whisper**.  
Start simple with microphone recording or file uploads — then upgrade into **lyrics mode** with Demucs,  
karaoke highlights, or speaker diarization.

✨ Features:

- 🖥️ Web UI with Flask (HTML/CSS/JS frontend)
- 🎤 Record voice or upload audio → transcribe with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- 🔊 Mic recording CLI (`record_transcribe.py`) with optional noise cleaning
- 🎶 Lyrics mode (`lyrics_transcribe.py`): isolate vocals with [Demucs](https://github.com/facebookresearch/demucs) → Whisper
- 📜 Export transcripts as plain text or `.srt`

⚡ Tech stack: `Flask`, `faster-whisper`, `sounddevice`, `scipy`, `demucs`, `FFmpeg`

🔹 Required for MVP (speech → text via web UI + Whisper)

Flask → to run the web server & UI

faster-whisper → the actual STT engine

FFmpeg (system package, not Python) → to convert mic uploads (webm/mp3) into 16k WAV for Whisper

🔹 Useful for CLI mic recording tool

sounddevice → record directly from microphone in Python

scipy → save audio buffers as WAV files

🔹 Needed for lyrics mode (vocals → Whisper)

demucs → separates vocals from music so Whisper can catch lyrics better
⚠️ Heavy dependency: installs PyTorch, large download, slower install.
