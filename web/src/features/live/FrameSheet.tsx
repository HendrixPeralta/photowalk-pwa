"use client";

import { Fragment, useId, useState } from "react";
import { useImageUrl } from "@/components/useImageUrl";
import { t } from "@/lib/i18n/core";
import { useAppStore } from "@/state/appStore";
import type { Frame } from "@/state/types";
import { closeModal } from "@/state/ui";
import { removeFrame, setFrameLabel } from "./actions";

function exifRows(frame: Frame): [string, string][] {
  const exif = frame.exif;
  if (!exif) return [];
  const rows: [string, string | undefined][] = [
    [t("Camera"), [exif.make, exif.model].filter(Boolean).join(" ")],
    [t("Focal"), exif.focalLength],
    [t("Aperture"), exif.aperture],
    [t("Shutter"), exif.shutter],
    [t("ISO"), exif.iso],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

/** One logged photo: a short label, its camera data, or remove it from the walk. */
export function FrameSheetModal({ frameId }: { frameId: string }) {
  const frame = useAppStore((s) => s.activeWalk?.frames?.find((f) => f.id === frameId));
  const [label, setLabel] = useState(frame?.label ?? "");
  const url = useImageUrl(frame?.imageId);
  const labelId = useId();
  if (!frame) return null;

  const rows = exifRows(frame);

  return (
    <>
      <h3>{t("Frame #{n}", { n: frame.index })}</h3>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      {url && <img className="detail-image" src={url} alt="" />}
      <div className="field-row">
        <label htmlFor={labelId}>{t("Label")}</label>
        <input
          id={labelId}
          type="text"
          className="text-input"
          maxLength={24}
          placeholder={t("Rim, Portal, Vector…")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {rows.length ? (
        <dl className="exif-list">
          {rows.map(([field, value]) => (
            <Fragment key={field}>
              <dt>{field}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p className="muted">{t("No EXIF in this file.")}</p>
      )}
      <div className="theme-actions">
        <button
          type="button"
          className="btn btn-accent btn-block"
          onClick={() => {
            setFrameLabel(frame.id, label);
            closeModal();
          }}
        >
          {t("Save label")}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            closeModal();
            removeFrame(frame.id);
          }}
        >
          {t("Remove frame")}
        </button>
      </div>
    </>
  );
}
