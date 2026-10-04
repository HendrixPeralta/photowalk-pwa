"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { t } from "@/lib/i18n/core";
import { closeModal, useModal } from "@/state/ui";
import { focusFirst, inertAppChrome } from "./focus";

let headingIds = 0;

/**
 * Renders the open pop-up. It is a proper dialog: the page behind is made
 * inert, focus moves inside and comes back to where it was on close, Escape
 * and the backdrop close it, and so does navigating away (the back button
 * now changes screens).
 */
export function ModalHost() {
  const current = useModal((s) => s.current);
  const cardRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = Boolean(current);
  // Where focus was before the first pop-up opened. Recorded before focus
  // moves inside, and kept while pop-ups replace one another.
  const openerRef = useRef<HTMLElement | null>(null);

  // While anything is open: inert background, Escape, and focus restore.
  useEffect(() => {
    if (!open) return;
    const restoreChrome = inertAppChrome();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreChrome();
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  // Each new pop-up (including one replacing another): label it by its
  // heading and move focus inside.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!current || !card) return;
    openerRef.current ??= document.activeElement as HTMLElement | null;
    const heading = card.querySelector<HTMLElement>("h2, h3");
    if (heading) {
      if (!heading.id) heading.id = `modal-heading-${++headingIds}`;
      card.setAttribute("aria-labelledby", heading.id);
    } else {
      card.removeAttribute("aria-labelledby");
    }
    focusFirst(card, { skip: ".modal-close" });
  }, [current]);

  // A screen change takes the pop-up with it. A layout effect, so it runs
  // before the new screen's own effects, which may open a pop-up of their own.
  const shownOn = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname !== shownOn.current) {
      shownOn.current = pathname;
      closeModal();
    }
  }, [pathname]);

  if (!current) return <div className="modal-root hidden" />;

  return (
    <div className="modal-root" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div ref={cardRef} className="modal-card" role="dialog" aria-modal="true" tabIndex={-1} key={current.id}>
        <button type="button" className="modal-close" aria-label={t("Close")} onClick={closeModal}>&times;</button>
        {current.element}
      </div>
    </div>
  );
}
