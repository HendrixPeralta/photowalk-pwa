"use client";

import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";
import { fixIsFresh, formatLat } from "@/lib/geo";
import { t } from "@/lib/i18n/core";
import { useNow } from "@/lib/useNow";
import { modeInfo } from "@/lib/walk";
import { useAppStore } from "@/state/appStore";
import { useFix } from "@/state/geo";
import type { WalkMode } from "@/state/types";
import { openModal } from "@/state/ui";
import { launchWalk, setMode } from "./actions";
import { useWalkUi } from "./walkUi";

const MODES: { mode: WalkMode; icon: IconName }[] = [
  { mode: "casual", icon: "lens" },
  { mode: "guided", icon: "timer" },
];

function ModeInfoModal() {
  return (
    <>
      <h3>{t("Walk Modes")}</h3>
      <p className="muted card-text">
        {t("A photo walk is simply going for a walk to take pictures, with a theme to keep you looking. Pick how much guidance you want.")}
      </p>
      {MODES.map(({ mode }) => {
        const info = modeInfo(mode);
        return (
          <div key={mode}>
            <h4 className="subsection-title">{info.title}</h4>
            <p className="card-text">{info.desc}</p>
            <p className="card-text muted">{info.best}</p>
          </div>
        );
      })}
      <p className="card-text">
        {t("Either way, you can pause at any time, every walk keeps your streak going, and the time you spend shooting counts toward your rewards. You can switch modes before you start a walk.")}
      </p>
    </>
  );
}

/** The two mode cards and the Start Photo Walk button, shown while no walk is open. */
export function QuickStart() {
  const mode = useWalkUi((s) => s.mode);
  const guidedMin = useAppStore((s) => Number(s.profile.guidedDurationMin) || 30);
  const fix = useFix((s) => s.fix);
  const now = useNow(60_000);

  return (
    <div>
      <div className="log-head">
        <span className="label-caps-row">
          <span className="label-caps">{t("Pick a Walk Mode")}</span>
          <button
            type="button"
            className="section-help-btn"
            aria-label={t("About walk modes")}
            onClick={() => openModal(<ModeInfoModal />)}
          >
            ?
          </button>
        </span>
      </div>

      <div className="mode-cards">
        {MODES.map(({ mode: m, icon }) => (
          <button
            key={m}
            type="button"
            className={`mode-card${mode === m ? " active" : ""}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            <span className="mode-card-head">
              <span className="mode-card-title">
                <span className="mode-card-icon"><Icon name={icon} /></span>
                <strong>{modeInfo(m).title}</strong>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="launch-btn" onClick={launchWalk}>
          <span className="launch-btn-left">
            <span className="launch-btn-icon"><Icon name="shutter" /></span>
            <span className="launch-btn-labels">
              <span className="label-caps">{t("Ready to Shoot")}</span>
              <strong>{t("Start Photo Walk")}</strong>
            </span>
          </span>
          <span className="launch-btn-right">
            {fix && fixIsFresh(fix, now) && (
              <span className="launch-fix">
                <Icon name="target" />
                <span>{formatLat(fix.lat)}</span>
              </span>
            )}
            <span className="label-caps">{mode === "guided" ? t("Guided · {n} min", { n: guidedMin }) : t("Casual Mode")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
