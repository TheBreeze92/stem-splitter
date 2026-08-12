// The engine is a separate Hugging Face Space. The browser talks to it
// directly (not through a Next.js API route) because Vercel serverless
// functions cap request bodies around 4.5MB and our upload limit is 50MB.
export const ENGINE_URL = (process.env.NEXT_PUBLIC_ENGINE_URL || "").replace(/\/$/, "");

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_DURATION_S = 8 * 60;
export const ALLOWED_EXTENSIONS = [".mp3", ".wav"];
export const POLL_INTERVAL_MS = 1500;

// The engine's Hugging Face Space cannot reliably reach youtube.com (confirmed:
// identical yt-dlp lookup works instantly from a normal connection, fails
// consistently from the Space). Off by default in production until the engine
// moves somewhere with normal outbound access; on by default everywhere else,
// since it works fine locally. Flip per-deployment via
// NEXT_PUBLIC_YOUTUBE_AVAILABLE=false, no code change needed.
export const YOUTUBE_AVAILABLE = process.env.NEXT_PUBLIC_YOUTUBE_AVAILABLE !== "false";
