"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ALLOWED_EXTENSIONS, MAX_BYTES, MAX_DURATION_S } from "./config";
import { splitInBrowser } from "./browserSplit";
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

export function validateFile(file: File): string | null {
  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported format "${ext || "unknown"}". Use MP3 or WAV.`;
  }
  if (file.size > MAX_BYTES) {
    return `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB. 50MB max.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

export function useSplitter() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [trackName, setTrackName] = useState<string>("");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stems, setStems] = useState<Partial<Record<StemName, StemAsset>>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stemsRef = useRef(stems);
  useEffect(() => {
    stemsRef.current = stems;
  }, [stems]);
  const previewUrlRef = useRef(previewUrl);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  // Bumped on reset so a split that finishes after "Split another track"
  // doesn't overwrite the fresh screen.
  const runRef = useRef(0);

  const revokeStems = useCallback(() => {
    Object.values(stemsRef.current).forEach((s) => s && URL.revokeObjectURL(s.url));
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const reset = useCallback(() => {
    runRef.current++;
    revokeStems();
    revokePreview();
    setAppState("idle");
    setTrackName("");
    setStatus(null);
    setStems({});
    setErrorMessage(null);
    setSourceFile(null);
    setPreviewUrl(null);
  }, [revokeStems, revokePreview]);

  const upload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setAppState("error");
        return;
      }

      const run = ++runRef.current;
      const cleanName = sanitizeTrackName(file.name.replace(/\.[^.]+$/, ""));
      setTrackName(cleanName);
      setSourceFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setErrorMessage(null);
      setAppState("processing");

      setStatus({
        job_id: "",
        state: "running",
        stage: "Preparing to split",
        progress: 0,
        queue_position: 0,
        elapsed_s: 0,
        error: null,
        bpm: null,
        key: null,
      });

      try {
        const blobs = await splitInBrowser(file, MAX_DURATION_S, ({ stage, pct, etaS }) => {
          if (run === runRef.current) setStatus((prev) => (prev ? { ...prev, stage, progress: pct, eta_s: etaS } : prev));
        });
        if (run !== runRef.current) return;
        setStems(
          Object.fromEntries(
            STEM_NAMES.map((name) => [name, { url: URL.createObjectURL(blobs[name]), blob: blobs[name], ext: "wav" as const }])
          )
        );
        setAppState("results");
      } catch (err) {
        if (run !== runRef.current) return;
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong while splitting. Try again, or try a shorter track."
        );
        setAppState("error");
      }
    },
    []
  );

  useEffect(() => () => {
    revokeStems();
    revokePreview();
  }, [revokeStems, revokePreview]);

  return {
    appState,
    trackName,
    uploadPct: 0,
    status,
    stems,
    errorMessage,
    sourceFile,
    previewUrl,
    upload,
    reset,
  };
}
