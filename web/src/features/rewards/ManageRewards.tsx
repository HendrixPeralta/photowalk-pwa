"use client";

import { useState, type KeyboardEvent } from "react";
import { t } from "@/lib/i18n/core";
import { earnedHours } from "@/lib/rewards";
import { totalActivityHours } from "@/lib/stats";
import { clamp, formatDate, formatHours } from "@/lib/util";
import { useAppStore } from "@/state/appStore";
import { addReward, removeReward } from "./actions";

/** Set a new reward, and see or remove the ones already set. */
export function ManageRewardsModal() {
  const rewards = useAppStore((s) => s.rewards);
  const total = useAppStore((s) => totalActivityHours(s.activityLog));
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("");

  const submit = () => {
    if (addReward(title, Number(hours))) {
      setTitle("");
      setHours("");
    }
  };
  const onEnter = (e: KeyboardEvent) => { if (e.key === "Enter") submit(); };

  const active = rewards.filter((r) => !r.claimedAt);
  const claimed = rewards.filter((r) => r.claimedAt).sort((a, b) => b.claimedAt! - a.claimedAt!);

  return (
    <>
      <h3>{t("Hour rewards")}</h3>
      <p className="muted card-text">{t("Pick a treat and set how many hours of shooting it costs. Every hour you shoot counts toward it.")}</p>
      <div className="reward-form">
        <input
          type="text"
          className="text-input"
          placeholder={t("Reward (e.g. new camera strap)")}
          maxLength={60}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onEnter}
        />
        <input
          type="number"
          className="text-input reward-hours-input"
          placeholder={t("Hours")}
          min={0.5}
          step={0.5}
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="btn btn-primary" onClick={submit}>{t("Set Reward")}</button>
      </div>
      {!rewards.length && <p className="empty-state-sm">{t("No rewards yet. Try “New 35mm lens” for 20 hours.")}</p>}
      <ul className="rewards-list">
        {active.map((r) => {
          const earned = earnedHours(r, total);
          const done = earned >= r.targetHours;
          return (
            <li key={r.id} className={`reward-item${done ? " reward-item-ready" : ""}`}>
              <div className="reward-row">
                <span className="reward-title">{r.title}</span>
                <span className="reward-hours">{formatHours(Math.min(earned, r.targetHours))} / {formatHours(r.targetHours)}</span>
              </div>
              <div className="timer-track reward-track">
                <div className="timer-fill reward-fill" style={{ width: `${clamp((earned / r.targetHours) * 100, 0, 100)}%` }} />
              </div>
              <div className="reward-row reward-foot">
                <span className="muted">
                  {done
                    ? t("Earned! Claim it from the Reward progress card above.")
                    : t("{hours} of shooting to go", { hours: formatHours(r.targetHours - earned) })}
                </span>
                <span className="reward-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeReward(r.id)}>{t("Remove")}</button>
                </span>
              </div>
            </li>
          );
        })}
        {claimed.map((r) => (
          <li key={r.id} className="reward-item reward-item-claimed">
            <div className="reward-row">
              <span className="reward-title">✓ {r.title}</span>
              <span className="reward-actions">
                <span className="reward-hours">{formatHours(r.targetHours)} · {formatDate(r.claimedAt!)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeReward(r.id)}>{t("Remove")}</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
