"use client";

import { Icon } from "@/components/icons/Icon";
import { RewardBar } from "@/features/rewards/RewardBar";
import { t } from "@/lib/i18n/core";
import { useAppStore } from "@/state/appStore";
import { ActivityYear } from "./ActivityYear";
import { FilmStrip } from "./FilmStrip";
import { GoldenBadge } from "./GoldenBadge";
import { HomeWalkPanel } from "./HomeWalkPanel";
import { QuickStart } from "./QuickStart";

/** Home: this week and the year at a glance, the walk launcher (or the open walk), and rewards. */
export function WalksScreen() {
  const walk = useAppStore((s) => s.activeWalk);

  return (
    <section className="view" data-view="walks">
      <div className="cadence-card">
        <div className="cadence-head">
          <span className="cadence-head-left">
            <Icon name="film" />
            <span className="label-caps">{t("This Week")}</span>
          </span>
          <GoldenBadge />
        </div>
        <FilmStrip />
        <ActivityYear />
      </div>

      {walk ? <HomeWalkPanel walk={walk} /> : <QuickStart />}

      <div className="theme-card reward-progress-card">
        <RewardBar />
      </div>
    </section>
  );
}
