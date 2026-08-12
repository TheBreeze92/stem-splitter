"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { AppState, STEM_NAMES, StatusResponse, StemAsset, StemName } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { YOUTUBE_AVAILABLE } from "@/lib/config";
import { useSyncedPlayback } from "@/lib/useSyncedPlayback";
import { Waveform } from "./Waveform";

type Playback = ReturnType<typeof useSyncedPlayback>;

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2.5v11l9-5.5-9-5.5z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0" strokeLinecap="round" />
      <path d="M12 18v4M9 22h6" strokeLinecap="round" />
    </svg>
  );
}
function DrumIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="7" rx="8" ry="3.5" />
      <path d="M4 7v8c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V7" strokeLinecap="round" />
      <path d="M3 3l3 3.5M21 3l-3 3.5" strokeLinecap="round" />
    </svg>
  );
}
function MelodyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l11-2v13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
function BassIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7" cy="17" r="4" />
      <path d="M10 14.5L18 4M18 4h-4M18 4v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEM_META: Record<StemName, { label: string; Icon: () => React.JSX.Element }> = {
  vocals: { label: "Vocals", Icon: MicIcon },
  drums: { label: "Drums", Icon: DrumIcon },
  bass: { label: "Bass", Icon: BassIcon },
  melody: { label: "Melody", Icon: MelodyIcon },
};

function ScreenIdle({ onSubmitUrl }: { onSubmitUrl: (url: string) => void }) {
  const [showUrlField, setShowUrlField] = useState(false);
  const [url, setUrl] = useState("");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--screen-line)] text-[var(--screen-ink)]">
        <UploadIcon />
      </div>
      <p className="text-sm font-medium text-[var(--screen-ink)]">Drop a track, or tap to choose a file</p>
      <p className="text-xs text-[var(--screen-ink-dim)]">MP3 or WAV, up to 50MB, up to 8 minutes</p>

      {YOUTUBE_AVAILABLE && (
      <div onClick={(e) => e.stopPropagation()}>
        {showUrlField ? (
          <form
            className="mt-1 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) onSubmitUrl(url.trim());
            }}
          >
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a YouTube link"
              autoFocus
              className="w-44 rounded-full border border-[var(--screen-line)] bg-transparent px-3 py-1.5 text-xs text-[var(--screen-ink)] placeholder:text-[var(--screen-ink-dim)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              aria-label="Fetch from YouTube"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]"
            >
              <PlayIcon />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowUrlField(true)}
            className="mt-1 text-xs text-[var(--screen-ink-dim)] underline underline-offset-2 hover:text-[var(--screen-ink)]"
          >
            or paste a YouTube link
          </button>
        )}
      </div>
      )}
    </div>
  );
}

function PreviewControl({ previewUrl }: { previewUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  if (!previewUrl) return null;

  return (
    <div className="mt-1 flex items-center gap-2">
      <audio ref={audioRef} src={previewUrl} onEnded={() => setIsPlaying(false)} />
      <button
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (isPlaying) el.pause();
          else el.play().catch(() => {});
          setIsPlaying(!isPlaying);
        }}
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--screen-line)] text-[var(--screen-ink)]"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="text-xs text-[var(--screen-ink-dim)]">Listen while it processes</span>
    </div>
  );
}

