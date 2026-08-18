"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_EXTENSIONS,
  ENGINE_URL,
  MAX_BYTES,
  POLL_INTERVAL_MS,
} from "./config";
import { AppState, STEM_NAMES, StatusResponse, StemAsset, StemName } from "./types";

function extOf(filename: string) {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

// trackName ends up as a zip entry path and a download filename, both driven
// by the uploaded file's own name, so path separators and control characters
// get stripped before it's used anywhere.
function sanitizeTrackName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "-")
    .replace(/[\x00-\x1f]/g, "")
    .trim();
  return cleaned || "track";
}

// Mobile browsers routinely discard a backgrounded tab and reload it fresh
// when you switch back, which wiped all in-memory state (the whole app
// reset to idle mid-split). This is the fix: the active job survives in
// localStorage, and on load we check for one and resume it from the engine
// rather than starting over. Jobs live server-side for up to an hour (or
// until all stems are downloaded), so resuming just means re-polling/
// re-fetching, not re-uploading.
const STORAGE_KEY = "stemsplitter:job";

interface PersistedJob {
  job_id: string;
  trackName: string;
}

function persistJob(job: PersistedJob) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // localStorage can be unavailable (private browsing, quota); losing
    // resume-on-reload is a minor degradation, not worth failing the upload.
  }
}

function readPersistedJob(): PersistedJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.job_id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearPersistedJob() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Thrown only for network-level failures, not for the engine returning an
// HTTP error. That distinction is what lets the retry loop below wait out a
// cold HF Space without also retrying a real rejection (bad URL, private
// video) that would never succeed on a second try.
class EngineUnreachableError extends Error {}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A free Hugging Face Space can take the best part of a minute to wake from
// cold. Rather than surface "could not reach the engine" the instant a single
// network call fails, retry with backoff for a while first. `onWaiting` lets
// the caller reflect that as progress instead of an error.
const COLD_START_RETRY_DELAYS_MS = [0, 3000, 7000, 15000, 30000];

async function withColdStartRetry<T>(
  attempt: () => Promise<T>,
  onWaiting: () => void
): Promise<T> {
  for (let i = 0; i < COLD_START_RETRY_DELAYS_MS.length; i++) {
    if (i > 0) {
      onWaiting();
      await sleep(COLD_START_RETRY_DELAYS_MS[i]);
    }
    try {
      return await attempt();
    } catch (err) {
      if (!(err instanceof EngineUnreachableError) || i === COLD_START_RETRY_DELAYS_MS.length - 1) {
        throw err;
      }
    }
  }
  throw new EngineUnreachableError("unreachable");
}

