"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { rgbToHex } from "@/lib/color";
import { t } from "@/lib/i18n/core";
import { exportBreakdownSheet } from "@/lib/sheet";
import { showToast } from "@/state/ui";
import { resetSession, useAnalysis } from "./session";

/** Renders the photo and its readouts into a downloadable summary sheet. */
async function downloadSummary(): Promise<void> {
  const { frame, exif } = useAnalysis.getState();
  if (!frame) { showToast(t("Load a photo first.")); return; }
  await exportBreakdownSheet({
    image: frame.image,
    colors: frame.palette.map((c) => rgbToHex(c.r, c.g, c.b)),
    bins: frame.hist.bins,
    exif,
  });
}

/** Download, or start over. Saving (and tagging) lives with the guide controls. */
export function SaveSection() {
  const [exporting, setExporting] = useState(false);

  return (
    <>
      <div className="theme-btn-row">
        <button
          type="button"
          className="btn btn-primary"
          aria-label={t("Download Summary")}
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try { await downloadSummary(); } finally { setExporting(false); }
          }}
        >
          <Icon name="download" />
          {t("Summary")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetSession}>{t("Upload Photo")}</button>
      </div>
    </>
  );
}
