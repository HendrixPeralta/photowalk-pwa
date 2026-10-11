"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { t } from "@/lib/i18n/core";
import { AdvancedTools, ToneCurveFilter } from "./AdvancedTools";
import { PhotoPanes } from "./PhotoPanes";
import { Brightness, MainColors } from "./Readouts";
import { SaveSection } from "./SaveSection";
import { analyzeFile, loadDefaultPhoto, useAnalysis, type ReadoutTab } from "./session";

/**
 * Photo Breakdown: composition guides, main colors, brightness and tonal key,
 * scopes and the tone curve for one photo, then save, share or download it.
 */
export function AnalysisScreen() {
  const hasPhoto = useAnalysis((s) => Boolean(s.frame));
  const comparing = useAnalysis((s) => Boolean(s.compare));
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const histogramRef = useRef<HTMLCanvasElement>(null);

  // A first visit opens the bundled sample, so every tool has something to read.
  useEffect(() => {
    void loadDefaultPhoto();
  }, []);

  return (
    <section className="view" data-view="analyze">
      <ToneCurveFilter />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void analyzeFile(file);
        }}
      />

      {hasPhoto ? (
        <div className={comparing ? "comparing" : undefined}>
          <PhotoPanes imageRef={imageRef} overlayRef={overlayRef} />
          <ReadoutTabs histogramRef={histogramRef} />
          <SaveSection imageRef={imageRef} overlayRef={overlayRef} histogramRef={histogramRef} />
        </div>
      ) : (
        // The same big start square as Live Walk before a walk.
        <button type="button" className="live-start live-start-note" onClick={() => inputRef.current?.click()}>
          {t("Choose Photo")}
          <small>{t("Pick a photo to check its composition, main colors and brightness, with more detailed tools if you want to dig deeper.")}</small>
        </button>
      )}
    </section>
  );
}

const TABS: { tab: ReadoutTab; label: () => string }[] = [
  { tab: "color", label: () => t("Color") },
  { tab: "light", label: () => t("Light") },
  { tab: "advanced", label: () => t("Advanced") },
];

/**
 * Main colors, brightness and the advanced tools, one tab at a time. Every
 * panel stays mounted so the summary download can still read the histogram.
 */
function ReadoutTabs({ histogramRef }: { histogramRef: RefObject<HTMLCanvasElement | null> }) {
  const active = useAnalysis((s) => s.readoutTab);
  const panels: Record<ReadoutTab, ReactNode> = {
    color: <MainColors />,
    light: <Brightness histogramRef={histogramRef} />,
    advanced: <AdvancedTools />,
  };

  return (
    <div className="readout-tabs">
      <div className="readout-tab-bar" role="tablist" aria-label={t("Photo readouts")}>
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`readout-tab-${tab}`}
            aria-selected={active === tab}
            aria-controls={`readout-panel-${tab}`}
            className={`readout-tab${active === tab ? " active" : ""}`}
            onClick={() => useAnalysis.setState({ readoutTab: tab })}
          >
            {label()}
          </button>
        ))}
      </div>
      {TABS.map(({ tab }) => (
        <div
          key={tab}
          role="tabpanel"
          id={`readout-panel-${tab}`}
          aria-labelledby={`readout-tab-${tab}`}
          className="readout-panel"
          hidden={active !== tab}
        >
          {panels[tab]}
        </div>
      ))}
    </div>
  );
}
