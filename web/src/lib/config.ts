export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_DURATION_S = 5 * 60;
export const ALLOWED_EXTENSIONS = [".mp3", ".wav"];

// YouTube needs a server, and the free hosts can't reach it. The splitting now runs in the
// visitor's browser, so there is no YouTube option. The UI code is kept, switched off here.
export const YOUTUBE_AVAILABLE = false;
