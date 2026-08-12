"""
Stem Splitter engine.

A small FastAPI service that wraps the Demucs (htdemucs) model. It takes an
uploaded MP3/WAV (or a YouTube link) and runs separation via the `demucs`
CLI in a single-worker queue, serving back the 4 stems htdemucs produces
natively: vocals, drums, bass, and everything else ("melody" to the client).
Every job lives under /tmp/jobs/<job_id>/ and is deleted after either a 60
minute TTL or once all four stems have been downloaded, whichever comes
first. Nothing is stored long-term.
"""

import asyncio
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

JOBS_ROOT = Path("/tmp/jobs")
JOBS_ROOT.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 50 * 1024 * 1024  # 50MB, matches the PRD limit
MAX_DURATION_S = 8 * 60  # 8 minute cap, bounds worst-case CPU time on free hardware
TTL_SECONDS = 60 * 60  # delete abandoned jobs after 1 hour
ALLOWED_EXTENSIONS = {".mp3", ".wav"}
STEM_NAMES = ("vocals", "drums", "bass", "melody")
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"}
# Caps worst-case in-flight disk use to MAX_QUEUE_DEPTH * MAX_BYTES, since the
# sweeper only runs every 5 minutes and the single worker processes one at a
# time, uploads alone could otherwise queue faster than either clears them.
MAX_QUEUE_DEPTH = 5

# Explicit origins only. Add the production domain here once it exists, or
# set ALLOWED_ORIGIN_EXTRA as a Space repo variable without rebuilding the image.
import os

_extra_origin = os.environ.get("ALLOWED_ORIGIN_EXTRA", "").strip()
ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]
if _extra_origin:
    ALLOWED_ORIGINS.append(_extra_origin)

