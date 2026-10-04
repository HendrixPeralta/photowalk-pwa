"use client";

import { useState, type RefObject } from "react";
import { Icon } from "@/components/icons/Icon";
import { exifRows } from "@/lib/analysis/album";
import { gamutClusters, takeawayText, tonalKeyNote } from "@/lib/deconstruct";
import { t } from "@/lib/i18n/core";
import { histogramSummary, paletteRelationship } from "@/lib/interpret";
import { navigate } from "@/lib/nav";
import { exportBreakdownSheet } from "@/lib/sheet";
import { showToast } from "@/state/ui";
import { resetSession, saveToAlbum, useAnalysis } from "./session";

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

/** Save to the album (or update the reference that's open), share, download, or start over. */
export function SaveSection(canvases: Canvases) {
  const tags = useAnalysis((s) => s.tags);
  const updating = useAnalysis((s) => Boolean(s.albumItemId));
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  return (
    <>
      <h4 className="subsection-title">{t("Save This Photo")}</h4>
      <input
        type="text"
        className="text-input"
        placeholder={t("Tags, comma separated (e.g. bridge, sunset)")}
        value={tags}
        onChange={(e) => useAnalysis.setState({ tags: e.target.value })}
      />
      <div className="action-stack">
        <button
          type="button"
          className="btn btn-accent btn-block"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await saveToAlbum(); } finally { setSaving(false); }
          }}
        >
          <Icon name="bookmark" />
          <span>{updating ? t("Update Reference") : t("Save to Reference Album")}</span>
        </button>
        <div className="theme-btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              navigate("share");
              showToast(t("Upload this photo to share it with your room."));
            }}
          >
            <Icon name="chat" />
            {t("Share to Room")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await downloadSummary(canvases); } finally { setExporting(false); }
            }}
          >
            <Icon name="download" />
            {t("Download Summary")}
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={resetSession}>{t("Choose Another Photo")}</button>
      </div>
    </>
  );
}
