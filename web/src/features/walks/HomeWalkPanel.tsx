"use client";

import { t } from "@/lib/i18n/core";
import { useNow } from "@/lib/useNow";
import { clockText, walkClock } from "@/lib/walk";
import type { ActiveWalk } from "@/state/types";
import { finishWalk, openWalkBrief } from "./actions";
import { useWalkTheme } from "./walkUi";

/** The running walk's clock: counting down for guided, up for casual. */
function readout(walk: ActiveWalk, now: number): { timer: string; pct: number } {
  const clock = walkClock(walk, now);
  const totalMs = (walk.durationMin ?? 0) * 60000;
  const guided = walk.mode === "guided" && totalMs > 0;
  const elapsed = clock.phase === "brief" ? 0 : clock.elapsed;
  if (!guided) return { timer: clockText(elapsed), pct: 0 };
  return {
    timer: clockText(totalMs - Math.min(elapsed, totalMs)),
    pct: Math.max(0, Math.min(100, (elapsed / totalMs) * 100)),
  };
}

/**
 * Replaces the launcher while a walk is open, so there is always exactly one
 * place to start and one place to stop.
 */
export function HomeWalkPanel({ walk }: { walk: ActiveWalk }) {
  const theme = useWalkTheme();
  const running = Boolean(walk.startedAt && !walk.pausedAt);
  const now = useNow(1000, running);
  const guided = walk.mode === "guided";
  const { timer, pct } = readout(walk, now);

  return (
    <div className="theme-card walk-panel">
      <div className="walk-panel-head">
        <div className="walk-panel-titles">
          <strong>{theme ? theme.title : t("Walk in progress")}</strong>
          <span className="muted">{guided ? t("Challenge · {n} min", { n: walk.durationMin ?? 0 }) : t("Casual")}</span>
        </div>
        <div className="walk-panel-clock">
          <span className="walk-panel-timer" role="timer">{timer}</span>
          <span className="muted">{guided ? t("left") : t("elapsed")}</span>
        </div>
      </div>
      {guided && (
        <div className="timer-track">
          <div className="timer-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="theme-actions theme-actions-row">
        {theme && (
          <button type="button" className="btn btn-accent btn-block" onClick={openWalkBrief}>
            {guided ? t("Theme & challenges") : t("View theme")}
          </button>
        )}
        <button type="button" className="btn btn-danger-solid btn-block" onClick={() => finishWalk(false)}>
          {t("Stop Walk")}
        </button>
      </div>
    </div>
  );
}
