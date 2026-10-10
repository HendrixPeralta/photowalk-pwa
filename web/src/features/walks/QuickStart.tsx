"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";
import { t } from "@/lib/i18n/core";
import { modeInfo } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import type { WalkMode } from "@/state/types";
import { openModal } from "@/state/ui";
import { launchWalk, setMode } from "./actions";

const MODES: { mode: WalkMode; icon: IconName }[] = [
  { mode: "casual", icon: "lens" },
  { mode: "guided", icon: "timer" },
];

function ModeInfoModal() {
  return (
    <>
      <h3>{t("Walk Modes")}</h3>
      <p className="muted card-text">
        {t("A photo walk is simply going for a walk to take pictures, with a theme to keep you looking. Pick how much guidance you want.")}
      </p>
      {MODES.map(({ mode }) => {
        const info = modeInfo(mode);
        return (
          <div key={mode}>
            <h4 className="subsection-title">{info.title}</h4>
            <p className="card-text">{info.desc}</p>
            <p className="card-text muted">{info.best}</p>
          </div>
        );
      })}
      <p className="card-text">
        {t("Either way, you can pause at any time, every walk keeps your streak going, and the time you spend shooting counts toward your rewards. You can switch modes before you start a walk.")}
      </p>
    </>
  );
}

/**
 * The floating + button, shown while no walk is open. Tapping it offers the
 * two walk modes; picking one opens that walk's brief.
 */
export function QuickStart() {
  const [open, setOpen] = useState(false);
  const guidedMin = useAppStore((s) => Number(s.profile.guidedDurationMin) || 30);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function start(mode: WalkMode) {
    setOpen(false);
    setMode(mode);
    launchWalk();
  }

  return (
    <>
      {open && <div className="walk-fab-backdrop" onClick={() => setOpen(false)} />}

      <div className="walk-fab-wrap">
        {open && (
          <div className="walk-fab-menu" id="walk-fab-menu">
            <div className="walk-fab-menu-head">
              <span className="label-caps">{t("Pick a Walk Mode")}</span>
              <button
                type="button"
                className="section-help-btn"
                aria-label={t("About walk modes")}
                onClick={() => { setOpen(false); openModal(<ModeInfoModal />); }}
              >
                {t("Learn more")}
              </button>
            </div>
            {MODES.map(({ mode, icon }) => (
              <button key={mode} type="button" className="walk-fab-option" onClick={() => start(mode)}>
                <span className="walk-fab-option-icon"><Icon name={icon} /></span>
                <span className="walk-fab-option-labels">
                  <strong>{modeInfo(mode).title}</strong>
                  <span className="muted">
                    {mode === "guided" ? t("{n}-minute timer with mini-challenges", { n: guidedMin }) : t("No timer, at your own pace")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`walk-fab${open ? " open" : ""}`}
          aria-label={t("Start Photo Walk")}
          aria-expanded={open}
          aria-controls="walk-fab-menu"
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
