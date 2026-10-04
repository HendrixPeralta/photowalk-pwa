"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { useImageUrl } from "@/components/useImageUrl";
import { WalkPartnersCard } from "@/features/partners/WalkPartnersCard";
import { ChallengeList } from "@/features/walks/ChallengeList";
import { finishWalk, launchIfRequested, pauseWalk, resumeWalk } from "@/features/walks/actions";
import { challengesFor, useWalkTheme } from "@/features/walks/walkUi";
import { concept } from "@/lib/content/themes";
import { getDateLocale, t } from "@/lib/i18n/core";
import { useNow } from "@/lib/useNow";
import { clockText } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import type { ActiveWalk, Frame } from "@/state/types";
import { openModal } from "@/state/ui";
import { logFrames, openInMaps } from "./actions";
import { FrameSheetModal } from "./FrameSheet";

/**
 * The screen you look at while you're out walking. Everything on it is
 * measured, not simulated: the clock comes from the walk, the photos are the
 * ones you logged, with whatever camera data the files carried.
 */
export function LiveScreen() {
  const walk = useAppStore((s) => s.activeWalk);

  // The Live tab asked for a walk: start it now that this screen is showing.
  useEffect(() => {
    launchIfRequested();
  }, []);

  return (
    <section className="view" data-view="hud">
      {walk && <OpenWalk walk={walk} />}
      <WalkPartnersCard />
    </section>
  );
}

function OpenWalk({ walk }: { walk: ActiveWalk }) {
  const frames = walk.frames ?? [];
  const last = frames[frames.length - 1];

  return (
    <div>
      <Telemetry walk={walk} />
      <MissionCard walk={walk} />

      <div className="log-head">
        <span className="label-caps">{t("Photo Log")}</span>
        <span className="log-last">
          {last
            ? t("Last: #{n} at {time}", {
                n: frames.length,
                time: new Date(last.at).toLocaleTimeString(getDateLocale(), { hour: "2-digit", minute: "2-digit" }),
              })
            : t("No photos yet")}
        </span>
      </div>
      <div className="hud-footer-row">
        <LogPhotoButton next={frames.length + 1} />
        <button type="button" className="btn btn-primary log-btn" onClick={() => void openInMaps()}>
          <Icon name="pin" />
          {t("Open in Maps")}
        </button>
      </div>

      <div className="hud-footer-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!walk.startedAt}
          onClick={walk.pausedAt ? resumeWalk : pauseWalk}
        >
          <Icon name="pause" />
          <span>{walk.pausedAt ? t("Resume Walk") : t("Pause Walk")}</span>
        </button>
        <button type="button" className="btn btn-danger-solid" onClick={() => finishWalk(false)}>
          <Icon name="flag" />
          {t("Finish Walk")}
        </button>
      </div>
    </div>
  );
}

/** Time out, time left (or "Open" on a casual walk), and photos logged. */
function Telemetry({ walk }: { walk: ActiveWalk }) {
  const running = Boolean(walk.startedAt && !walk.pausedAt);
  const now = useNow(1000, running);
  // While paused the clock stays at the moment the pause began.
  const elapsed = walk.startedAt ? (walk.pausedAt || now) - walk.startedAt : 0;
  const goal = walk.mode === "guided" && walk.durationMin
    ? clockText(Math.max(0, walk.durationMin * 60000 - elapsed))
    : t("Open");

  return (
    <div className="telemetry-grid telemetry-grid-3">
      <div className="telemetry-cell">
        <span className="telemetry-cell-head">
          <Icon name="timer" />
          <span className="label-caps">{t("Time")}</span>
        </span>
        <span className="telemetry-value" role="timer">{walk.startedAt ? clockText(elapsed) : "--:--"}</span>
      </div>
      <div className="telemetry-cell telemetry-cell-cyan">
        <span className="telemetry-cell-head">
          <Icon name="hourglass" />
          <span className="label-caps">{t("Goal")}</span>
        </span>
        <span className="telemetry-value">{goal}</span>
      </div>
      <div className="telemetry-cell telemetry-cell-plain">
        <span className="telemetry-cell-head">
          <Icon name="target" />
          <span className="label-caps">{t("Photos")}</span>
        </span>
        <span className="telemetry-value">{(walk.frames ?? []).length}</span>
      </div>
    </div>
  );
}

/** The theme, its concepts, the guided checklist and the latest photos. */
function MissionCard({ walk }: { walk: ActiveWalk }) {
  const theme = useWalkTheme();
  const walkNo = useAppStore((s) => s.profile.walksCompleted + 1);
  const frames = walk.frames ?? [];
  const challenges = challengesFor(theme, walk.mode);
  const done = walk.challengesChecked.filter(Boolean).length;
  const total = walk.challengesChecked.length;
  const tips = (theme?.concepts ?? []).map(concept).filter((c) => c !== undefined);

  return (
    <div className="mission-card">
      <div className="mission-head">
        <span className="mission-head-left">
          <span className="solar-dot" />
          <span className="label-caps">{t("Walk #{n} · Your Theme", { n: walkNo })}</span>
        </span>
        <span className="mission-badge">
          {walk.mode === "guided" ? t("{n} min", { n: walk.durationMin ?? 0 }) : t("Casual")}
        </span>
      </div>
      <h2 className="mission-title">{theme ? theme.title : t("Walk in progress")}</h2>
      <div className="mission-hint">
        <Icon name="bulb" />
        <p>{theme ? theme.brief : t("Pick a subject and keep shooting it from new angles.")}</p>
      </div>
      {tips.length > 0 && (
        <div className="hud-theme-tips">
          {tips.map((tip) => (
            <p key={tip.title} className="hud-theme-tip"><strong>{tip.title}:</strong> {tip.tip}</p>
          ))}
        </div>
      )}
      <div className="mission-progress">
        {/* A casual walk has no checklist, so its only progress is photos. */}
        {total > 0 && (
          <>
            <span className="mission-pips">
              {walk.challengesChecked.map((_, i) => (
                <span key={i} className={`mission-pip${i < done ? " done" : ""}`} />
              ))}
            </span>
            <span className="mission-progress-text">{t("Progress: {pct}%", { pct: Math.round((done / total) * 100) })}</span>
          </>
        )}
        <span className="mission-synced">
          {frames.length === 1 ? t("{n} photo", { n: 1 }) : t("{n} photos", { n: frames.length })}
        </span>
      </div>
      {challenges.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <ChallengeList challenges={challenges} />
        </div>
      )}
      <div className="capture-strip">
        {/* The newest three. */}
        {frames.slice(-3).map((frame) => <CaptureChip key={frame.id} frame={frame} />)}
      </div>
    </div>
  );
}

function CaptureChip({ frame }: { frame: Frame }) {
  const url = useImageUrl(frame.imageId);
  return (
    <button type="button" className="capture-chip" onClick={() => openModal(<FrameSheetModal frameId={frame.id} />)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      <img src={url ?? undefined} alt="" />
      <span className="capture-chip-meta">
        <strong>#{frame.index} {frame.label}</strong>
        <span>{frame.exposure || t("no camera data")}</span>
      </span>
    </button>
  );
}

/** Picks one or more photos from the camera roll and logs them to the walk. */
function LogPhotoButton({ next }: { next: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btn-accent log-btn" onClick={() => inputRef.current?.click()}>
        <Icon name="camera" />
        <span>{t("Log Photo #{n}", { n: next })}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        // Opened by the button above, which is what assistive tech should see.
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void logFrames(files);
        }}
      />
    </>
  );
}