export function validateFile(file: File): string | null {
  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported format "${ext || "unknown"}". Use MP3 or WAV.`;
  }
  if (file.size > MAX_BYTES) {
    return `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB. 50MB max in V1.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

export function useSplitter() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [trackName, setTrackName] = useState<string>("");
  const [uploadPct, setUploadPct] = useState(0);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stems, setStems] = useState<Partial<Record<StemName, StemAsset>>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [engineWarm, setEngineWarm] = useState<boolean | null>(null);
  const [sourceFile, setSourceFile] = useState<File | Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stemsRef = useRef(stems);
  useEffect(() => {
    stemsRef.current = stems;
  }, [stems]);
  const previewUrlRef = useRef(previewUrl);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Wake the free Space the moment the page loads, before the user has even
  // picked a file. It sleeps after inactivity, this hides the cold start for
  // the common case. A few retries here, not just one shot, since a truly
  // cold Space can take a while before it even answers /health.
  useEffect(() => {
    if (!ENGINE_URL) return;
    let cancelled = false;
    const PING_DELAYS_MS = [0, 2000, 5000, 10000];
    (async () => {
      for (const delay of PING_DELAYS_MS) {
        if (cancelled) return;
        if (delay > 0) await sleep(delay);
        try {
          const r = await fetch(`${ENGINE_URL}/health`);
          if (!cancelled && r.ok) {
            setEngineWarm(true);
            return;
          }
        } catch {
          // keep trying, a cold Space refuses connections before it's up
        }
      }
      if (!cancelled) setEngineWarm(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const revokeStems = useCallback(() => {
    Object.values(stemsRef.current).forEach((s) => s && URL.revokeObjectURL(s.url));
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const reset = useCallback(() => {
    clearPoll();
    revokeStems();
    revokePreview();
    clearPersistedJob();
    setAppState("idle");
    setTrackName("");
    setUploadPct(0);
    setStatus(null);
    setStems({});
    setErrorMessage(null);
    setSourceFile(null);
    setPreviewUrl(null);
  }, [clearPoll, revokeStems, revokePreview]);

  const fail = useCallback(
    (message: string) => {
      clearPoll();
      setErrorMessage(message);
      setAppState("error");
    },
    [clearPoll]
  );

  const fetchStems = useCallback(
    async (jobId: string) => {
      try {
        const entries = await Promise.all(
          STEM_NAMES.map(async (name) => {
            const res = await fetch(`${ENGINE_URL}/stem/${jobId}/${name}`);
            if (!res.ok) throw new Error(`Could not fetch the ${name} stem.`);
            const blob = await res.blob();
            const ext: "wav" | "mp3" = blob.type.includes("mpeg") ? "mp3" : "wav";
            return [name, { url: URL.createObjectURL(blob), blob, ext }] as const;
          })
        );
        setStems(Object.fromEntries(entries));
        setAppState("results");
      } catch {
        clearPersistedJob();
        fail("The stems finished but could not be downloaded. Try again.");
      }
    },
    [fail]
  );

  const pollStatus = useCallback(
    (jobId: string) => {
      clearPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${ENGINE_URL}/status/${jobId}`);
          if (!res.ok) throw new Error("status check failed");
          const data: StatusResponse = await res.json();
          setStatus(data);
          if (data.state === "done") {
            clearPoll();
            fetchStems(jobId);
          } else if (data.state === "error") {
            clearPersistedJob();
            fail(data.error || "Separation failed. Try again.");
          }
        } catch {
          fail("Lost contact with the engine. Try again.");
        }
      }, POLL_INTERVAL_MS);
    },
    [clearPoll, fail, fetchStems]
  );

  const resumeJob = useCallback(
    async (jobId: string, savedTrackName: string) => {
      if (!ENGINE_URL) return;

      setTrackName(savedTrackName);
      setAppState("processing");
      setStatus({
        job_id: jobId,
        state: "queued",
        stage: "restoring your session",
        progress: 0,
        queue_position: 1,
        elapsed_s: 0,
        error: null,
        bpm: null,
        key: null,
      });

      // Best-effort: re-fetch the original track for the waveform/preview
      // player. If this fails, the split itself still resumes fine, the
      // waveform just falls back to the flat placeholder line.
      fetch(`${ENGINE_URL}/input/${jobId}`)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob) setPreviewUrl(URL.createObjectURL(blob));
          if (blob) setSourceFile(blob);
        })
        .catch(() => {});

      try {
        const res = await fetch(`${ENGINE_URL}/status/${jobId}`);
        if (!res.ok) {
          clearPersistedJob();
          fail("Your previous session expired. Drop a track to start again.");
          return;
        }
        const data: StatusResponse = await res.json();
        setStatus(data);
        if (data.state === "done") {
          fetchStems(jobId);
        } else if (data.state === "error") {
          clearPersistedJob();
          fail(data.error || "Separation failed. Try again.");
        } else {
          pollStatus(jobId);
        }
      } catch {
        clearPersistedJob();
        fail("Your previous session expired. Drop a track to start again.");
      }
    },
    [fail, fetchStems, pollStatus]
  );

  useEffect(() => {
    const saved = readPersistedJob();
    if (saved) {
      // Deferred to a microtask so resumeJob's setState calls aren't
      // synchronous within the effect body.
      queueMicrotask(() => resumeJob(saved.job_id, saved.trackName));
    }
    // Only ever check once, right when the hook first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setAppState("error");
        return;
      }
      if (!ENGINE_URL) {
        fail("The engine is not configured yet.");
        return;
      }

      const cleanName = sanitizeTrackName(file.name.replace(/\.[^.]+$/, ""));
      setTrackName(cleanName);
      setSourceFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setErrorMessage(null);
      setUploadPct(0);
      setAppState("uploading");

      const form = new FormData();
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${ENGINE_URL}/separate`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText) as { job_id: string };
          persistJob({ job_id: data.job_id, trackName: cleanName });
          setAppState("processing");
          setStatus({
            job_id: data.job_id,
            state: "queued",
            stage: "waiting in queue",
            progress: 0,
            queue_position: 1,
            elapsed_s: 0,
            error: null,
            bpm: null,
            key: null,
          });
          pollStatus(data.job_id);
        } else {
          let message = "Upload failed. Try again.";
          try {
            message = JSON.parse(xhr.responseText).detail || message;
          } catch {
            // ignore, use default
          }
          fail(message);
        }
      };
      xhr.onerror = () => fail("Could not reach the engine. It may be waking up, try again in a moment.");
      xhr.send(form);
    },
    [fail, pollStatus]
  );

  const submitUrl = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;
      if (!ENGINE_URL) {
        fail("The engine is not configured yet.");
        return;
      }

      setTrackName("Fetching video info...");
      setSourceFile(null);
      setPreviewUrl(null);
      setErrorMessage(null);
      setAppState("processing");
      setStatus({
        job_id: "",
        state: "queued",
        stage: "fetching from YouTube",
        progress: 0,
        queue_position: 1,
        elapsed_s: 0,
        error: null,
        bpm: null,
        key: null,
      });

      try {
        const data = await withColdStartRetry(
          async () => {
            let res: Response;
            try {
              res = await fetch(`${ENGINE_URL}/separate-from-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: trimmed }),
              });
            } catch {
              throw new EngineUnreachableError("network");
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(json.detail || "Could not fetch that video. Try again.");
            }
            return json as { job_id: string; title: string };
          },
          () => {
            setStatus((prev) => (prev ? { ...prev, stage: "waking up the engine, hang tight" } : prev));
          }
        );

        const { job_id, title } = data;
        const cleanName = sanitizeTrackName(title || "track");
        setTrackName(cleanName);
        persistJob({ job_id, trackName: cleanName });
        pollStatus(job_id);

        fetch(`${ENGINE_URL}/input/${job_id}`)
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (blob) setPreviewUrl(URL.createObjectURL(blob));
            if (blob) setSourceFile(blob);
          })
          .catch(() => {
            // preview is a nice-to-have, a failure here shouldn't block the job
          });
      } catch (err) {
        fail(
          err instanceof EngineUnreachableError || !(err instanceof Error)
            ? "Could not reach the engine. It may be waking up, try again in a moment."
            : err.message
        );
      }
    },
    [fail, pollStatus]
  );

  useEffect(() => () => {
    clearPoll();
    revokeStems();
    revokePreview();
  }, [clearPoll, revokeStems, revokePreview]);

  return {
    appState,
    trackName,
    uploadPct,
    status,
    stems,
    errorMessage,
    engineWarm,
    sourceFile,
    previewUrl,
    upload,
    submitUrl,
    reset,
  };
}
