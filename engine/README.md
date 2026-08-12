---
title: Stem Splitter Engine
emoji: 🎚️
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Stem Splitter engine

FastAPI + Demucs (htdemucs). Takes an MP3/WAV upload or a YouTube link, returns 4 real stems:
vocals, drums, bass, and melody (htdemucs's "other" stem: guitars, keys, synths). Single-worker
queue, 50MB / 8 minute caps, 5-job queue depth cap, jobs deleted after all stems are downloaded or
a 60 minute TTL, whichever comes first. No persistent storage.

Not meant to be browsed directly, this is the API the stem-splitter web app talks to.

- `GET /health`
- `POST /separate` (multipart file upload)
- `POST /separate-from-url` (`{url}`, YouTube link)
- `GET /status/{job_id}`
- `GET /input/{job_id}` (the original track, for listen-while-processing)
- `GET /stem/{job_id}/{vocals|drums|bass|melody}`
