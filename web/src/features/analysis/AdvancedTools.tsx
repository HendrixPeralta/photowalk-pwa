"use client";

import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Trans } from "@/components/Trans";
import { Icon } from "@/components/icons/Icon";
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
  help: () => string;
  draw: (canvas: HTMLCanvasElement, scopes: Scopes) => void;
  read: (stats: ScopeStats) => Reading;
}

const SCOPES: ScopeInfo[] = [
  {
    key: "waveform", tab: () => t("Waveform"), name: () => t("Waveform"), help: () => t("About Waveform"),
    draw: drawWaveform, read: waveformSummary,
  },
  {
    key: "parade", tab: () => t("Parade"), name: () => t("RGB Parade"), help: () => t("About RGB Parade"),
    draw: drawParade, read: paradeSummary,
  },
  {
    key: "vectorscope", tab: () => t("Vector"), name: () => t("Vectorscope"), help: () => t("About Vectorscope"),
    draw: drawVectorscope, read: vectorscopeSummary,
  },
  {
    key: "cie", tab: () => t("CIE"), name: () => t("CIE Chromaticity"), help: () => t("About CIE Chromaticity"),
    draw: drawChromaticity, read: chromaticitySummary,
  },
];

const TABS: { view: ScopeView; label: () => string }[] = [
  ...SCOPES.map((s) => ({ view: s.key as ScopeView, label: s.tab })),
  { view: "tonecurve", label: () => t("Tone Curve") },
  { view: "all", label: () => t("All") },
];

/**
 * Waveform, RGB Parade, Vectorscope, CIE and the Tone Curve, one at a time or
 * all together. Nothing is drawn until its tab is open, since a hidden canvas
 * has no size to draw at.
 */
export function AdvancedTools() {
  const scopes = useAnalysis((s) => s.frame!.scopes);
  const view = useAnalysis((s) => s.scopeView);
  const open = useAnalysis((s) => s.readoutTab === "advanced");

  return (
    <>
      <div className="sub-tab-bar" role="tablist" aria-label={t("Advanced Tools")}>
        {TABS.map((tab) => (
          <button
            key={tab.view}
            type="button"
            role="tab"
            id={`scope-tab-${tab.view}`}
            aria-selected={view === tab.view}
            aria-controls="scope-panel"
            className={`sub-tab${view === tab.view ? " active" : ""}`}
            onClick={() => useAnalysis.setState({ scopeView: tab.view })}
          >
            {tab.label()}
          </button>
        ))}
      </div>
      <div
        id="scope-panel"
        role="tabpanel"
        aria-labelledby={`scope-tab-${view}`}
        className={`scope-grid${view === "all" ? " scope-grid-all" : ""}`}
      >
        {SCOPES.map((scope) => (
          <ScopeCell key={scope.key} scope={scope} scopes={scopes} shown={open && (view === "all" || view === scope.key)} />
        ))}
        <ToneCurveCell shown={open && (view === "all" || view === "tonecurve")} />
      </div>
    </>
  );
}

/** The "Learn more" under a scope, after its reading. */
function ScopeHelp({ help, tool }: { help: string; tool: ToolKey }) {
  return (
    <div className="scope-help">
      <ToolHelpButton tool={tool} label={help} />
    </div>
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
      <figcaption className="scope-name">{scope.name()}</figcaption>
      <canvas ref={ref} className="scope-canvas" />
      <p className="hint scope-caption">{shown && <ReadingText reading={scope.read(scopes.stats)} />}</p>
      <ScopeHelp help={scope.help()} tool={scope.key} />
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
  const [hintOpen, setHintOpen] = useState(false);

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
      <figcaption className="scope-name">{t("Tone Curve")}</figcaption>
      <div className="overlay-controls curve-modes">
        <button type="button" className={`chip-btn${adjusting ? "" : " active"}`} aria-pressed={!adjusting} onClick={() => toneCurve.setMode("measured")}>
          {t("Measured")}
        </button>
        <button type="button" className={`chip-btn${adjusting ? " active" : ""}`} aria-pressed={adjusting} onClick={() => toneCurve.setMode("adjust")}>
          {t("Adjust")}
        </button>
        {adjusting && (
          <button
            type="button"
            className="chip-btn chip-btn-icon chip-btn-push"
            aria-label={t("Reset curve")}
            title={t("Reset curve")}
            disabled={toneCurve.isIdentity()}
            onClick={() => toneCurve.reset()}
          >
            <Icon name="reset" />
          </button>
        )}
        <button
          type="button"
          className={`chip-btn chip-btn-icon${adjusting ? "" : " chip-btn-push"}${hintOpen ? " active" : ""}`}
          aria-label={t("How to use the curve")}
          aria-expanded={hintOpen}
          aria-controls="curve-hint"
          onClick={() => setHintOpen((o) => !o)}
        >
          ?
        </button>
      </div>
      {hintOpen && (
        <p id="curve-hint" className="hint curve-hint">
          {adjusting
            ? t("Tap to add a point · double-tap one to remove it")
            : t("This is measured from your photo. Switch to Adjust to try changes.")}
        </p>
      )}
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
      <p className="hint scope-caption">{shown && <ReadingText reading={toneCurve.summary()} />}</p>
      <ScopeHelp help={t("About Tone Curve")} tool="tonecurve" />
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
