"use client";

import { useId } from "react";
import { t } from "@/lib/i18n/core";
import { durationOptions } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import { closeModal } from "@/state/ui";
import { beginShooting, openThemePicker, setGuidedDuration } from "../actions";
import { ChallengeList } from "../ChallengeList";
import { challengesFor, useWalkTheme, useWalkUi } from "../walkUi";

/**
 * The walk brief: what you are shooting and what to try. Before shooting
 * starts this is also where the theme gets settled (change it, or build one)
 * and a guided walk's length is picked. Once the clock is running it reopens
 * as a read-only recap, with live checkboxes.
 */
export function WalkBriefModal() {
  const walk = useAppStore((s) => s.activeWalk);
  const theme = useWalkTheme();
  const reason = useWalkUi((s) => s.reason);
  const lengthId = useId();
  if (!walk || !theme) return null;

  const preShooting = !walk.startedAt;
  const guided = walk.mode === "guided";
  const challenges = challengesFor(theme, walk.mode);

  return (
    <>
      <h3 className="walk-brief-title">{theme.title}</h3>
      <p className="muted">{theme.brief}</p>
      {reason && <p className="theme-reason">{reason}</p>}
      <p className="walk-brief-mode">
        {guided
          ? t("Guided walk · {n}-minute timer", { n: walk.durationMin ?? 0 })
          : t("Casual walk · no timer, stop whenever you're done")}
      </p>

      {/* Changing the length mid-walk would disagree with the nudges already planned. */}
      {preShooting && guided && (
        <div className="field-row" style={{ marginTop: 8 }}>
          <label htmlFor={lengthId}>{t("Walk length")}</label>
          <select id={lengthId} value={walk.durationMin ?? undefined} onChange={(e) => setGuidedDuration(Number(e.target.value))}>
            {durationOptions().map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
      )}

      {challenges.length > 0 && (
        <>
          <h4 className="subsection-title">{t("Mini-challenges")}</h4>
          <ChallengeList challenges={challenges} />
        </>
      )}

      <div className="theme-actions theme-actions-row">
        {preShooting && (
          <button type="button" className="btn btn-ghost btn-block" onClick={openThemePicker}>
            {t("Change Theme")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-accent btn-block"
          onClick={() => {
            if (preShooting) beginShooting();
            closeModal();
          }}
        >
          {t("Start shooting")}
        </button>
      </div>
    </>
  );
}
