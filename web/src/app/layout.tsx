import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const youtubeAvailable = process.env.NEXT_PUBLIC_YOUTUBE_AVAILABLE !== "false";

export const metadata: Metadata = {
  title: "Stem Splitter, split any track into vocals, drums, bass, and melody",
  description: youtubeAvailable
    ? "Drop in an MP3 or WAV, or paste a YouTube link. Get vocals, drums, bass, and melody stems back in your browser. Free, no account."
    : "Drop in an MP3 or WAV. Get vocals, drums, bass, and melody stems back in your browser. Free, no account.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
