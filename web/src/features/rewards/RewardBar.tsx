"use client";

import { t } from "@/lib/i18n/core";
import { rewardTimeline } from "@/lib/rewards";
import { totalActivityHours } from "@/lib/stats";
import { useAppStore } from "@/state/appStore";
import { openModal } from "@/state/ui";
import { claimReward } from "./actions";
import { ManageRewardsModal } from "./ManageRewards";

const openManage = () => openModal(<ManageRewardsModal />);

/** The reward just earned and the next ones due, each with its own progress bar. */
export function RewardBar() {
  const rewards = useAppStore((s) => s.rewards);
  const total = useAppStore((s) => totalActivityHours(s.activityLog));
  const { stops } = rewardTimeline(rewards, total);

  if (!stops.length) {
    return (
      <div className="reward-bar">
        <RewardTitle />
        <p className="empty-state-sm">
          {t("No rewards yet. Pick a treat and set how many hours of shooting it costs, to give your next walks a target.")}
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openManage}>{t("Set a reward")}</button>
      </div>
    );
  }

  return (
    <div className="reward-bar">
      <RewardTitle />
      <ul className="reward-bar-legend">
        {stops.map((s, i) => (
          <li key={s.id ?? `next-${i}`} className="reward-leg">
            <div className="reward-leg-row">
              <span className="reward-leg-title">{s.title}</span>
              <span className="reward-leg-note">{s.note}</span>
              {s.ready && s.id && (
                <button type="button" className="btn btn-accent btn-sm" onClick={() => claimReward(s.id!)}>{t("Claim")}</button>
              )}
            </div>
            <div
              className="reward-leg-track"
              role="progressbar"
              aria-label={s.title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.progress)}
            >
              {/* A 2% floor, so any progress at all reads as a nub rather than a hairline. */}
              <div className="reward-leg-fill" style={{ width: `${s.progress > 0 ? Math.max(s.progress, 2) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm" onClick={openManage}>{t("Manage rewards")}</button>
    </div>
  );
}

function RewardTitle() {
  return <h2 className="label-caps reward-bar-title">{t("Reward progress")}</h2>;
}
