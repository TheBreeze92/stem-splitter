# Stem Splitter

Free vocals/drums/bass/melody splitter. Upload an MP3/WAV (or paste a YouTube link) and get back
4 separated stems, powered by [Demucs](https://github.com/facebookresearch/demucs) (htdemucs).

No setup, no signup: **https://stemsplitter-two.vercel.app**

That public link talks to a Demucs engine running on a free Hugging Face Space, so it's the
easiest way to try it. Everything below is for running it yourself.

## Run it locally

Two processes: a FastAPI + Demucs engine (`engine/`) and a Next.js web app (`web/`).

### 1. Engine (`engine/`)

Requires Python 3.10+.

```bash
cd engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

First run downloads the htdemucs model (a few hundred MB) and caches it.

`DEMUCS_DEVICE` defaults to `cpu`. On Apple Silicon, don't set it to `mps`: htdemucs hits a real
PyTorch limitation there (`NotImplementedError: Output channels > 65536 not supported at the MPS
device`) and every job will crash. CPU is correct, not a fallback.

### 2. Web app (`web/`)

Requires Node 18+.

```bash
cd web
cp .env.local.example .env.local
# edit .env.local: NEXT_PUBLIC_ENGINE_URL=http://localhost:8000
npm install
npm run dev
```

Open http://localhost:3000.

### macOS shortcut

If you're on a Mac, `start.command` / `stop.command` in the repo root handle both processes for
you (health checks, backgrounds them with nohup, opens the browser). Double-click, or:

```bash
./start.command
./stop.command
```

Logs land in `/tmp/stem-engine.log` and `/tmp/stem-web.log` if something fails to come up.

## Deploying your own engine

The `engine/` folder is a ready-to-push [Hugging Face Space](https://huggingface.co/spaces)
(Docker SDK, see `engine/README.md` for the Space config header). Push it to your own Space, free
CPU tier works, then point `NEXT_PUBLIC_ENGINE_URL` at it and deploy `web/` anywhere that runs
Next.js (Vercel, etc).
