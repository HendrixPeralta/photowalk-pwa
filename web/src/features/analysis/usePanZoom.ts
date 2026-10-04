"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { ZOOM_MAX } from "@/lib/analysis/constants";
import { clamp } from "@/lib/util";

interface View { zoom: number; panX: number; panY: number }

type Gesture =
  | { kind: "pan"; startX: number; startY: number; startPanX: number; startPanY: number }
  | { kind: "pinch"; startDist: number; startZoom: number }
  | null;

/**
 * Pinch, scroll-wheel and double-tap zoom, and drag to pan, on the photo.
 * Applied straight to the DOM (a CSS transform on `inner`), so a gesture never
 * re-renders the screen. `onChange` runs after every move, to keep the guide
 * lines one screen pixel wide at any zoom.
 */
export function usePanZoom(
  stackRef: RefObject<HTMLElement | null>,
  innerRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  onChange: () => void,
): { fit: () => void } {
  const view = useRef<View>({ zoom: 1, panX: 0, panY: 0 });
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; });

  const apply = useCallback((zoom: number, panX: number, panY: number) => {
    const stack = stackRef.current;
    const inner = innerRef.current;
    if (!stack || !inner) return;
    const rect = stack.getBoundingClientRect();
    const z = clamp(zoom, 1, ZOOM_MAX);
    // Pan is clamped so the photo always covers the frame.
    const next = {
      zoom: z,
      panX: z === 1 ? 0 : clamp(panX, rect.width * (1 - z), 0),
      panY: z === 1 ? 0 : clamp(panY, rect.height * (1 - z), 0),
    };
    view.current = next;
    inner.style.transform = `translate(${next.panX}px, ${next.panY}px) scale(${next.zoom})`;
    // At 1x a one-finger drag scrolls the page; zoomed in, it pans the photo.
    stack.classList.toggle("zoomed", z > 1);
    onChangeRef.current();
  }, [stackRef, innerRef]);

  useEffect(() => {
    const target = targetRef.current;
    const stack = stackRef.current;
    if (!target || !stack) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: Gesture = null;

    /** Zooms about a point on screen, so whatever is under it stays put. */
    const zoomTo = (clientX: number, clientY: number, zoom: number) => {
      const rect = stack.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const v = view.current;
      const z = clamp(zoom, 1, ZOOM_MAX);
      const cx = (px - v.panX) / v.zoom;
      const cy = (py - v.panY) / v.zoom;
      apply(z, px - cx * z, py - cy * z);
    };

    const down = (e: PointerEvent) => {
      target.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { kind: "pinch", startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startZoom: view.current.zoom };
        return;
      }
      const v = view.current;
      gesture = v.zoom > 1
        ? { kind: "pan", startX: e.clientX, startY: e.clientY, startPanX: v.panX, startPanY: v.panY }
        : null;
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture?.kind === "pinch") {
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomTo((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.startZoom * (dist / gesture.startDist));
      } else if (gesture?.kind === "pan") {
        apply(view.current.zoom, gesture.startPanX + (e.clientX - gesture.startX), gesture.startPanY + (e.clientY - gesture.startY));
      }
    };

    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      try { target.releasePointerCapture?.(e.pointerId); } catch { /* capture already gone */ }
      if (!pointers.size || (gesture?.kind === "pinch" && pointers.size < 2)) gesture = null;
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(e.clientX, e.clientY, view.current.zoom * Math.exp(-e.deltaY * 0.0015));
    };
    const dblclick = (e: MouseEvent) => zoomTo(e.clientX, e.clientY, view.current.zoom > 1 ? 1 : 2);

    target.addEventListener("pointerdown", down);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    // Not passive, so scrolling over the photo zooms it instead of the page.
    target.addEventListener("wheel", wheel, { passive: false });
    target.addEventListener("dblclick", dblclick);
    return () => {
      target.removeEventListener("pointerdown", down);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("wheel", wheel);
      target.removeEventListener("dblclick", dblclick);
    };
  }, [apply, stackRef, targetRef]);

  const fit = useCallback(() => apply(1, 0, 0), [apply]);
  return { fit };
}