function ScreenUploading({ trackName, pct, previewUrl }: { trackName: string; pct: number; previewUrl: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-[var(--screen-ink-dim)]">Uploading</p>
      <p className="max-w-full truncate text-sm font-medium text-[var(--screen-ink)]">{trackName}</p>
      <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[var(--screen-line)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-[var(--screen-ink-dim)]">{pct}%</p>
      <PreviewControl previewUrl={previewUrl} />
    </div>
  );
}

function ScreenProcessing({
  trackName,
  status,
  previewUrl,
}: {
  trackName: string;
  status: StatusResponse | null;
  previewUrl: string | null;
}) {
  const queued = status?.state === "queued";
  const pct = status?.progress ?? 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-[var(--screen-ink-dim)]">Processing</p>
      <p className="max-w-full truncate text-sm font-medium text-[var(--screen-ink)]">{trackName}</p>
      <p className="text-xs text-[var(--screen-ink-dim)]">
        {queued
          ? `Waiting in queue${status?.queue_position ? `, position ${status.queue_position}` : ""}`
          : status?.stage || "Separating stems"}
      </p>
      <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[var(--screen-line)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${queued ? 6 : Math.max(pct, 6)}%` }}
        />
      </div>
      <p className="text-xs text-[var(--screen-ink-dim)]">{status ? `${Math.round(status.elapsed_s)}s elapsed` : ""}</p>
      <PreviewControl previewUrl={previewUrl} />
    </div>
  );
}

function ScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" onClick={onRetry}>
      <p className="text-xs uppercase tracking-widest text-[var(--accent)]">Something went wrong</p>
      <p className="text-sm text-[var(--screen-ink)]">{message}</p>
      <p className="text-xs text-[var(--screen-ink-dim)]">Tap to try again</p>
    </div>
  );
}

export function DeviceShell({
  appState,
  trackName,
  uploadPct,
  status,
  stems,
  errorMessage,
  sourceFile,
  previewUrl,
  peaks,
  onFile,
  onSubmitUrl,
  onReset,
}: {
  appState: AppState;
  trackName: string;
  uploadPct: number;
  status: StatusResponse | null;
  stems: Partial<Record<StemName, StemAsset>>;
  errorMessage: string | null;
  sourceFile: File | Blob | null;
  previewUrl: string | null;
  peaks: Float32Array | null;
  onFile: (file: File) => void;
  onSubmitUrl: (url: string) => void;
  onReset: () => void;
}) {
  const playback = useSyncedPlayback();
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = appState === "results";

  const openPicker = useCallback(() => {
    if (appState === "idle") inputRef.current?.click();
  }, [appState]);

  const downloadAll = useCallback(async () => {
    if (!ready || zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      STEM_NAMES.forEach((name) => {
        const asset = stems[name];
        if (asset) zip.file(`${trackName} - ${name}.${asset.ext}`, asset.blob);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${trackName} - stems.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }, [ready, zipping, stems, trackName]);

  const fileSizeLabel =
    sourceFile && appState !== "idle" ? `${(sourceFile.size / (1024 * 1024)).toFixed(1)} MB` : null;

  return (
    <div
      className={`w-full max-w-md rounded-[28px] border border-[var(--shell-line)] bg-[var(--shell)] p-3 shadow-[0_20px_40px_var(--shell-shadow)] ${
        appState === "idle" ? "cursor-pointer" : ""
      }`}
      onClick={openPicker}
      onDragOver={(e) => {
        if (appState !== "idle") return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (appState !== "idle") return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />

      {/* Screen */}
      <div
        className="relative h-72 overflow-hidden rounded-2xl border border-[var(--screen-line)] bg-[var(--screen)]"
        style={dragging ? { outline: "2px solid var(--accent)", outlineOffset: "-2px" } : undefined}
      >
        {appState === "idle" && <ScreenIdle onSubmitUrl={onSubmitUrl} />}
        {appState === "uploading" && <ScreenUploading trackName={trackName} pct={uploadPct} previewUrl={previewUrl} />}
        {appState === "processing" && (
          <ScreenProcessing trackName={trackName} status={status} previewUrl={previewUrl} />
        )}
        {appState === "error" && <ScreenError message={errorMessage || "Unknown error."} onRetry={onReset} />}
        {appState === "results" && (
          <ResultsScreen trackName={trackName} stems={stems} playback={playback} peaks={peaks} />
        )}
      </div>

      {/* Status strip */}
      <div className="mt-2 flex h-8 items-center justify-between rounded-lg bg-[var(--screen)] px-3">
        <span className="text-[10px] font-medium text-[var(--screen-ink-dim)]">{fileSizeLabel ?? ""}</span>
        <div className="flex gap-[3px]">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[var(--screen-line)]" />
          ))}
        </div>
      </div>

      {/* Button grid */}
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {STEM_NAMES.map((name) => {
          const { label, Icon } = STEM_META[name];
          const active = playback.selected.has(name);
          return (
            <button
              key={name}
              disabled={!ready}
              onClick={() => playback.toggleStem(name)}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--shell-line)] bg-[var(--bg)] text-[var(--ink)]"
              }`}
            >
              <Icon />
              {label}
            </button>
          );
        })}

        <div className="flex flex-col gap-2">
          <button
            disabled={!ready}
            onClick={playback.togglePlay}
            aria-label={playback.isPlaying ? "Pause" : "Play together"}
            className="flex flex-1 items-center justify-center rounded-xl border border-[var(--shell-line)] bg-[var(--bg)] text-[var(--ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playback.isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            disabled={!ready || zipping}
            onClick={downloadAll}
            aria-label="Download all as zip"
            className="flex flex-1 items-center justify-center rounded-xl border border-[var(--shell-line)] bg-[var(--bg)] text-[var(--ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DownloadIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({
  trackName,
  stems,
  playback,
  peaks,
}: {
  trackName: string;
  stems: Partial<Record<StemName, StemAsset>>;
  playback: Playback;
  peaks: Float32Array | null;
}) {
  return (
    <div className="flex h-full flex-col">
      {STEM_NAMES.map((name) => {
        const asset = stems[name];
        if (!asset) return null;
        return <audio key={name} ref={playback.registerRef(name)} src={asset.url} preload="metadata" />;
      })}

      <div className="flex items-center justify-between px-4 pt-3">
        <span className="max-w-[70%] truncate text-xs font-medium uppercase tracking-wide text-[var(--screen-ink-dim)]">
          {trackName}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${playback.isPlaying ? "bg-[var(--accent)]" : "bg-[var(--screen-line)]"}`} />
      </div>

      <div className="flex-1 px-3 py-2">
        <Waveform peaks={peaks} currentTime={playback.currentTime} duration={playback.duration} onSeek={playback.seek} />
      </div>

      <div className="pb-4 text-center font-mono text-3xl font-semibold text-[var(--screen-ink)]">
        {formatTime(playback.currentTime)}
        <span className="text-[var(--screen-ink-dim)]"> / {formatTime(playback.duration)}</span>
      </div>
    </div>
  );
}
