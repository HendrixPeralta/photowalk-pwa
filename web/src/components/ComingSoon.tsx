"use client";

import { t } from "@/lib/i18n/core";
import type { View } from "@/routes";

/** Stands in for a screen until its phase of the port lands. */
export function ComingSoon({ view }: { view: View }) {
  return (
    <section className="view" data-view={view}>
      <p className="muted">{t("This screen is coming soon.")}</p>
    </section>
  );
}
