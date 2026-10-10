"use client";

import { useCallback, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Trans } from "@/components/Trans";
import { useRedrawOnResize } from "@/components/useRedrawOnResize";
import { ToolHelpButton } from "@/features/toolhelp/ToolHelp";
import type { ToolKey } from "@/features/toolhelp/content";
import { t } from "@/lib/i18n/core";
import {
  chromaticitySummary, paradeSummary, vectorscopeSummary, waveformSummary, type Reading,
} from "@/lib/interpret";
import type { ScopeStats, Scopes } from "@/lib/scopes/compute";
import { drawChromaticity, drawParade, drawVectorscope, drawWaveform } from "@/lib/scopes/draw";
import { drawToneCurve } from "@/lib/tonecurve/draw";
import { toneCurve, useAnalysis, type ScopeKey, type ScopeView } from "./session";

export const TONE_CURVE_FILTER_ID = "toneCurveFilter";

/** "<strong>Label.</strong> Caption." */
export function ReadingText({ reading }: { reading: Reading }) {
  return <Trans k="<strong>{label}.</strong> {caption}" values={{ label: reading.label, caption: reading.caption }} />;
}

interface ScopeInfo {
  key: Exclude<ScopeKey, "tonecurve">;
  tab: () => string;
  name: () => string;
  sub: () => string;
  help: () => string;
  draw: (canvas: HTMLCanvasElement, scopes: Scopes) => void;
  read: (stats: ScopeStats) => Reading;
}

const SCOPES: ScopeInfo[] = [
  {
    key: "waveform", tab: () => t("Waveform"), name: () => t("Waveform"), help: () => t("About Waveform"),
    sub: () => t("brightness, left to right across the photo"), draw: drawWaveform, read: waveformSummary,
  },
  {
    key: "parade", tab: () => t("Parade"), name: () => t("RGB Parade"), help: () => t("About RGB Parade"),
    sub: () => t("the same, split into red, green and blue"), draw: drawParade, read: paradeSummary,
  },
  {
    key: "vectorscope", tab: () => t("Vector"), name: () => t("Vectorscope"), help: () => t("About Vectorscope"),
    sub: () => t("which colors, and how strong"), draw: drawVectorscope, read: vectorscopeSummary,
  },
  {
    key: "cie", tab: () => t("CIE"), name: () => t("CIE Chromaticity"), help: () => t("About CIE Chromaticity"),
    sub: () => t("the range of colors in the photo"), draw: drawChromaticity, read: chromaticitySummary,
  },
];

const TABS: { view: ScopeView; label: () => string }[] = [
  ...SCOPES.map((s) => ({ view: s.key as ScopeView, label: s.tab })),
  { view: "tonecurve", label: () => t("Tone Curve") },
  { view: "all", label: () => t("All 5") },
];

/**
 * Waveform, RGB Parade, Vectorscope, CIE and the Tone Curve, one at a time or
 * all together. Folded away by default; nothing is drawn until it is opened,
 * since a hidden canvas has no size to draw at.
 */
export function AdvancedTools() {
  const scopes = useAnalysis((s) => s.frame!.scopes);
  const view = useAnalysis((s) => s.scopeView);
  const open = useAnalysis((s) => s.scopesOpen);

  return (
    <details
      className="theme-card collapse-card scopes-details"
      open={open}
      onToggle={(e) => useAnalysis.setState({ scopesOpen: e.currentTarget.open })}
    >
      <summary className="collapse-summary">
        <span className="collapse-title">{t("Advanced Tools")}</span>
        <span className="muted collapse-meta">{t("A closer look at brightness and color")}</span>
        <svg className="collapse-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="collapse-body">
        <div className="overlay-controls">
          {TABS.map((tab) => (
            <button
              key={tab.view}
              type="button"
              className={`chip-btn${view === tab.view ? " active" : ""}`}
              aria-pressed={view === tab.view}
              onClick={() => useAnalysis.setState({ scopeView: tab.view })}
            >
              {tab.label()}
            </button>
          ))}
        </div>
        <div className={`scope-grid${view === "all" ? " scope-grid-all" : ""}`}>
          {SCOPES.map((scope) => (
            <ScopeCell key={scope.key} scope={scope} scopes={scopes} shown={open && (view === "all" || view === scope.key)} />
          ))}
          <ToneCurveCell shown={open && (view === "all" || view === "tonecurve")} />
        </div>
      </div>
    </details>
  );
}

