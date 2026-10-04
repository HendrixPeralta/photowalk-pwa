"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconSprite } from "@/components/icons/IconSprite";
import { starterAlbumOnStart } from "@/features/album/references";
import { installConsoleHooks } from "@/features/devtools/consoleHooks";
import { handleLaunchIntentOnce } from "@/features/partners/launchIntent";
import { startReviewSync } from "@/features/review/queue";
import { maybeNudgeOnOpen } from "@/features/settings/reminders";
import { WalkEngine } from "@/features/walks/WalkEngine";
import { setNavigator } from "@/lib/nav";
import { bootOnce } from "@/state/boot";
import { takeDevParams } from "@/state/devParams";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { ModalHost } from "./ModalHost";
import { ToastHost } from "./ToastHost";
import { TopBar } from "./TopBar";

/**
 * Nothing renders until boot finishes (language, saved data, starting
 * history). The server and the first client render both show the same empty
 * frame, so text, dates and saved data never cause a hydration mismatch, and
 * the static export produces the same page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    bootOnce().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  if (!ready) return <div className="app-shell" aria-busy="true" />;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const viewsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setNavigator((href) => router.push(href));
    return () => setNavigator(null);
  }, [router]);

  // Not awaited by anything: fetching and decoding the starter photos has no
  // business holding up the first screen.
  useEffect(() => {
    void starterAlbumOnStart(takeDevParams().photos);
    installConsoleHooks();
    maybeNudgeOnOpen();
  }, []);

  // Reviews written offline go out now, and whenever the connection is back.
  useEffect(() => startReviewSync(), []);

  // An invite link or photos from the share sheet: both open Partners.
  useEffect(() => {
    void handleLaunchIntentOnce();
  }, []);

  // The screens scroll inside .views, not the window, so reset it on each move.
  useEffect(() => {
    viewsRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app-shell">
      <IconSprite />
      <TopBar />
      <main ref={viewsRef} className="views" data-app-chrome>
        {children}
      </main>
      <BottomNav />
      <Drawer />
      <ModalHost />
      <ToastHost />
      <WalkEngine />
    </div>
  );
}
