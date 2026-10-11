"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import { t } from "@/lib/i18n/core";
import { addFilter, removeFilter, useAlbumFilters, type FilterKey } from "./filters";

/** Each filter: its name, then the stored values and how they read. */
const FILTERS: { key: FilterKey; name: () => string; options: () => [string, string][] }[] = [
  {
    key: "brightness",
    name: () => t("Brightness"),
    options: () => [["Bright", t("Bright")], ["Balanced", t("Balanced")], ["Dark", t("Dark")]],
  },
  {
    key: "aspect",
    name: () => t("Shape"),
    options: () => [["Landscape", t("Landscape")], ["Portrait", t("Portrait")], ["Square", t("Square")]],
  },
  {
    key: "color",
    name: () => t("Color"),
    options: () => [
      ["Red", t("Red")], ["Orange", t("Orange")], ["Yellow", t("Yellow")], ["Green", t("Green")],
      ["Teal", t("Teal")], ["Blue", t("Blue")], ["Purple", t("Purple")], ["Pink", t("Pink")],
      ["Neutral", t("Neutral")], ["Black", t("Black")], ["White", t("White")],
    ],
  },
  {
    key: "focal",
    name: () => t("Focal length"),
    options: () => [["Wide", t("Wide (under 35mm)")], ["Normal", t("Normal (35–70mm)")], ["Tele", t("Tele (over 70mm)")]],
  },
  {
    key: "aperture",
    name: () => t("Aperture"),
    options: () => [["Fast", t("Fast (f/2.8 and wider)")], ["Mid", t("Mid (f/2.8–f/8)")], ["Deep", t("Deep (f/8 and narrower)")]],
  },
  {
    key: "location",
    name: () => t("Location"),
    options: () => [["yes", t("Has location")], ["no", t("No location")]],
  },
];

const byKey = (key: FilterKey) => FILTERS.find((f) => f.key === key)!;

/**
 * A menu hanging off its button. Closes on Escape (handing focus back to the
 * button) or on a press anywhere outside it.
 */
function Popover({ open, onClose, anchor, children }: { open: boolean; onClose: () => void; anchor: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="filter-pop" ref={ref}>
      {anchor}
      {open && <div className="filter-menu" role="menu">{children}</div>}
    </div>
  );
}

/** One filter in the bar: shows its value, and opens to change it, switch it off, or remove it. */
function FilterPill({ filterKey, open, setOpen }: { filterKey: FilterKey; open: boolean; setOpen: (open: boolean) => void }) {
  const filter = byKey(filterKey);
  const value = useAlbumFilters((s) => s[filterKey]);
  const options = filter.options();
  const valueLabel = options.find(([v]) => v === value)?.[1];
  // "All" switches the filter off but keeps it in the bar, ready to set again.
  const choices: [string, string][] = [["all", t("All")], ...options];

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <button
          type="button"
          className={`filter-pill${valueLabel ? " set" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>{valueLabel ? t("{filter}: {value}", { filter: filter.name(), value: valueLabel }) : filter.name()}</span>
          <Icon name="chevron-down" />
        </button>
      }
    >
      <p className="filter-menu-title">{filter.name()}</p>
      {choices.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="menuitemradio"
          aria-checked={v === value}
          className="filter-menu-item"
          autoFocus={v === value}
          onClick={() => {
            useAlbumFilters.setState({ [filterKey]: v });
            setOpen(false);
          }}
        >
          <span>{label}</span>
          {v === value && <Icon name="check" />}
        </button>
      ))}
      <hr className="filter-menu-rule" />
      <button type="button" role="menuitem" className="filter-menu-item filter-menu-remove" onClick={() => removeFilter(filterKey)}>
        <Icon name="close" />
        <span>{t("Remove filter")}</span>
      </button>
    </Popover>
  );
}

/**
 * Search plus a filter button, like a Notion database: the button lists every
 * filter, picking one puts it in the row below as its own dropdown.
 */
export function FilterBar() {
  const search = useAlbumFilters((s) => s.search);
  const shown = useAlbumFilters((s) => s.shown);
  const setCount = useAlbumFilters((s) => s.shown.filter((k) => s[k] !== "all").length);
  // Only one menu is open at a time: the filter list, or one pill's options.
  const [open, setOpen] = useState<"add" | FilterKey | null>(null);

  return (
    <>
      <div className="album-toolbar">
        <input
          type="text"
          className="text-input"
          placeholder={t("Search tags, camera, or settings")}
          aria-label={t("Search tags, camera, or settings")}
          value={search}
          onChange={(e) => useAlbumFilters.setState({ search: e.target.value })}
        />
        <Popover
          open={open === "add"}
          onClose={() => setOpen(null)}
          anchor={
            <button
              type="button"
              className={`filter-toggle${setCount ? " set" : ""}`}
              aria-label={t("Filter")}
              aria-haspopup="menu"
              aria-expanded={open === "add"}
              onClick={() => setOpen(open === "add" ? null : "add")}
            >
              <Icon name="filter" />
              {setCount > 0 && <span className="filter-count">{setCount}</span>}
            </button>
          }
        >
          <p className="filter-menu-title">{t("Filter by")}</p>
          {FILTERS.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={shown.includes(f.key)}
              className="filter-menu-item"
              autoFocus={i === 0}
              onClick={() => {
                addFilter(f.key);
                setOpen(f.key);
              }}
            >
              <span>{f.name()}</span>
              {shown.includes(f.key) && <Icon name="check" />}
            </button>
          ))}
        </Popover>
      </div>
      {shown.length > 0 && (
        <div className="filter-pills">
          {shown.map((key) => (
            <FilterPill key={key} filterKey={key} open={open === key} setOpen={(o) => setOpen(o ? key : null)} />
          ))}
        </div>
      )}
    </>
  );
}
