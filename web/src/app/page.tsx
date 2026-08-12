"use client";

import { DeviceShell } from "@/components/DeviceShell";
import { YOUTUBE_AVAILABLE } from "@/lib/config";
import { useSplitter } from "@/lib/useSplitter";
import { useWaveformPeaks } from "@/lib/useWaveformPeaks";

export default function Home() {
  const {
    appState,
    trackName,
    uploadPct,
    status,
    stems,
    errorMessage,
    sourceFile,
    previewUrl,
    upload,
    submitUrl,
    reset,
  } = useSplitter();
  const peaks = useWaveformPeaks(appState === "results" ? sourceFile : null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-12">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent)]">Stem Splitter</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Split any track into vocals, drums, bass, and melody</h1>
        <p className="mx-auto mt-4 max-w-lg text-[var(--ink-dim)]">
          {YOUTUBE_AVAILABLE
            ? "Drop in an MP3 or WAV, or paste a YouTube link. Get four stems back to play and download, right in your browser. Free, no account."
            : "Drop in an MP3 or WAV. Get four stems back to play and download, right in your browser. Free, no account."}
        </p>
      </header>

      <DeviceShell
        appState={appState}
        trackName={trackName}
        uploadPct={uploadPct}
        status={status}
        stems={stems}
        errorMessage={errorMessage}
        sourceFile={sourceFile}
        previewUrl={previewUrl}
        peaks={peaks}
        onFile={upload}
        onSubmitUrl={submitUrl}
        onReset={reset}
      />

      {(appState === "results" || appState === "error") && (
        <button onClick={reset} className="mt-6 text-sm text-[var(--ink-dim)] underline underline-offset-4 hover:text-[var(--ink)]">
          Split another track
        </button>
      )}

      <footer className="mt-auto pt-16 text-center text-xs text-[var(--ink-dim)]">
        Files are processed in memory and deleted within an hour. Nothing is stored.
      </footer>
    </main>
  );
}
