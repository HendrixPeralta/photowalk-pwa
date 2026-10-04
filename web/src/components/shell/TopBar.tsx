"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { t } from "@/lib/i18n/core";
import { currentStreak } from "@/lib/walk";
import { screenTitle, viewForPath } from "@/routes";
import { useAppStore } from "@/state/appStore";
import { openDrawer } from "@/state/ui";

export function TopBar() {
  const pathname = usePathname();
  const streak = useAppStore((s) => currentStreak(s.profile));

  return (
    <header className="topbar" data-app-chrome>
      <div className="brand">
        <span className="brand-mark">
          <Icon name="shutter" className="brand-icon" />
        </span>
        <span className="brand-titles">
          <span className="label-caps">PhotoEYE</span>
          <h1 id="screenTitle">{screenTitle(viewForPath(pathname))}</h1>
        </span>
      </div>

      <button type="button" className="topbar-review" aria-label={t("Leave a review")}>
        <span className="topbar-review-star" aria-hidden="true">★</span>
        <span className="topbar-review-label">{t("Review")}</span>
      </button>

      <div className="topbar-actions">
        <span className="streak-badge" title={t("Current streak")}>
          <Icon name="flame" style={{ width: 13, height: 13 }} />
          <span>{t("{n}-day streak", { n: streak })}</span>
        </span>
        <button type="button" id="profileBtn" className="icon-btn" aria-label={t("Profile")} onClick={openDrawer}>
          <Icon name="user" />
        </button>
      </div>
    </header>
  );
}
