"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { t } from "@/lib/i18n/core";
import { themesApi, type ThemesFailure } from "@/lib/themesApi";
import type { MarketSort, SharedTheme } from "@/lib/themes/protocol";
import { useAppStore } from "@/state/appStore";
import { closeModal, openModal } from "@/state/ui";
import { addedLabel, addFromMarket, challengeCountLabel, reportShared, themeErrorMessage, unpublishShared } from "./market";

/** Waits this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 300;

/** Everyone's published themes: search, sort, and add a copy to My Themes. */
export function MarketScreen() {
  const [sort, setSort] = useState<MarketSort>("popular");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [themes, setThemes] = useState<SharedTheme[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ThemesFailure | null>(null);
  // Answers to an older search or sort are dropped when a newer one is out.
  const latest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query === search) return;
      setLoading(true);
      setSearch(query);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Whatever starts a load sets `loading` first; settling it is the answer's job.
  const settle = (offset: number, ticket: number, res: Awaited<ReturnType<typeof themesApi.list>>) => {
    if (ticket !== latest.current) return;
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    setThemes((prev) => (offset ? [...prev, ...res.data.themes] : res.data.themes));
    setMore(res.data.more);
  };

  // A new sort or search starts the list over.
  useEffect(() => {
    const ticket = ++latest.current;
    void themesApi.list(sort, search, 0).then((res) => settle(0, ticket, res));
  }, [sort, search]);

  const loadMore = () => {
    const ticket = ++latest.current;
    const offset = themes.length;
    setLoading(true);
    void themesApi.list(sort, search, offset).then((res) => settle(offset, ticket, res));
  };

  const drop = (id: string) => setThemes((prev) => prev.filter((th) => th.id !== id));

  const sortChip = (value: MarketSort, label: string) => (
    <button
      type="button"
      className={`chip-btn${sort === value ? " active" : ""}`}
      aria-pressed={sort === value}
      onClick={() => { if (value === sort) return; setLoading(true); setSort(value); }}
    >
      {label}
    </button>
  );

  return (
    <>
      <p className="muted card-text">{t("Themes other photographers have shared. Adding one saves your own copy to My Themes.")}</p>
      <input
        type="search"
        className="text-input"
        placeholder={t("Search the Market")}
        aria-label={t("Search the Market")}
        maxLength={60}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="theme-filter-chips" role="group" aria-label={t("Sort by")}>
        {sortChip("popular", t("Most added"))}
        {sortChip("new", t("Newest"))}
      </div>

      {error && <p className="empty-state-sm" role="alert">{themeErrorMessage(error)}</p>}
      {!error && !loading && !themes.length && (
        <p className="empty-state-sm">{search.trim() ? t("No themes match.") : t("No themes on the Market yet. Publish one of yours from Mine.")}</p>
      )}
      <ul className="rewards-list market-list">
        {themes.map((theme) => (
          <MarketCard key={theme.id} theme={theme} onGone={() => drop(theme.id)} />
        ))}
      </ul>
      {more && (
        <button type="button" className="btn btn-ghost btn-block market-more" disabled={loading} onClick={loadMore}>
          {t("Load more")}
        </button>
      )}
    </>
  );
}

function MarketCard({ theme, onGone }: { theme: SharedTheme; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addCount, setAddCount] = useState(theme.addCount);
  const haveCopy = useAppStore((s) => s.customThemes.some((th) => th.market?.id === theme.id));

  const add = async () => {
    setBusy(true);
    const ok = await addFromMarket(theme);
    setBusy(false);
    if (ok && !theme.added) setAddCount((n) => n + 1);
  };

  return (
    <li className="reward-item market-card">
      <button type="button" className="market-card-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="reward-title">{theme.title}</span>
        {theme.brief && <span className="muted market-brief">{theme.brief}</span>}
        <span className="market-meta">
          <Avatar user={theme.author} />
          <span>{theme.mine ? t("You") : theme.author.name}</span>
          <span aria-hidden="true">·</span>
          <span>{challengeCountLabel(theme.challenges.length)}</span>
          <span aria-hidden="true">·</span>
          <span>{addedLabel(addCount)}</span>
        </span>
      </button>
      {theme.hidden && <p className="market-hidden">{t("Hidden from the Market after reports. Only you can see it.")}</p>}
      {open && (
        theme.challenges.length ? (
          <ul className="market-challenges">
            {theme.challenges.map((c) => <li key={c}>{c}</li>)}
          </ul>
        ) : (
          <p className="muted market-challenges">{t("No mini-challenges. A theme to walk with as it is.")}</p>
        )
      )}
      <div className="reward-actions market-actions">
        {theme.mine ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(<UnpublishModal id={theme.id} onDone={onGone} />)}>
            {t("Unpublish")}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-accent btn-sm" disabled={busy || haveCopy} onClick={() => void add()}>
              {haveCopy ? t("Added") : t("Add")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(<ReportModal id={theme.id} title={theme.title} onDone={onGone} />)}>
              {t("Report")}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function UnpublishModal({ id, onDone }: { id: string; onDone?: () => void }) {
  return (
    <>
      <h3>{t("Take this theme off the Market?")}</h3>
      <p className="muted">{t("People who already added it keep their copy. Your own theme stays in My Themes.")}</p>
      <div className="theme-actions">
        <button
          type="button"
          className="btn btn-danger-solid"
          onClick={async () => { closeModal(); if (await unpublishShared(id)) onDone?.(); }}
        >
          {t("Unpublish")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
    </>
  );
}

function ReportModal({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  return (
    <>
      <h3>{t("Report \"{title}\"?", { title })}</h3>
      <p className="muted">{t("Report themes that are offensive, spam, or not about photography. Themes reported by several people are hidden until they're reviewed.")}</p>
      <div className="theme-actions">
        <button
          type="button"
          className="btn btn-danger-solid"
          onClick={async () => { closeModal(); if (await reportShared(id)) onDone(); }}
        >
          {t("Report")}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
    </>
  );
}
