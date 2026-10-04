"use client";

import { t } from "@/lib/i18n/core";
import { rewardTimeline } from "@/lib/rewards";
import { totalActivityHours } from "@/lib/stats";
import { formatHours } from "@/lib/util";
import { useAppStore } from "@/state/appStore";
import { openModal } from "@/state/ui";
import { claimReward } from "./actions";
import { ManageRewardsModal } from "./ManageRewards";

const openManage = () => openModal(<ManageRewardsModal />);

/**
 * Where the lifetime hour total sits between the reward just earned and the
 * next ones due, on one bar.
 */
export function RewardBar() {
  const rewards = useAppStore((s) => s.rewards);
  const total = useAppStore((s) => totalActivityHours(s.activityLog));
  const { now, nowPct, stops, upcoming } = rewardTimeline(rewards, total);

  if (!stops.length) {
    return (
      <div className="reward-bar">
        <p className="empty-state-sm">
          {t("No rewards yet. Pick a treat and set how many hours of shooting it costs, to give your next walks a target.")}
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openManage}>{t("Set a reward")}</button>
      </div>
    );
  }

  const next = stops.find((s) => s.kind === "next");
  // Only the far end of the axis is marked: the reward behind us is the
  // origin, and the ones in between are named in the legend.
  const endStop = stops.filter((s) => s.kind === "next").pop();
  // Any progress at all should read as a visible nub rather than a hairline
  // the track's rounded cap swallows; the 2% floor also keeps the handle clear
  // of the track's left end.
  const fillPct = upcoming ? (nowPct > 0 ? Math.max(nowPct, 2) : 0) : 100;
  const shot = t("{hours} shot", { hours: formatHours(now) });

  return (
    <div className="reward-bar">
      <div className="reward-bar-head">
        <span className="reward-bar-now">{shot}</span>
        <span className="muted">
          {next ? t("{title} in {hours}", { title: next.title, hours: next.remaining ?? "" }) : t("Every reward earned. Set a new one!")}
        </span>
      </div>
      <div className="reward-bar-track">
        <div className="reward-bar-fill" style={{ width: `${fillPct}%` }} />
        {endStop && <span className="reward-bar-mark" style={{ left: `${endStop.pct}%` }} title={endStop.title} />}
        {/* The handle rides the end of the fill; with nothing banked there is no handle. */}
        {fillPct > 0 && <span className="reward-bar-handle" style={{ left: `${fillPct}%` }} title={shot} />}
      </div>
      <ul className="reward-bar-legend">
        {stops.map((s, i) => (
          <li key={s.id ?? `next-${i}`} className={`reward-leg${s.kind === "earned" ? " reward-leg-done" : ""}`}>
            <span className="reward-leg-label">{s.label}</span>
            <span className="reward-leg-title">{s.title}</span>
            <span className="reward-leg-note">{s.note}</span>
            {s.ready && s.id && (
              <button type="button" className="btn btn-accent btn-sm" onClick={() => claimReward(s.id!)}>{t("Claim")}</button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" onClick={openManage}>{t("Manage rewards")}</button>
    </div>
  );
}
