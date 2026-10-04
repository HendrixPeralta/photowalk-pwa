"use client";

import { useEffect } from "react";
import { useAppStore } from "@/state/appStore";
import { restoreActiveWalk, tickWalk } from "./actions";

/**
 * Keeps an open walk running whichever screen is showing: delivers nudges and
 * ends a guided walk when its time is up. Mounted once, in the app shell.
 */
export function WalkEngine() {
  const running = useAppStore((s) => Boolean(s.activeWalk?.startedAt && !s.activeWalk.pausedAt));

  useEffect(() => {
    restoreActiveWalk();
  }, []);

  useEffect(() => {
    if (!running) return;
    // Background tabs get their timers throttled to about once a minute, so
    // catch up the moment the walk comes back on screen.
    const catchUp = () => { if (document.visibilityState === "visible") tickWalk(); };
    tickWalk();
    const timer = setInterval(() => tickWalk(), 1000);
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("pageshow", catchUp);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("pageshow", catchUp);
    };
  }, [running]);

  return null;
}
