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
}

export type AppState = "idle" | "uploading" | "processing" | "results" | "error";

export interface StemAsset {
  url: string;
  blob: Blob;
  ext: "wav" | "mp3";
}
