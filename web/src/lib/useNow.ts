"use client";

import { useCallback, useSyncExternalStore } from "react";

// One shared clock per interval, so every display that wants "now" on the
// same beat re-renders together, and a clock only runs while something on
// screen is reading it.

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set(), timer: null };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

/**
 * The current time in epoch ms, updated every `intervalMs` while the
 * component is mounted and `active` is true. Paused, it keeps the last value.
 */
export function useNow(intervalMs: number, active = true): number {
  const subscribe = useCallback((onChange: () => void) => {
    if (!active) return () => {};
    const clock = clockFor(intervalMs);
    clock.listeners.add(onChange);
    if (!clock.timer) {
      // The first reader since the clock last stopped: catch up straight away.
      clock.now = Date.now();
      clock.timer = setInterval(() => {
        clock.now = Date.now();
        clock.listeners.forEach((listener) => listener());
      }, intervalMs);
    }
    return () => {
      clock.listeners.delete(onChange);
      if (!clock.listeners.size && clock.timer) {
        clearInterval(clock.timer);
        clock.timer = null;
      }
    };
  }, [intervalMs, active]);

  return useSyncExternalStore(subscribe, () => clockFor(intervalMs).now, () => 0);
}
