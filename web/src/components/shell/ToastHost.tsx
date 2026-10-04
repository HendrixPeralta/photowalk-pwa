"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { dismissToast, useToasts, type Toast } from "@/state/ui";

/** The toast stack, above the bottom nav. Lives outside the inert region so it is always read out. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toast-root">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Mount hidden, then show on the next frame so the slide-in transition runs.
    const frame = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => setLeaving(true), toast.duration);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [toast.duration]);

  // Slide out, then drop it. A timer rather than transitionend, which never
  // fires when reduced motion turns the transition off.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismissToast(toast.id), 300);
    return () => clearTimeout(timer);
  }, [leaving, toast.id]);

  return (
    <div className={`toast${shown && !leaving ? " show" : ""}`} role="status">
      <span className="toast-text">{toast.message}</span>
      {/* A toast can sit over the very control you want to tap next, so it can be closed right away. */}
      <button type="button" className="toast-close" aria-label={t("Dismiss")} onClick={() => setLeaving(true)}>×</button>
    </div>
  );
}
