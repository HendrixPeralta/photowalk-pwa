"use client";

import { useEffect, useRef } from "react";
import { ToolHelpButton } from "@/features/toolhelp/ToolHelp";
import { t } from "@/lib/i18n/core";
import { AdvancedTools, ToneCurveFilter } from "./AdvancedTools";
import { PhotoPanes } from "./PhotoPanes";
import { Brightness, MainColors } from "./Readouts";
import { SaveSection } from "./SaveSection";
import { analyzeFile, loadDefaultPhoto, useAnalysis } from "./session";

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
      <div className="debrief-head">
        <span className="debrief-head-left">
          <span className="solar-dot" />
          <span className="label-caps">{t("Photo Breakdown")}</span>
        </span>
        <ToolHelpButton tool="composition" label={t("About composition guides")} />
      </div>

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
          <MainColors />
          <Brightness histogramRef={histogramRef} />
          <AdvancedTools />
          <SaveSection imageRef={imageRef} overlayRef={overlayRef} histogramRef={histogramRef} />
        </div>
      ) : (
        <div className="empty-state">
          <p>{t("Pick a photo to check its composition, main colors and brightness, with more detailed tools if you want to dig deeper.")}</p>
          <button type="button" className="btn btn-accent" onClick={() => inputRef.current?.click()}>{t("Choose Photo")}</button>
        </div>
      )}
    </section>
  );
}
