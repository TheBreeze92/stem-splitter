// Runs the whole split on the visitor's own device: no server, no quota.
// The model (~172MB) comes from Hugging Face Hub (file hosting, not a Space)
// and is kept in the browser cache so it's a one-time download.
import type { StemName } from "./types";

const SAMPLE_RATE = 44100;
const MODEL_URL = "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";
const MODEL_BYTES = 172 * 1024 * 1024; // fallback when the CDN hides Content-Length
const CACHE_NAME = "stemsplitter-model-v1";

export interface SplitProgress {
  stage: string;
  pct: number; // 0-100, restarts at 0 for each stage
}

async function loadModel(onProgress: (p: SplitProgress) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(MODEL_URL);
    if (hit) return hit.arrayBuffer();
  } catch {
    // Cache API unavailable (private window); just download every time.
  }

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error("Could not download the splitter. Check your connection and try again.");
  const total = Number(res.headers.get("content-length")) || MODEL_BYTES;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({
      stage: "Downloading the splitter (first visit only, about 170MB)",
      pct: Math.min(99, Math.round((loaded / total) * 100)),
    });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    await cache?.put(MODEL_URL, new Response(bytes.buffer.slice(0)));
  } catch {
    // Storage full or blocked: works now, downloads again next visit.
  }
  return bytes.buffer;
}

async function decodeTrack(file: File) {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    ctx.close();
  }
  return decoded;
}

async function toModelRate(decoded: AudioBuffer) {
  const off = new OfflineAudioContext(2, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return { left: out.getChannelData(0), right: out.getChannelData(1) };
}

function encodeWav(left: Float32Array, right: Float32Array): Blob {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 2, true); // stereo
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 4, true);
  const s16 = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    v.setInt16(o, s16(left[i]), true);
    v.setInt16(o + 2, s16(right[i]), true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function splitInBrowser(
  file: File,
  maxSeconds: number,
  onProgress: (p: SplitProgress) => void
): Promise<Record<StemName, Blob>> {
  const modelBytes = await loadModel(onProgress);

  onProgress({ stage: "Reading your track", pct: 0 });
  const decoded = await decodeTrack(file).catch(() => {
    throw new Error("Could not read that audio file. Try a different MP3 or WAV.");
  });
  if (decoded.duration > maxSeconds) {
    throw new Error(`Track is ${Math.ceil(decoded.duration / 60)} minutes long. ${maxSeconds / 60} minute max.`);
  }
  const { left, right } = await toModelRate(decoded);

  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/ort/"; // copied from node_modules by scripts/copy-ort.mjs
  const { DemucsProcessor } = await import("demucs-web");
  const processor = new DemucsProcessor({
    ort,
    onProgress: ({ progress, currentSegment, totalSegments }: { progress: number; currentSegment: number; totalSegments: number }) =>
      onProgress({ stage: `Splitting your track (part ${currentSegment} of ${totalSegments})`, pct: Math.round(progress * 100) }),
  });
  onProgress({ stage: "Starting the splitter", pct: 0 });
  await processor.loadModel(modelBytes);
  const r = await processor.separate(left, right);

  onProgress({ stage: "Preparing your stems", pct: 99 });
  return {
    vocals: encodeWav(r.vocals.left, r.vocals.right),
    drums: encodeWav(r.drums.left, r.drums.right),
    bass: encodeWav(r.bass.left, r.bass.right),
    melody: encodeWav(r.other.left, r.other.right),
  };
}
