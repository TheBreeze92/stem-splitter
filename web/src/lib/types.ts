export type StemName = "vocals" | "drums" | "bass" | "melody";

export const STEM_NAMES: StemName[] = ["vocals", "drums", "bass", "melody"];

export type JobState = "queued" | "running" | "done" | "error";

export interface StatusResponse {
  job_id: string;
  state: JobState;
  stage: string;
  progress: number;
  queue_position: number;
  elapsed_s: number;
  error: string | null;
  // Best-effort musical analysis, filled in as the job finishes. Either can
  // stay null if detection failed, so every consumer has to handle absence.
  bpm: number | null;
  key: string | null;
}

export type AppState = "idle" | "uploading" | "processing" | "results" | "error";

export interface StemAsset {
  url: string;
  blob: Blob;
  ext: "wav" | "mp3";
}
