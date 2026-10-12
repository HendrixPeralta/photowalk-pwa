"use client";

import { Icon } from "@/components/icons/Icon";
import { useImageUrl } from "@/components/useImageUrl";
import { openAnalysis } from "@/features/analysis/request";
import { themeById } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { formatDate } from "@/lib/util";
import { useAppStore } from "@/state/appStore";
import type { AlbumItem } from "@/state/types";
import { closeModal, openModal } from "@/state/ui";
import { FilterBar } from "./FilterBar";
import { matchesFilters, useAlbumFilters } from "./filters";
import { deleteReference } from "./references";

/** Saved references, filterable by look, lens, settings and place, and searchable. */
export function AlbumScreen() {
  const album = useAppStore((s) => s.album);
  const filters = useAlbumFilters();
  const items = album.filter((item) => matchesFilters(item, filters));

  return (
    <section className="view" data-view="album">
      <FilterBar />

      {!items.length && (
        <p className="empty-state-sm">
          {album.length ? t("No references match these filters.") : t("No references yet. Save one from the Analysis tab.")}
        </p>
      )}
      <div className="album-grid">
        {items.map((item) => <AlbumThumb key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function AlbumThumb({ item }: { item: AlbumItem }) {
  const url = useImageUrl(item.imageId);
  return (
    <button
      type="button"
      className="album-thumb"
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      onClick={() => openModal(<ReferenceDetail id={item.id} />)}
    >
      <span className="album-thumb-tag">{t(item.aspectLabel)}</span>
    </button>
  );
}

/** One reference: the photo, its labels and colors, tags, notes and camera data. */
function ReferenceDetail({ id }: { id: string }) {
  const item = useAppStore((s) => s.album.find((i) => i.id === id));
  const customThemes = useAppStore((s) => s.customThemes);
  const url = useImageUrl(item?.imageId);
  if (!item) return null;

  const theme = themeById(item.themeId, customThemes);
  const labels = [item.aspectLabel, item.brightnessLabel, item.colorName, item.focalLabel, item.apertureLabel]
    .filter((label): label is NonNullable<typeof label> => Boolean(label));
  const notes = (item.notes ?? []).filter((n) => n?.a);
  const settings = [item.exif?.focalLength, item.exif?.aperture, item.exif?.shutter];

  return (
    <>
      <div className="detail-date">
        <span className="chip chip-muted">{t("Saved {date}", { date: formatDate(item.savedAt) })}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      {url && <img className="detail-image" src={url} alt={t("Saved reference")} />}
      {url === null && <p className="muted">{t("This photo is missing from storage.")}</p>}
      <div className="detail-strip">
        <div className="swatch-row">
          {item.colors.map((hex, i) => <span key={i} className="swatch-sm" style={{ background: hex }} title={hex} />)}
        </div>
        <p className="detail-settings">
          {settings.map((value, i) => <span key={i} className={value ? undefined : "muted"}>{value || "--"}</span>)}
        </p>
      </div>
      <div className="detail-meta">
        {labels.map((label) => <span key={label} className="chip">{t(label)}</span>)}
        {theme && <span className="chip">{t("Walk: {theme}", { theme: theme.title })}</span>}
      </div>
      {item.tags.length > 0 && (
        <p className="tag-list">{item.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}</p>
      )}
      {notes.length > 0 && (
        <>
          <h4 className="subsection-title">{t("Your notes")}</h4>
          <dl className="exif-list notes-list">
            {notes.map((n, i) => [<dt key={`q${i}`}>{n.q}</dt>, <dd key={`a${i}`}>{n.a}</dd>])}
          </dl>
        </>
      )}
      <div className="theme-btn-row detail-actions">
        {url && (
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              closeModal();
              openAnalysis({ imageId: item.imageId, exif: item.exif, albumItemId: item.id, overlay: item.overlay, tags: item.tags });
            }}
          >
            {t("Analyze this shot")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger btn-icon-only"
          aria-label={t("Delete from Album")}
          title={t("Delete from Album")}
          onClick={() => {
            closeModal();
            void deleteReference(item.id);
          }}
        >
          <Icon name="trash" />
        </button>
      </div>
    </>
  );
}
