"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { addPhotoToAlbum } from "@/features/album/addPhoto";
import { install, useInstallPrompt } from "@/features/pwa/install";
import { openReview } from "@/features/review/ReviewModal";
import { t } from "@/lib/i18n/core";
import { currentStreak } from "@/lib/walk";
import { screenTitle, viewForPath } from "@/routes";
import { useAppStore } from "@/state/appStore";
import { openDrawer } from "@/state/ui";

export function TopBar() {
  const pathname = usePathname();
  const streak = useAppStore((s) => currentStreak(s.profile));
  const inputRef = useRef<HTMLInputElement>(null);
  const installable = useInstallPrompt((s) => Boolean(s.event));

  return (
    <header className="topbar" data-app-chrome>
      <div className="brand">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void addPhotoToAlbum(file);
          }}
        />
        <button
          type="button"
          className="brand-mark brand-add"
          aria-label={t("Add photo to Reference Album")}
          title={t("Add photo to Reference Album")}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="plus" className="brand-icon" />
        </button>
        {/* Only the mark shows; the screen name stays for screen readers. */}
        <h1 id="screenTitle" className="visually-hidden">{screenTitle(viewForPath(pathname))}</h1>
      </div>

      <button type="button" className="topbar-review" aria-label={t("Leave feedback")} onClick={openReview}>
        <Icon name="star" className="topbar-review-star" />
        <span className="topbar-review-label">{t("Feedback")}</span>
      </button>

      <div className="topbar-actions">
        <span className="streak-badge" title={t("{n}-day streak", { n: streak })} aria-label={t("{n}-day streak", { n: streak })}>
          <Icon name="flame" />
          <span aria-hidden="true">{streak}</span>
        </span>
        {installable && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void install()}>{t("Install")}</button>
        )}
        <button type="button" id="profileBtn" className="icon-btn" aria-label={t("Profile")} onClick={openDrawer}>
          <Icon name="user" />
        </button>
      </div>
    </header>
  );
}
