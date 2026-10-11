"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { Icon } from "@/components/icons/Icon";
import { useRedrawOnResize } from "@/components/useRedrawOnResize";
import { ToolHelpButton } from "@/features/toolhelp/ToolHelp";
import { drawHistogram } from "@/lib/analysis/drawHistogram";
import type { HistogramBin } from "@/lib/analysis/histogram";
import { gamutClusters, tonalKeyNote } from "@/lib/deconstruct";
import { t } from "@/lib/i18n/core";
import { histogramSummary, paletteRelationship } from "@/lib/interpret";
import { showToast } from "@/state/ui";
import { ReadingText } from "./AdvancedTools";
import { useAnalysis } from "./session";

function copyHex(hex: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(hex).then(() => showToast(t("Copied {hex}", { hex }))).catch(() => showToast(hex));
  } else {
    showToast(hex);
  }
}

/** The handful of colors that fill most of the photo, sized by share, and the scheme they make. */
export function MainColors() {
  const palette = useAnalysis((s) => s.frame!.palette);
  const clusters = gamutClusters(palette);
  const relation = palette.length ? paletteRelationship(palette) : null;

  return (
    <>
      <div className="help-head">
        <h4 className="subsection-title">{t("Main Colors")}</h4>
        <ToolHelpButton tool="gamut" label={t("About Main Colors")} />
      </div>
      <div className="gamut-bar">
        {clusters.map((c, i) => (
          <button
            key={i}
            type="button"
            className="gamut-bar-swatch"
            style={{ background: c.hex, width: `${(c.share * 100).toFixed(2)}%` }}
            title={t("{hex}, {pct}%. Click to copy.", { hex: c.hex, pct: Math.round(c.share * 100) })}
            onClick={() => copyHex(c.hex)}
          >
            <span className="gamut-bar-hex">{c.hex}</span>
          </button>
        ))}
      </div>
      {relation && (
        <div className="harmony-row">
          <Icon name="compare" />
          <div>
            <span className="label-caps">{t("Color Harmony")}</span>
            <strong>{relation.label}</strong>
          </div>
        </div>
      )}
      <p className="hint">{relation && <ReadingText reading={relation} />}</p>
    </>
  );
}

/** A histogram canvas that redraws itself when its width changes. */
function HistogramCanvas({ bins, canvasRef }: { bins: HistogramBin[]; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const draw = useCallback(() => {
    if (canvasRef.current) drawHistogram(canvasRef.current, bins, histogramSummary(bins));
  }, [canvasRef, bins]);
  useLayoutEffect(draw, [draw]);
  useRedrawOnResize(canvasRef, draw);
  return <canvas ref={canvasRef} className="histogram-canvas" />;
}

/**
 * The brightness chart (with the reference's beside it when comparing), and
 * the tonal key it adds up to.
 */
export function Brightness({ histogramRef }: { histogramRef: RefObject<HTMLCanvasElement | null> }) {
  const frameId = useAnalysis((s) => s.frame!.id);
  const bins = useAnalysis((s) => s.frame!.hist.bins);
  const compareBins = useAnalysis((s) => s.compare?.hist.bins);
  const compareRef = useRef<HTMLCanvasElement>(null);
  const summary = histogramSummary(bins);
  const note = tonalKeyNote(bins, summary);

  return (
    <>
      <div className="help-head">
        <h4 className="subsection-title">{t("Brightness Chart")}</h4>
        <ToolHelpButton tool="histogram" label={t("About Brightness Chart")} />
      </div>
      <div className="hist-grid">
        <div>
          <p className="compare-label">{t("Yours")}</p>
          <HistogramCanvas bins={bins} canvasRef={histogramRef} />
          <p className="hint">{summary.caption}</p>
        </div>
        {compareBins && (
          <div>
            <p className="compare-label">{t("Reference")}</p>
            <HistogramCanvas bins={compareBins} canvasRef={compareRef} />
            <p className="hint">{histogramSummary(compareBins).caption}</p>
          </div>
        )}
      </div>

      {/* Keyed by photo, so a new photo starts with the note folded. */}
      <details key={frameId} className="diag-note">
        <summary className="collapse-summary diag-note-summary">
          <Icon name="contrast" className="diag-note-icon" />
          <div className="diag-note-head">
            <strong>{note.title}</strong>
            <span className="diag-note-tag">{note.tag}</span>
            <ToolHelpButton tool="tonalkey" label={t("About Tonal Key")} />
          </div>
          <svg className="collapse-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <p>{note.text}</p>
      </details>
    </>
  );
}
