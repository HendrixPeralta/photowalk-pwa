"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { goLive } from "@/features/walks/actions";
import type { IconName } from "@/components/icons/sprite";
import { t } from "@/lib/i18n/core";
import { ROUTES, viewForPath, type View } from "@/routes";
import { useAppStore } from "@/state/appStore";

const TABS: { view: View; icon: IconName; label: () => string }[] = [
  { view: "walks", icon: "explore", label: () => t("Walks") },
  { view: "hud", icon: "camera", label: () => t("Live Walk") },
  { view: "analyze", icon: "grid", label: () => t("Analysis") },
  { view: "album", icon: "library", label: () => t("Album") },
];

export function BottomNav() {
  const current = viewForPath(usePathname());
  const walking = useAppStore((s) => Boolean(s.activeWalk));

  return (
    <nav className="bottom-nav" data-app-chrome>
      {TABS.map(({ view, icon, label }) => (
        <Link
          key={view}
          href={ROUTES[view]}
          className={`nav-btn${current === view ? " active" : ""}`}
          aria-current={current === view ? "page" : undefined}
          onClick={view === "hud" ? () => goLive(current === "hud") : undefined}
        >
          <Icon name={icon} />
          {view === "hud" && walking && <span className="nav-live" aria-hidden="true" />}
          <span>{label()}</span>
        </Link>
      ))}
    </nav>
  );
}