app = FastAPI(title="stem-splitter-engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Job state
# ---------------------------------------------------------------------------

class Job:
    def __init__(self, job_id: str, work_dir: Path, output_ext: str):
        self.job_id = job_id
        self.work_dir = work_dir
        self.output_ext = output_ext  # "wav" or "mp3", matches the upload
        self.state = "queued"  # queued | running | done | error
        self.stage = "waiting in queue"
        self.progress = 0  # 0-100, within the current stage
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.finished_at: Optional[float] = None
        self.downloaded = {name: False for name in STEM_NAMES}

    def to_status(self, queue_position: int) -> dict:
        return {
            "job_id": self.job_id,
            "state": self.state,
            "stage": self.stage,
            "progress": self.progress,
            "queue_position": queue_position,
            "elapsed_s": round(time.time() - self.created_at, 1),
            "error": self.error,
        }


JOBS: dict[str, Job] = {}
QUEUE_ORDER: list[str] = []  # job_ids waiting or running, FIFO
QUEUE_LOCK = asyncio.Lock()


def queue_position_of(job_id: str) -> int:
    """1-indexed position, 0 once it has started running."""
    try:
        idx = QUEUE_ORDER.index(job_id)
    except ValueError:
        return 0
    return idx + 1


def check_queue_capacity():
    if len(QUEUE_ORDER) >= MAX_QUEUE_DEPTH:
        raise HTTPException(429, "Too many tracks queued right now. Try again in a minute.")


async def enqueue_job(job_id: str, work_dir: Path, output_ext: str) -> None:
    job = Job(job_id, work_dir, output_ext)
    JOBS[job_id] = job
    async with QUEUE_LOCK:
        QUEUE_ORDER.append(job_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ffprobe_duration_s(path: Path) -> Optional[float]:
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            capture_output=True, text=True, timeout=15,
        )
        return float(out.stdout.strip())
    except Exception:
        return None


def is_youtube_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host in YOUTUBE_HOSTS


PROGRESS_RE = re.compile(r"(\d{1,3})%\|")


DEMUCS_DEVICE = os.environ.get("DEMUCS_DEVICE", "cpu")
DEMUCS_TIMEOUT_S = 600  # generous vs. the measured ~0.3x realtime on CPU for an 8min-capped input


async def run_separation(job: Job, input_path: Path):
    out_dir = job.work_dir / "separated"
    out_dir.mkdir(exist_ok=True)

    cmd = ["demucs", "-n", "htdemucs", "--shifts", "0", "-d", DEMUCS_DEVICE]
    if DEMUCS_DEVICE == "cpu":
        cmd += ["-j", "2"]
    cmd += ["-o", str(out_dir), str(input_path)]
    job.stage = "separating stems"
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )

    async def read_stream():
        assert proc.stderr is not None
        while True:
            line = await proc.stderr.readline()
            if not line:
                break
            text = line.decode(errors="ignore")
            m = PROGRESS_RE.search(text)
            if m:
                job.progress = min(int(m.group(1)), 99)

    async def stream_then_wait() -> int:
        await read_stream()
        return await proc.wait()

    try:
        returncode = await asyncio.wait_for(stream_then_wait(), timeout=DEMUCS_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("Separation timed out.")

    if returncode != 0:
        raise RuntimeError(f"demucs exited with code {returncode}")

    track_stem_name = input_path.stem
    model_dir = out_dir / "htdemucs" / track_stem_name
    vocals_wav = model_dir / "vocals.wav"
    drums_wav = model_dir / "drums.wav"
    bass_wav = model_dir / "bass.wav"
    other_wav = model_dir / "other.wav"
    for p in (vocals_wav, drums_wav, bass_wav, other_wav):
        if not p.exists():
            raise RuntimeError(f"expected output missing: {p.name}")

    # htdemucs already separates bass from everything else, no mixing needed.
    # "melody" is just our label for its "other" stem (guitars/keys/synths).
    final_paths = {"vocals": vocals_wav, "drums": drums_wav, "bass": bass_wav, "melody": other_wav}
    job.progress = 99

    if job.output_ext == "mp3":
        job.stage = "encoding mp3"
        for name, src in list(final_paths.items()):
            dst = model_dir / f"{name}.mp3"
            r = subprocess.run(
                ["ffmpeg", "-y", "-i", str(src), "-codec:a", "libmp3lame", "-q:a", "2", str(dst)],
                capture_output=True, timeout=120,
            )
            if r.returncode == 0 and dst.exists():
                final_paths[name] = dst

    job.stem_files = final_paths  # type: ignore[attr-defined]
    job.progress = 100
    job.stage = "done"


async def worker_loop():
    while True:
        await asyncio.sleep(0.5)
        async with QUEUE_LOCK:
            if not QUEUE_ORDER:
                continue
            job_id = QUEUE_ORDER[0]
        job = JOBS.get(job_id)
        if job is None:
            async with QUEUE_LOCK:
                if QUEUE_ORDER and QUEUE_ORDER[0] == job_id:
                    QUEUE_ORDER.pop(0)
            continue

        job.state = "running"
        input_path = next(job.work_dir.glob("input.*"))
        try:
            await run_separation(job, input_path)
            job.state = "done"
        except Exception as exc:  # noqa: BLE001 - report to the caller, keep worker alive
            job.state = "error"
            print(f"[job {job_id}] separation failed: {exc}")  # full detail stays server-side
            job.error = "Separation failed. Try a different file."
        finally:
            job.finished_at = time.time()
            async with QUEUE_LOCK:
                if QUEUE_ORDER and QUEUE_ORDER[0] == job_id:
                    QUEUE_ORDER.pop(0)


async def sweeper_loop():
    while True:
        await asyncio.sleep(5 * 60)
        now = time.time()
        for job_id, job in list(JOBS.items()):
            age = now - job.created_at
            all_downloaded = job.state == "done" and all(job.downloaded.values())
            if age > TTL_SECONDS or all_downloaded:
                shutil.rmtree(job.work_dir, ignore_errors=True)
                JOBS.pop(job_id, None)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(worker_loop())
    asyncio.create_task(sweeper_loop())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"ok": True, "model": "htdemucs", "queue_depth": len(QUEUE_ORDER)}


