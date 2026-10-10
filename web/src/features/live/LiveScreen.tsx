"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { useImageUrl } from "@/components/useImageUrl";
import { WalkPartnersCard } from "@/features/partners/WalkPartnersCard";
import { ChallengeList } from "@/features/walks/ChallengeList";
import { launchIfRequested, openWalkThemePicker } from "@/features/walks/actions";
import { WalkControls } from "@/features/walks/WalkControls";
import { challengesFor, useWalkTheme } from "@/features/walks/walkUi";
import { concept } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { useNow } from "@/lib/useNow";
import { clockText } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import type { ActiveWalk, Frame } from "@/state/types";
import { openModal } from "@/state/ui";
import { logFrames } from "./actions";
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
      {walk && <Telemetry walk={walk} />}
      {walk && <MissionCard walk={walk} />}
      <WalkPartnersCard />
      {walk && <WalkControls walk={walk} />}
    </section>
  );
}

/**
 * One card for the walk clock: time out big in the middle (with time left
 * under it on a guided walk), the mode bottom-left and, bottom-right, the
 * photo count with the button that logs more.
 */
function Telemetry({ walk }: { walk: ActiveWalk }) {
  const running = Boolean(walk.startedAt && !walk.pausedAt);
  const now = useNow(1000, running);
  // While paused the clock stays at the moment the pause began.
  const elapsed = walk.startedAt ? (walk.pausedAt || now) - walk.startedAt : 0;
  const guided = walk.mode === "guided" && Boolean(walk.durationMin);
  const left = guided ? clockText(Math.max(0, (walk.durationMin ?? 0) * 60000 - elapsed)) : null;

  return (
    <div className="walk-clock">
      <div className="walk-clock-main">
        <span className="walk-clock-time" role="timer">{walk.startedAt ? clockText(elapsed) : "--:--"}</span>
        {left && <span className="walk-clock-left">{t("{time} left", { time: left })}</span>}
      </div>
      <div className="walk-clock-foot">
        <span className="walk-clock-mode">
          <Icon name={guided ? "hourglass" : "footprint"} />
          {guided ? t("Challenge · {n} min", { n: walk.durationMin ?? 0 }) : t("Casual Walk")}
        </span>
        <span className="walk-clock-photos">
          <Icon name="camera" />
          <span className="walk-clock-count" aria-label={t("Photos")}>{(walk.frames ?? []).length}</span>
          <LogPhotoButton next={(walk.frames ?? []).length + 1} />
        </span>
      </div>
    </div>
  );
}

/**
 * The theme, its concepts, the guided checklist and the latest photos. Tap the
 * title to fold it away; Change Theme swaps it without ending the walk.
 */
function MissionCard({ walk }: { walk: ActiveWalk }) {
  const theme = useWalkTheme();
  const frames = walk.frames ?? [];
  const challenges = challengesFor(theme, walk.mode);
  const done = walk.challengesChecked.filter(Boolean).length;
  const total = walk.challengesChecked.length;
  const tips = (theme?.concepts ?? []).map(concept).filter((c) => c !== undefined);

  return (
    <details open className="mission-card">
      <summary className="mission-summary">
        <h2 className="mission-title">{theme ? theme.title : t("Walk in progress")}</h2>
        <button
          type="button"
          className="mission-change"
          aria-label={t("Change Theme")}
          title={t("Change Theme")}
          onClick={(e) => {
            // Inside the <summary>, so the tap must not also fold the card.
            e.preventDefault();
            e.stopPropagation();
            openWalkThemePicker();
          }}
        >
          <Icon name="repeat" />
        </button>
        <svg className="collapse-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
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
      {/* A casual walk has no checklist, so no progress to show. */}
      {total > 0 && (
        <div className="mission-progress">
          <span className="mission-pips">
            {walk.challengesChecked.map((_, i) => (
              <span key={i} className={`mission-pip${i < done ? " done" : ""}`} />
            ))}
          </span>
          <span className="mission-progress-text">{t("Progress: {pct}%", { pct: Math.round((done / total) * 100) })}</span>
        </div>
      )}
      {challenges.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <ChallengeList challenges={challenges} />
        </div>
      )}
      <div className="capture-strip">
        {/* The newest three. */}
        {frames.slice(-3).map((frame) => <CaptureChip key={frame.id} frame={frame} />)}
      </div>
    </details>
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
      <button
        type="button"
        className="walk-clock-add"
        aria-label={t("Log Photo #{n}", { n: next })}
        title={t("Log Photo #{n}", { n: next })}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="plus" />
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
