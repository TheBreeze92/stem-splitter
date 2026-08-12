"use client";

import { useEffect, useState } from "react";

const BUCKETS = 200;

interface Result {
  file: Blob | null;
  peaks: Float32Array | null;
}

// Interleaved [min0, max0, min1, max1, ...], one [min,max] pair per bucket.
// Returns null while decoding or once `file` no longer matches the last
// decode, so switching tracks never flashes the previous track's waveform.
// Takes a Blob (File extends Blob) so a resumed session, which only has a
// blob re-fetched from the engine rather than the original File object, still
// gets a real waveform instead of the flat placeholder line.
export function useWaveformPeaks(file: Blob | null): Float32Array | null {
  const [result, setResult] = useState<Result>({ file: null, peaks: null });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const ctx = new AudioContext();
        const audioBuffer = await ctx.decodeAudioData(buf);
        const channel = audioBuffer.getChannelData(0);
        const samplesPerBucket = Math.max(1, Math.floor(channel.length / BUCKETS));
        const peaks = new Float32Array(BUCKETS * 2);

        for (let i = 0; i < BUCKETS; i++) {
          const start = i * samplesPerBucket;
          const end = Math.min(start + samplesPerBucket, channel.length);
          let min = 0;
          let max = 0;
          for (let j = start; j < end; j++) {
            const v = channel[j];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          peaks[i * 2] = min;
          peaks[i * 2 + 1] = max;
        }

        await ctx.close();
        if (!cancelled) setResult({ file, peaks });
      } catch {
        if (!cancelled) setResult({ file, peaks: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  return result.file === file ? result.peaks : null;
}