@app.post("/separate")
async def separate(file: UploadFile):
    check_queue_capacity()

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format '{ext or 'unknown'}'. Use MP3 or WAV.")

    job_id = str(uuid.uuid4())
    work_dir = JOBS_ROOT / job_id
    work_dir.mkdir(parents=True)
    input_path = work_dir / f"input{ext}"

    size = 0
    with open(input_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                f.close()
                shutil.rmtree(work_dir, ignore_errors=True)
                raise HTTPException(413, "File is over the 50MB limit.")
            f.write(chunk)

    if size == 0:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, "Empty file.")

    duration = ffprobe_duration_s(input_path)
    if duration is None:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, "Could not read this file. It may be corrupt or not a real audio file.")
    if duration > MAX_DURATION_S:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, f"Track is too long ({int(duration)}s). 8 minute max in V1.")

    output_ext = "mp3" if ext == ".mp3" else "wav"
    await enqueue_job(job_id, work_dir, output_ext)
    return {"job_id": job_id}


class SeparateFromUrlBody(BaseModel):
    url: str


@app.post("/separate-from-url")
async def separate_from_url(body: SeparateFromUrlBody):
    check_queue_capacity()

    url = body.url.strip()
    if not is_youtube_url(url):
        raise HTTPException(400, "That doesn't look like a YouTube link.")

    def fetch_info():
        opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await asyncio.to_thread(fetch_info)
    except yt_dlp.utils.DownloadError:
        raise HTTPException(400, "Could not fetch that video. It may be private, age-restricted, or removed.")

    if info.get("entries"):
        raise HTTPException(400, "That's a playlist. Paste a link to a single video.")

    duration = info.get("duration")
    if not duration:
        raise HTTPException(400, "Could not read that video's length.")
    if duration > MAX_DURATION_S:
        raise HTTPException(400, f"Video is too long ({int(duration)}s). 8 minute max in V1.")

    title = info.get("title") or "track"

    job_id = str(uuid.uuid4())
    work_dir = JOBS_ROOT / job_id
    work_dir.mkdir(parents=True)

    def download():
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": "bestaudio/best",
            "outtmpl": str(work_dir / "input.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

    try:
        await asyncio.to_thread(download)
    except yt_dlp.utils.DownloadError:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, "Could not download that video's audio.")

    input_path = work_dir / "input.mp3"
    if not input_path.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(500, "Download finished but the audio file is missing.")

    await enqueue_job(job_id, work_dir, "mp3")
    return {"job_id": job_id, "title": title}


@app.get("/status/{job_id}")
async def status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job. It may have expired.")
    return job.to_status(queue_position_of(job_id))


@app.get("/input/{job_id}")
async def input_file(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job. It may have expired.")
    try:
        path = next(job.work_dir.glob("input.*"))
    except StopIteration:
        raise HTTPException(404, "Input file missing.")
    media_type = "audio/mpeg" if path.suffix == ".mp3" else "audio/wav"
    return FileResponse(path, media_type=media_type)


@app.get("/stem/{job_id}/{name}")
async def stem(job_id: str, name: str):
    if name not in STEM_NAMES:
        raise HTTPException(404, "Unknown stem name.")
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job. It may have expired.")
    if job.state != "done":
        raise HTTPException(409, f"Job is not finished yet (state: {job.state}).")

    stem_files: dict = getattr(job, "stem_files", {})
    path = stem_files.get(name)
    if path is None or not Path(path).exists():
        raise HTTPException(404, "Stem file missing.")

    job.downloaded[name] = True
    filename = f"stem-splitter - {name}{Path(path).suffix}"
    media_type = "audio/mpeg" if Path(path).suffix == ".mp3" else "audio/wav"
    return FileResponse(path, media_type=media_type, filename=filename)
