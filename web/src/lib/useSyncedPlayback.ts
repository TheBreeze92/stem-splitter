"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEM_NAMES, StemName } from "./types";

// Four <audio> elements, one shared transport. Play/pause/seek act on all
// four together so they stay in sync. `selected` is the set of stems the
// user has isolated: empty means the full mix plays, one or more means only
// those play, muting rather than stopping the rest so nothing loses sync.
export function useSyncedPlayback() {
  const refs = useRef<Partial<Record<StemName, HTMLAudioElement>>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selected, setSelected] = useState<Set<StemName>>(new Set());
  const [volumes, setVolumes] = useState<Record<StemName, number>>({
    vocals: 1,
    drums: 1,
    bass: 1,
    melody: 1,
  });

  const leaderName: StemName = "vocals";
  const leaderCleanupRef = useRef<(() => void) | null>(null);

  // The device shell mounts once for the whole app lifetime, long before any
  // <audio> element exists (those only appear once a track finishes). A
  // mount-time effect would miss them, so the leader's listeners attach
  // directly when its ref actually shows up, and detach when it goes away.
  const attachLeader = useCallback((el: HTMLAudioElement) => {
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      STEM_NAMES.forEach((n) => refs.current[n]?.pause());
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnded);
    if (el.readyState >= 1) onMeta();
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  // One cached callback per stem name, so the <audio ref={...}> identity is
  // stable across re-renders. Returning a fresh closure per call here would
  // make React tear down and re-fire the ref on every render (this hook's
  // own state updates included), which looked like the leader element
  // unmounting every ~250ms and reset playback state mid-playback.
  const registerCallbacksRef = useRef<Partial<Record<StemName, (el: HTMLAudioElement | null) => void>>>({});

  const registerRef = useCallback(
    (name: StemName) => {
      const cached = registerCallbacksRef.current[name];
      if (cached) return cached;

      const callback = (el: HTMLAudioElement | null) => {
        if (el) {
          refs.current[name] = el;
          if (name === leaderName) {
            leaderCleanupRef.current?.();
            leaderCleanupRef.current = attachLeader(el);
          }
        } else {
          delete refs.current[name];
          if (name === leaderName) {
            leaderCleanupRef.current?.();
            leaderCleanupRef.current = null;
            setCurrentTime(0);
            setDuration(0);
            setIsPlaying(false);
            setSelected(new Set());
          }
        }
      };
      registerCallbacksRef.current[name] = callback;
      return callback;
    },
    [attachLeader]
  );

  // Apply volume + selection mute to every element whenever either changes.
  useEffect(() => {
    STEM_NAMES.forEach((name) => {
      const el = refs.current[name];
      if (!el) return;
      el.volume = volumes[name];
      el.muted = selected.size > 0 && !selected.has(name);
    });
  }, [volumes, selected]);

  const togglePlay = useCallback(() => {
    const willPlay = !isPlaying;
    STEM_NAMES.forEach((name) => {
      const el = refs.current[name];
      if (!el) return;
      if (willPlay) el.play().catch(() => {});
      else el.pause();
    });
    setIsPlaying(willPlay);
  }, [isPlaying]);

  const seek = useCallback((t: number) => {
    STEM_NAMES.forEach((name) => {
      const el = refs.current[name];
      if (el) el.currentTime = t;
    });
    setCurrentTime(t);
  }, []);

  const setVolume = useCallback((name: StemName, v: number) => {
    setVolumes((prev) => ({ ...prev, [name]: v }));
  }, []);

  const toggleStem = useCallback((name: StemName) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      registerRef,
      isPlaying,
      togglePlay,
      currentTime,
      duration,
      seek,
      volumes,
      setVolume,
      selected,
      toggleStem,
    }),
    [registerRef, isPlaying, togglePlay, currentTime, duration, seek, volumes, setVolume, selected, toggleStem]
  );
}
