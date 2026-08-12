"use client";

import { useCallback, useEffect, useRef } from "react";

export function Waveform({
  peaks,
  currentTime,
  duration,
  onSeek,
}: {
  peaks: Float32Array | null;
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const style = getComputedStyle(document.documentElement);
    const played = style.getPropertyValue("--screen-ink").trim() || "#f2f2f0";
    const unplayed = style.getPropertyValue("--screen-ink-dim").trim() || "#8a8a90";
    const playhead = style.getPropertyValue("--accent").trim() || "#e0402f";

    if (!peaks || peaks.length === 0) {
      ctx.strokeStyle = unplayed;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const buckets = peaks.length / 2;
    const barWidth = width / buckets;
    const gap = Math.max(0.5, barWidth * 0.25);
    const centerY = height / 2;
    const halfHeight = height / 2 - 2;
    const progressX = duration > 0 ? (currentTime / duration) * width : 0;

    for (let i = 0; i < buckets; i++) {
      const min = peaks[i * 2];
      const max = peaks[i * 2 + 1];
      const x = i * barWidth;
      let barH = (max - min) * halfHeight;
      if (barH < 1.5) barH = 1.5;
      const y = centerY - barH / 2;
      ctx.fillStyle = x < progressX ? played : unplayed;
      ctx.fillRect(x, y, Math.max(1, barWidth - gap), barH);
    }

    ctx.strokeStyle = playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
  }, [peaks, currentTime, duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container || duration <= 0) return;
      const rect = container.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(frac * duration);
    },
    [duration, onSeek]
  );

  return (
    <div
      ref={containerRef}
      className="h-20 w-full cursor-pointer touch-none select-none"
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        seekFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) seekFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
