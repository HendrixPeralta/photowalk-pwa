"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";
import { t } from "@/lib/i18n/core";
import { ROUTES, viewForPath, type View } from "@/routes";
import { closeDrawer, showToast, useDrawer } from "@/state/ui";
import { focusFirst, inertAppChrome } from "./focus";

// The side menu fronts the screens that have no tab of their own.
const ITEMS: { view: View; icon: IconName; label: () => string }[] = [
  { view: "themes", icon: "bookmark", label: () => t("My Themes") },
  { view: "settings", icon: "settings", label: () => t("Settings") },
];

export function Drawer() {
  const open = useDrawer((s) => s.open);
  const current = viewForPath(usePathname());
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const restoreChrome = inertAppChrome();
    focusFirst(asideRef.current, { skip: ".drawer-close" });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreChrome();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className={`drawer-root${open ? "" : " hidden"}`}>
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <div className="drawer-frame">
        <aside ref={asideRef} className="drawer" role="dialog" aria-modal="true" aria-label={t("Menu")}>
          <button type="button" className="drawer-close" aria-label={t("Close")} onClick={closeDrawer}>&times;</button>

          <div className="drawer-brand">
            <Icon name="shutter" />
            <span>PhotoEYE</span>
          </div>

          <div className="drawer-group">
            {ITEMS.map(({ view, icon, label }) => (
              <Link
                key={view}
                href={ROUTES[view]}
                className={`drawer-item${current === view ? " active" : ""}`}
                aria-current={current === view ? "page" : undefined}
                onClick={closeDrawer}
              >
                <span className="drawer-item-icon"><Icon name={icon} /></span>
                <span>{label()}</span>
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="drawer-user"
            onClick={() => showToast(t("Google sign-in is coming soon. PhotoEYE works fully without an account."))}
          >
            <span className="profile-avatar" aria-hidden="true"><Icon name="user" /></span>
            <span className="drawer-user-names">
              <strong>{t("Guest")}</strong>
              <span className="muted">{t("Not signed in")}</span>
            </span>
            <svg className="drawer-user-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        </aside>
      </div>
    </div>
  );
}
