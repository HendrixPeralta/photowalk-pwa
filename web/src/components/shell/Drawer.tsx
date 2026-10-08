"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/sprite";
import { useCurrentRoom } from "@/features/partners/roomStore";
import { accountsEnabled } from "@/lib/authApi";
import { t } from "@/lib/i18n/core";
import { ROUTES, viewForPath, type View } from "@/routes";
import { useAccount } from "@/state/account";
import { useAppStore } from "@/state/appStore";
import { closeDrawer, useDrawer } from "@/state/ui";
import { focusFirst, inertAppChrome } from "./focus";

// The side menu fronts the screens that have no tab of their own.
const ITEMS: { view: View; icon: IconName; label: () => string }[] = [
  { view: "share", icon: "share", label: () => t("Rooms") },
  { view: "themes", icon: "bookmark", label: () => t("My Themes") },
  { view: "settings", icon: "settings", label: () => t("Settings") },
];

export function Drawer() {
  const open = useDrawer((s) => s.open);
  const current = viewForPath(usePathname());
  const roomCode = useAppStore((s) => s.currentRoom);
  const roomName = useCurrentRoom()?.name;
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
                {/* The room open on the Rooms tab, so it's one tap away from anywhere. */}
                {view === "share" && roomCode && <span className="drawer-item-hint">{roomName || roomCode}</span>}
              </Link>
            ))}
          </div>

          {accountsEnabled() && <AccountLink />}
        </aside>
      </div>
    </div>
  );
}

/** The signed-in person, leading to Settings, where the account card is. */
function AccountLink() {
  const user = useAccount((s) => s.user);
  return (
    <Link href={ROUTES.settings} className="drawer-user" onClick={closeDrawer}>
      <Avatar user={user} />
      <span className="drawer-user-names">
        <strong>{user?.name || t("Account")}</strong>
        {user?.email && <span className="muted">{user.email}</span>}
      </span>
      <svg className="drawer-user-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
      </svg>
    </Link>
  );
}
