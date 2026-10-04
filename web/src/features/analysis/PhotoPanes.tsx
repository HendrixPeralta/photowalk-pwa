"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { useImageUrl } from "@/components/useImageUrl";
import { useRedrawOnResize } from "@/components/useRedrawOnResize";
import { DISPLAY_MAX_DIM, FLIPPABLE_OVERLAYS, OVERLAY_TYPES, ROTATABLE_OVERLAYS } from "@/lib/analysis/constants";
import { drawGuides } from "@/lib/analysis/drawGuides";
import type { Exif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { getData } from "@/state/appStore";
import type { AlbumItem, Overlay, OverlayType } from "@/state/types";
import { closeModal, openModal, showToast } from "@/state/ui";
import {
  enterCompare, exitCompare, flipOverlay, resetOverlay, rotateOverlay, setOverlayType, toneCurve, useAnalysis,
} from "./session";
import { TONE_CURVE_FILTER_ID } from "./AdvancedTools";
import { usePanZoom } from "./usePanZoom";

/** The size the photo is drawn at: big enough that zooming in shows real detail. */
function displaySize(image: HTMLImageElement): { w: number; h: number } {
  const scale = Math.min(1, DISPLAY_MAX_DIM / Math.max(image.naturalWidth, image.naturalHeight));
  return {
    w: Math.max(1, Math.round(image.naturalWidth * scale)),
    h: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

/** Draws `image` onto `canvas` (and sizes `overlay` to match). */
function paint(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, image: HTMLImageElement): void {
  const { w, h } = displaySize(image);
  canvas.width = w;
  canvas.height = h;
  overlay.width = w;
  overlay.height = h;
  canvas.getContext("2d")!.drawImage(image, 0, 0, w, h);
}

const overlayLabel = (type: OverlayType): string => {
  switch (type) {
    case "none": return t("No Guide");
    case "thirds": return t("Rule of Thirds");
    case "golden": return t("Golden Ratio");
    case "golden-triangles": return t("Golden Triangles");
    case "spiral-section": return t("Spiral Section");
    case "golden-spiral": return t("Golden Spiral");
  }
};

interface PaneRefs {
  imageRef: RefObject<HTMLCanvasElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Your photo with the guide over it, and the reference beside it in compare
 * mode, then the guide controls.
 */
export function PhotoPanes({ imageRef, overlayRef }: PaneRefs) {
  const frame = useAnalysis((s) => s.frame)!;
  const overlay = useAnalysis((s) => s.overlay);
  const exif = useAnalysis((s) => s.exif);
  const compare = useAnalysis((s) => s.compare);
  // Re-render on tone curve changes: the preview's filter follows the curve.
  useAnalysis((s) => s.curveVersion);
  const stackRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const redrawGuides = useCallback(() => {
    if (overlayRef.current) drawGuides(overlayRef.current, overlay);
  }, [overlayRef, overlay]);

  const { fit } = usePanZoom(stackRef, innerRef, overlayRef, redrawGuides);

  // A new photo: draw it, start unzoomed.
  useLayoutEffect(() => {
    if (imageRef.current && overlayRef.current) paint(imageRef.current, overlayRef.current, frame.image);
    fit();
  }, [frame, imageRef, overlayRef, fit]);
  useLayoutEffect(redrawGuides, [redrawGuides, frame]);
  useRedrawOnResize(overlayRef, redrawGuides);

  const { w, h } = displaySize(frame.image);
  // A straight curve drops the filter entirely, keeping the preview bit-exact.
  const curved = !toneCurve.isIdentity();

  return (
    <>
      <div className="compare-strip">
        <div className="compare-pane">
          <p className="compare-label">{t("Yours")}</p>
          <div className="canvas-stack" ref={stackRef} style={{ aspectRatio: `${w} / ${h}` }}>
            <div className="canvas-inner" ref={innerRef}>
              <canvas ref={imageRef} style={curved ? { filter: `url(#${TONE_CURVE_FILTER_ID})` } : undefined} />
              <canvas ref={overlayRef} />
            </div>
          </div>
          {/* The exposure sits with the frame, the way it is engraved on a camera. */}
          <ShotStrip exif={exif} />
        </div>
        {compare && <ReferencePane image={compare.image} overlay={overlay} />}
      </div>

      <GuideControls overlay={overlay} comparing={Boolean(compare)} onFit={fit} />
      <p className="hint">{t("Pinch or scroll to zoom, drag to move around, double-tap to zoom in.")}</p>
    </>
  );
}

function ReferencePane({ image, overlay }: { image: HTMLImageElement; overlay: Overlay }) {
  const imageRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const redraw = useCallback(() => {
    if (overlayRef.current) drawGuides(overlayRef.current, overlay);
  }, [overlay]);

  useLayoutEffect(() => {
    if (imageRef.current && overlayRef.current) paint(imageRef.current, overlayRef.current, image);
  }, [image]);
  useLayoutEffect(redraw, [redraw, image]);
  useRedrawOnResize(overlayRef, redraw);

  const { w, h } = displaySize(image);
  return (
    <div className="compare-pane">
      <p className="compare-label">{t("Reference")}</p>
      <div className="canvas-stack" style={{ aspectRatio: `${w} / ${h}` }}>
        <canvas ref={imageRef} />
        <canvas ref={overlayRef} />
      </div>
    </div>
  );
}

/**
 * Aperture, shutter and ISO, then lens and camera: values only, read as one
 * line. Every slot shows even when the file didn't record it, so the strip
 * keeps its shape, and a missing value reads as "not in this file" (screenshots
 * and messaging apps strip it) rather than as the app having nothing to say.
 */
function ShotStrip({ exif }: { exif: Exif | null }) {
  const camera = [exif?.make, exif?.model].filter(Boolean).join(" ") || undefined;
  const line = (values: (string | undefined)[]) =>
    values.map((value, i) => (
      <Fragment key={i}>
        {i > 0 && <i className="shot-sep" aria-hidden="true" />}
        {value ? <span>{value}</span> : <span className="shot-missing" title={t("Not recorded in this file")}>--</span>}
      </Fragment>
    ));

  return (
    <div className="shot-strip">
      <p className="shot-line shot-exposure">{line([exif?.aperture, exif?.shutter, exif?.iso])}</p>
      <p className="shot-line shot-gear">{line([exif?.focalLength, camera])}</p>
    </div>
  );
}

function GuideControls({ overlay, comparing, onFit }: { overlay: Overlay; comparing: boolean; onFit: () => void }) {
  return (
    <div className="overlay-controls guide-controls">
      <label className="visually-hidden" htmlFor="overlaySelect">{t("Composition guide")}</label>
      <select
        id="overlaySelect"
        className="chip-select"
        value={overlay.type}
        onChange={(e) => setOverlayType(e.target.value as OverlayType)}
      >
        {OVERLAY_TYPES.map((type) => <option key={type} value={type}>{overlayLabel(type)}</option>)}
      </select>
      {FLIPPABLE_OVERLAYS.includes(overlay.type) && (
        <button type="button" className="chip-btn" onClick={flipOverlay}>{t("Flip")}</button>
      )}
      {ROTATABLE_OVERLAYS.includes(overlay.type) && (
        <button type="button" className="chip-btn" onClick={rotateOverlay}>{t("Rotate")}</button>
      )}
      {comparing
        ? <button type="button" className="chip-btn" onClick={exitCompare}>{t("Exit Compare")}</button>
        : <button type="button" className="chip-btn" onClick={openComparePicker}>{t("Compare…")}</button>}
      <button type="button" className="chip-btn chip-btn-push" onClick={resetOverlay}>{t("Reset")}</button>
      <button type="button" className="chip-btn" onClick={onFit}>{t("Fit")}</button>
    </div>
  );
}

function openComparePicker(): void {
  const albumItemId = useAnalysis.getState().albumItemId;
  const candidates = getData().album.filter((item) => item.id !== albumItemId && item.imageId);
  if (!candidates.length) {
    showToast(t("Save a reference to your album first, then compare against it."));
    return;
  }
  openModal(<ComparePickerModal items={candidates} />);
}

function ComparePickerModal({ items }: { items: AlbumItem[] }) {
  return (
    <>
      <h3>{t("Compare with a reference")}</h3>
      <p className="muted">{t("Same guides on both, both histograms. Study what their photo does that yours doesn't.")}</p>
      <div className="album-grid compare-pick-grid">
        {items.map((item) => <CompareThumb key={item.id} item={item} />)}
      </div>
    </>
  );
}

function CompareThumb({ item }: { item: AlbumItem }) {
  const url = useImageUrl(item.imageId);
  return (
    <button
      type="button"
      className="album-thumb"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      onClick={() => {
        closeModal();
        void enterCompare(item);
      }}
    >
      <span className="album-thumb-tag">{t(item.aspectLabel)}</span>
    </button>
  );
}
