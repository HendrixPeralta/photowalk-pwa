"use client";

import { useState, type RefObject } from "react";
import { Icon } from "@/components/icons/Icon";
import { exifRows } from "@/lib/analysis/album";
import { gamutClusters, takeawayText, tonalKeyNote } from "@/lib/deconstruct";
import { t } from "@/lib/i18n/core";
import { histogramSummary, paletteRelationship } from "@/lib/interpret";
import { exportBreakdownSheet } from "@/lib/sheet";
import { showToast } from "@/state/ui";
import { resetSession, useAnalysis } from "./session";

interface Canvases {
  imageRef: RefObject<HTMLCanvasElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  histogramRef: RefObject<HTMLCanvasElement | null>;
}

/** Renders what is on screen into a downloadable study sheet. */
async function downloadSummary({ imageRef, overlayRef, histogramRef }: Canvases): Promise<void> {
  const { frame, exif } = useAnalysis.getState();
  if (!frame || !imageRef.current) { showToast(t("Load a photo first.")); return; }
  const summary = histogramSummary(frame.hist.bins);
  await exportBreakdownSheet({
    imageCanvas: imageRef.current,
    overlayCanvas: overlayRef.current,
    histogramCanvas: histogramRef.current,
    clusters: gamutClusters(frame.palette),
    harmony: frame.palette.length ? paletteRelationship(frame.palette).label : "",
    tonalTitle: tonalKeyNote(frame.hist.bins, summary).title,
    tonalText: summary.caption,
    takeaway: takeawayText(frame.palette, summary, exif),
    exifRows: exifRows(exif),
  });
}

/** Download, or start over. Saving (and tagging) lives with the guide controls. */
export function SaveSection(canvases: Canvases) {
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
            try { await downloadSummary(canvases); } finally { setExporting(false); }
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