function ScopeName({ name, help, tool, sub }: { name: string; help: string; tool: ToolKey; sub: string }) {
  return (
    <figcaption className="scope-name">
      {name} <span>{sub}</span> <ToolHelpButton tool={tool} label={help} />
    </figcaption>
  );
}

function ScopeCell({ scope, scopes, shown }: { scope: ScopeInfo; scopes: Scopes; shown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const canvas = ref.current;
    if (shown && canvas?.clientWidth) scope.draw(canvas, scopes);
  }, [scope, scopes, shown]);
  useLayoutEffect(draw, [draw]);
  useRedrawOnResize(ref, draw);

  return (
    <figure className={`scope-cell${shown ? "" : " hidden"}`} data-scope={scope.key}>
      <ScopeName name={scope.name()} help={scope.help()} tool={scope.key} sub={scope.sub()} />
      <canvas ref={ref} className="scope-canvas" />
      <p className="hint scope-caption">{shown && <ReadingText reading={scope.read(scopes.stats)} />}</p>
    </figure>
  );
}

/**
 * Measured shows how the photo's tones are spread; Adjust bends the curve and
 * previews it live on the photo through an SVG filter, so a drag never
 * re-reads the image.
 */
function ToneCurveCell({ shown }: { shown: boolean }) {
  const version = useAnalysis((s) => s.curveVersion);
  const ref = useRef<HTMLCanvasElement>(null);
  const adjusting = toneCurve.mode === "adjust";

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (shown && canvas?.clientWidth) drawToneCurve(canvas, toneCurve);
  }, [shown]);
  useLayoutEffect(draw, [draw, version]);
  useRedrawOnResize(ref, draw);

  const at = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };
  const end = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    toneCurve.pointerEnd();
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <figure className={`scope-cell${shown ? "" : " hidden"}`} data-scope="tonecurve">
      <ScopeName
        name={t("Tone Curve")}
        help={t("About Tone Curve")}
        tool="tonecurve"
        sub={t("how the photo's light and dark tones are spread")}
      />
      <div className="overlay-controls curve-modes">
        <button type="button" className={`chip-btn${adjusting ? "" : " active"}`} aria-pressed={!adjusting} onClick={() => toneCurve.setMode("measured")}>
          {t("Measured")}
        </button>
        <button type="button" className={`chip-btn${adjusting ? " active" : ""}`} aria-pressed={adjusting} onClick={() => toneCurve.setMode("adjust")}>
          {t("Adjust")}
        </button>
      </div>
      <canvas
        ref={ref}
        className="scope-canvas curve-canvas"
        onPointerDown={(e) => {
          if (!toneCurve.pointerDown(...at(e))) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => { if (toneCurve.pointerMove(...at(e))) e.preventDefault(); }}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => toneCurve.removeAt(...at(e))}
      />
      <div className="curve-actions">
        {adjusting && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={toneCurve.isIdentity()} onClick={() => toneCurve.reset()}>
            {t("Reset curve")}
          </button>
        )}
        <span className="hint curve-hint">
          {adjusting
            ? t("Tap to add a point · double-tap one to remove it")
            : t("This is measured from your photo. Switch to Adjust to try changes.")}
        </span>
      </div>
      <p className="hint scope-caption">{shown && <ReadingText reading={toneCurve.summary()} />}</p>
    </figure>
  );
}

/**
 * The tone curve as a GPU lookup the photo's canvas is filtered through, so a
 * drag stays smooth on a phone where re-processing pixels would not.
 */
export function ToneCurveFilter() {
  useAnalysis((s) => s.curveVersion);
  const table = toneCurve.tableValues();
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id={TONE_CURVE_FILTER_ID} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues={table} />
          <feFuncG type="table" tableValues={table} />
          <feFuncB type="table" tableValues={table} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
