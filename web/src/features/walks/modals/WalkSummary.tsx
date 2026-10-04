"use client";

import { Icon } from "@/components/icons/Icon";
import { useImageUrl } from "@/components/useImageUrl";
import type { Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import type { Milestone } from "@/lib/milestones";
import { navigate } from "@/lib/nav";
import { activeRewardProgress } from "@/lib/rewards";
import { totalActivityHours, totalFramesLogged } from "@/lib/stats";
import { formatHours } from "@/lib/util";
import { useAppStore } from "@/state/appStore";
import type { Frame, Reward, WalkRecord } from "@/state/types";
import { closeModal, openModal } from "@/state/ui";
import { openAnalysis } from "@/features/analysis/request";

interface SummaryProps {
  theme: Theme | null;
  record: WalkRecord;
  frames: readonly Frame[];
  auto: boolean;
  unlocked: readonly Reward[];
  milestones: readonly Milestone[];
}

/** What the walk added up to, anything it unlocked, and where to go next. */
export function WalkSummaryModal({ theme, record, frames, auto, unlocked, milestones }: SummaryProps) {
  const totalHours = useAppStore((s) => totalActivityHours(s.activityLog));
  const totalFrames = useAppStore((s) => totalFramesLogged(s.frameLog));
  const rewards = useAppStore((s) => s.rewards);

  // Only rewards still in progress: the ones just unlocked are called out above.
  const toward = activeRewardProgress(rewards, totalHours).filter((r) => !r.done).slice(0, 3);
  const hasWins = unlocked.length > 0 || milestones.length > 0;

  return (
    <>
      <h3>{auto ? t("Time's up, nice work!") : t("Walk complete!")}</h3>
      <div className="summary-stats-row">
        <div className="summary-stat">
          <span className="summary-stat-value">{formatHours(totalHours)}</span>
          <span className="summary-stat-delta">{t("+{n} this walk", { n: formatHours(record.hours) })}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-value">{totalFrames}</span>
          <span className="summary-stat-delta">{t("+{n} this walk", { n: frames.length })}</span>
        </div>
      </div>

      <div className="summary-theme-recap">
        <span className="label-caps">{t("Theme")}</span>
        <strong>{theme?.title ?? t("Walk in progress")}</strong>
        {record.challengeCount > 0 && (
          <p>{t("{done} of {total} mini-challenges done", { done: record.challengesDone, total: record.challengeCount })}</p>
        )}
      </div>

      {hasWins && (
        <ul className="summary-wins">
          {unlocked.map((r) => (
            <li key={r.id} className="summary-win summary-win-reward">
              <strong>{t("Reward earned: {title}", { title: r.title })}</strong>
              <span className="muted">{t("You put in the {hours}. Claim it on the Walks tab.", { hours: formatHours(r.targetHours) })}</span>
            </li>
          ))}
          {milestones.map((m) => (
            <li key={m.id} className="summary-win">
              <strong>{m.title}</strong>
              <span className="muted">{m.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {toward.length > 0 && (
        <>
          <h4 className="subsection-title">{t("Still working toward")}</h4>
          <ul className="summary-progress-list">
            {toward.map((r) => (
              <li key={r.id} className="summary-progress">
                <span className="reward-title">{r.title}</span>
                <span className="muted">{t("{hours} to go", { hours: formatHours(r.remaining) })}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted card-text" style={{ marginTop: 14 }}>
        {t("Look over your shots while the walk is fresh. Pick your best three and see how well they fit the theme.")}
      </p>
      <div className="theme-btn-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-accent" onClick={() => openModal(<FramePickerModal frames={frames} />)}>
          {t("Analyze your best shots")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-icon-only"
          aria-label={t("Share your shots")}
          onClick={() => {
            closeModal();
            navigate("share");
          }}
        >
          <Icon name="share" />
        </button>
      </div>
      <div className="theme-actions">
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Done")}</button>
      </div>
    </>
  );
}

/** Hands one of the walk's frames to Analysis. Always asked, so the choice is the user's. */
export function FramePickerModal({ frames }: { frames: readonly Frame[] }) {
  if (!frames.length) {
    return (
      <>
        <h3>{t("Pick a photo to analyze")}</h3>
        <p className="empty-state-sm">{t("No frames logged on this walk.")}</p>
        <button
          type="button"
          className="btn btn-accent btn-block"
          onClick={() => {
            closeModal();
            navigate("analyze");
          }}
        >
          {t("Analyze a sample photo instead")}
        </button>
      </>
    );
  }

  return (
    <>
      <h3>{t("Pick a photo to analyze")}</h3>
      <div className="album-grid">
        {frames.map((frame) => <FrameThumb key={frame.id} frame={frame} />)}
      </div>
    </>
  );
}

function FrameThumb({ frame }: { frame: Frame }) {
  const url = useImageUrl(frame.imageId);
  return (
    <button
      type="button"
      className="album-thumb"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      onClick={() => {
        closeModal();
        openAnalysis({ imageId: frame.imageId, exif: frame.exif });
      }}
    >
      <span className="album-thumb-tag">#{frame.index}</span>
    </button>
  );
}
