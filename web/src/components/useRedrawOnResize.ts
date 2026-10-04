"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Calls `draw` again whenever the element's on-screen width changes: a phone
 * rotating, compare mode splitting the screen, or a hidden panel being shown
 * (a hidden canvas measures zero wide, so it can only be drawn once visible).
 * At most once per frame.
 */
export function useRedrawOnResize(ref: RefObject<HTMLElement | null>, draw: () => void): void {
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => drawRef.current());
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}
