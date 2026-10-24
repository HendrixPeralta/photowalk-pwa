"use client";

import { useEffect, useId, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";

export interface FabOption {
  key: string;
  icon: IconName;
  label: string;
  disabled?: boolean;
  /** Runs on tap. `close` folds the menu; an option doing slow work can call it when done. */
  onSelect: (close: () => void) => void;
}

/**
 * The floating + button in the corner, as on Walks and My Themes: tapping it
 * opens a short list of options above it (the + turns into an x), and a tap
 * outside or Escape folds it again.
 */
export function FabMenu({ label, options }: { label: string; options: FabOption[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <div className="walk-fab-backdrop" onClick={close} />}

      <div className="walk-fab-wrap">
        {open && (
          <div className="walk-fab-menu" id={menuId}>
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                className="walk-fab-option"
                disabled={option.disabled}
                onClick={() => option.onSelect(close)}
              >
                <span className="walk-fab-option-icon"><Icon name={option.icon} /></span>
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`walk-fab${open ? " open" : ""}`}
          aria-label={label}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
