"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";
import { createRoom } from "@/features/partners/rooms";
import { JoinRoomModal } from "@/features/partners/WalkPartnersCard";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { roomsEnabled } from "@/lib/roomsApi";
import { modeTitle } from "@/lib/walk";
import type { WalkMode } from "@/state/types";
import { openModal, showToast } from "@/state/ui";
import { launchWalk, setMode } from "./actions";

// Challenge first: it's the one with the most to it.
const MODES: { mode: WalkMode; icon: IconName }[] = [
  { mode: "guided", icon: "timer" },
  { mode: "casual", icon: "lens" },
];

/**
 * The floating + button, shown while no walk is open. Tapping it offers a room
 * for your walk partners (make or join one), then the two walk modes; picking
 * one opens that walk's brief.
 */
export function QuickStart() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  async function room() {
    if (busy) return;
    setBusy(true);
    const problem = await createRoom();
    setBusy(false);
    if (problem) { showToast(problem); return; }
    setOpen(false);
    navigate("share");
  }

  return (
    <>
      {open && <div className="walk-fab-backdrop" onClick={() => setOpen(false)} />}

      <div className="walk-fab-wrap">
        {open && (
          <div className="walk-fab-menu" id="walk-fab-menu">
            {roomsEnabled() && (
              <>
                <button type="button" className="walk-fab-option" disabled={busy} onClick={() => void room()}>
                  <span className="walk-fab-option-icon"><Icon name="share" /></span>
                  <strong>{t("Create Room")}</strong>
                </button>
                <button type="button" className="walk-fab-option" onClick={() => { setOpen(false); openModal(<JoinRoomModal />); }}>
                  <span className="walk-fab-option-icon"><Icon name="user" /></span>
                  <strong>{t("Join Room")}</strong>
                </button>
              </>
            )}
            {MODES.map(({ mode, icon }) => (
              <button key={mode} type="button" className="walk-fab-option" onClick={() => start(mode)}>
                <span className="walk-fab-option-icon"><Icon name={icon} /></span>
                <strong>{modeTitle(mode)}</strong>
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
