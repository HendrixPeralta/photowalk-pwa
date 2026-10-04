"use client";

import { useImageUrl } from "@/components/useImageUrl";
import { openAnalysis } from "@/features/analysis/request";
import { exifRows } from "@/lib/analysis/album";
import { themeById } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { formatDate } from "@/lib/util";
import { useAppStore } from "@/state/appStore";
import type { AlbumItem } from "@/state/types";
import { closeModal, openModal } from "@/state/ui";
import { matchesFilters, useAlbumFilters, type AlbumFilters } from "./filters";
import { deleteReference } from "./references";

type FilterKey = Exclude<keyof AlbumFilters, "search">;

/** Each dropdown: its "any" label, then the stored values and how they read. */
const FILTERS: { key: FilterKey; any: () => string; options: () => [string, string][] }[] = [
  {
    key: "brightness",
    any: () => t("Any brightness"),
    options: () => [["Bright", t("Bright")], ["Balanced", t("Balanced")], ["Dark", t("Dark")]],
  },
  {
    key: "aspect",
    any: () => t("Any shape"),
    options: () => [["Landscape", t("Landscape")], ["Portrait", t("Portrait")], ["Square", t("Square")]],
  },
  {
    key: "color",
    any: () => t("Any color"),
    options: () => [
      ["Red", t("Red")], ["Orange", t("Orange")], ["Yellow", t("Yellow")], ["Green", t("Green")],
      ["Teal", t("Teal")], ["Blue", t("Blue")], ["Purple", t("Purple")], ["Pink", t("Pink")],
      ["Neutral", t("Neutral")], ["Black", t("Black")], ["White", t("White")],
    ],
  },
  {
    key: "focal",
    any: () => t("Any focal length"),
    options: () => [["Wide", t("Wide (under 35mm)")], ["Normal", t("Normal (35–70mm)")], ["Tele", t("Tele (over 70mm)")]],
  },
  {
    key: "aperture",
    any: () => t("Any aperture"),
    options: () => [["Fast", t("Fast (f/2.8 and wider)")], ["Mid", t("Mid (f/2.8–f/8)")], ["Deep", t("Deep (f/8 and narrower)")]],
  },
  {
    key: "location",
    any: () => t("Any location"),
    options: () => [["yes", t("Has location")], ["no", t("No location")]],
  },
];

function FilterSelect({ filter }: { filter: (typeof FILTERS)[number] }) {
  const value = useAlbumFilters((s) => s[filter.key]);
  return (
    <select
      aria-label={filter.any()}
      value={value}
      onChange={(e) => useAlbumFilters.setState({ [filter.key]: e.target.value })}
    >
      <option value="all">{filter.any()}</option>
      {filter.options().map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

/** Saved references, filterable by look, lens, settings and place, and searchable. */
export function AlbumScreen() {
  const album = useAppStore((s) => s.album);
  const filters = useAlbumFilters();
  const items = album.filter((item) => matchesFilters(item, filters));

  return (
    <section className="view" data-view="album">
      <h2 className="section-title">{t("Reference Album")}</h2>
      <div className="filter-row">
        {FILTERS.slice(0, 3).map((f) => <FilterSelect key={f.key} filter={f} />)}
      </div>
      <div className="filter-row">
        {FILTERS.slice(3).map((f) => <FilterSelect key={f.key} filter={f} />)}
      </div>
      <input
        type="text"
        className="text-input"
        placeholder={t("Search tags, camera, or settings")}
        aria-label={t("Search tags, camera, or settings")}
        value={filters.search}
        onChange={(e) => useAlbumFilters.setState({ search: e.target.value })}
      />

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
  const rows = exifRows(item.exif);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimize */}
      {url && <img className="detail-image" src={url} alt={t("Saved reference")} />}
      {url === null && <p className="muted">{t("This photo is missing from storage.")}</p>}
      <div className="detail-meta">
        {labels.map((label) => <span key={label} className="chip">{t(label)}</span>)}
        {theme && <span className="chip">{t("Walk: {theme}", { theme: theme.title })}</span>}
        <span className="chip chip-muted">{t("Saved {date}", { date: formatDate(item.savedAt) })}</span>
      </div>
      <div className="swatch-row">
        {item.colors.map((hex, i) => <span key={i} className="swatch-sm" style={{ background: hex }} title={hex} />)}
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
      {rows.length ? (
        <dl className="exif-list">
          {rows.map((row) => [
            <dt key={`${row.field}-k`}>{row.label}</dt>,
            <dd key={`${row.field}-v`}>
              {row.href ? <a className="exif-link" href={row.href} target="_blank" rel="noopener noreferrer">{row.value}</a> : row.value}
            </dd>,
          ])}
        </dl>
      ) : (
        <p className="muted">{t("No EXIF metadata found for this image.")}</p>
      )}
      {url && (
        <button
          type="button"
          className="btn btn-accent btn-block"
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
        className="btn btn-danger"
        onClick={() => {
          closeModal();
          void deleteReference(item.id);
        }}
      >
        {t("Delete from Album")}
      </button>
    </>
  );
}
