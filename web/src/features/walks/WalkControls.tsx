"use client";

import { Icon } from "@/components/icons/Icon";
import { t } from "@/lib/i18n/core";
import type { ActiveWalk } from "@/state/types";
import { finishWalk, pauseWalk, resumeWalk } from "./actions";

/** Pause or resume (icon only), and finish. On Live Walk, and on Walks while a walk is open. */
export function WalkControls({ walk, className = "" }: { walk: ActiveWalk; className?: string }) {
  const paused = Boolean(walk.pausedAt);
  return (
    <div className={`hud-footer-row ${className}`.trim()}>
      <button
        type="button"
        className="btn btn-primary hud-pause"
        disabled={!walk.startedAt}
        aria-label={paused ? t("Resume Walk") : t("Pause Walk")}
        title={paused ? t("Resume Walk") : t("Pause Walk")}
        onClick={paused ? resumeWalk : pauseWalk}
      >
        <Icon name={paused ? "play" : "pause"} />
      </button>
      <button type="button" className="btn btn-danger-solid" onClick={() => finishWalk(false)}>
        {t("Finish Walk")}
      </button>
    </div>
  );
}
