"use client";

import { useMemo, useState } from "react";
import { putThemeOnHand } from "@/features/walks/actions";
import { useWalkUi } from "@/features/walks/walkUi";
import { allChallenges, themeById, themes, type Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { navigate, navigateTo } from "@/lib/nav";
import { uid } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import { showToast } from "@/state/ui";

/** "all", "picked", or a built-in theme's id: which challenges the list shows. */
type Filter = string;

/**
 * Builds a theme from the user's own mini-challenges plus any of the existing
 * ones. Also the editor for an existing theme: a custom theme is updated in
 * place, while a built-in one is saved as a new custom copy (the built-in
 * list is shared and can't be rewritten per user).
 *
 * Opened from the walk's theme picker (`fromWalk`), it heads back to Live
 * afterwards and reopens the brief, since leaving the pop-ups let that walk go.
 */
export function ThemeEditorScreen({ themeId, fromWalk }: { themeId: string | null; fromWalk: boolean }) {
  const [existing] = useState<Theme | null>(() => themeById(themeId, getData().customThemes) ?? null);
  const pool = useMemo(() => allChallenges(), []);
  const builtIn = useMemo(() => themes(), []);
  const [editingId] = useState(() =>
    existing && getData().customThemes.some((th) => th.id === existing.id) ? existing.id : null,
  );
  const isBuiltIn = Boolean(existing) && !editingId;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [brief, setBrief] = useState(existing?.brief ?? "");
  const [picked, setPicked] = useState(() => new Set(existing?.challenges.filter((c) => pool.includes(c))));
  const [extras, setExtras] = useState(() => existing?.challenges.filter((c) => !pool.includes(c)) ?? []);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const base = filter === "all" ? pool
      : filter === "picked" ? pool.filter((c) => picked.has(c))
      : builtIn.find((th) => th.id === filter)?.challenges ?? [];
    const q = query.trim().toLowerCase();
    return q ? base.filter((c) => c.toLowerCase().includes(q)) : base;
  }, [filter, pool, picked, builtIn, query]);

  const toggle = (challenge: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(challenge); else next.delete(challenge);
      return next;
    });
  };

  const addExtra = () => {
    const value = draft.trim();
    if (!value) return;
    if (!extras.includes(value)) setExtras((prev) => [...prev, value]);
    setDraft("");
  };

  const leave = () => {
    if (fromWalk) {
      useWalkUi.setState({ launchOnArrival: true });
      navigate("hud");
    } else {
      navigateTo("/themes");
    }
  };

  const save = () => {
    if (getData().activeWalk?.startedAt) { showToast(t("Finish your current walk before editing a theme.")); return; }
    const name = title.trim();
    if (!name) { showToast(t("Give your theme a title.")); return; }

    const fields = {
      title: name,
      brief: brief.trim() || t("A theme you built yourself."),
      challenges: [...pool.filter((c) => picked.has(c)), ...extras],
    };
    let saved: Theme;
    if (editingId) {
      saved = { ...existing!, ...fields };
      update((d) => {
        const target = d.customThemes.find((th) => th.id === editingId);
        if (target) Object.assign(target, fields);
      });
    } else {
      // A built-in theme's concepts carry over, so its edited copy keeps its
      // concept examples instead of losing them just because it's custom now.
      saved = { id: uid(), concepts: existing ? [...existing.concepts] : [], ...fields };
      update((d) => { d.customThemes.push(saved); });
    }

    putThemeOnHand(saved, t("Your own custom theme."));
    leave();
    showToast(editingId ? t("Theme updated.") : t("Custom theme saved."));
  };

  const chip = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      className={`chip-btn${filter === value ? " active" : ""}`}
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
    >
      {label}
    </button>
  );

  return (
    <section className="view theme-editor" data-view="themes">
      <button type="button" className="btn btn-ghost btn-sm theme-editor-back" onClick={leave}>{t("Back")}</button>
      <h2 className="section-title">{existing ? t("Edit Theme") : t("Build a Custom Theme")}</h2>
      {isBuiltIn && <p className="muted">{t("This saves as a new custom theme. The original stays as it was.")}</p>}
      <input
        type="text"
        className="text-input"
        placeholder={t("Title (e.g. Rainy Day Reflections)")}
        maxLength={60}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="text"
        className="text-input"
        placeholder={t("Brief: what are you hunting for? (optional)")}
        maxLength={140}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <p className="muted card-text">{t("Optional. Challenges only show up on a Challenge Walk. A casual walk uses the theme alone.")}</p>

      <h4 className="subsection-title">{t("Add your own")}</h4>
      <form className="reward-form" onSubmit={(e) => { e.preventDefault(); addExtra(); }}>
        <input
          type="text"
          className="text-input"
          placeholder={t("Write a mini-challenge")}
          maxLength={140}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost">{t("Add")}</button>
      </form>
      {extras.length > 0 && (
        <ul className="challenges-list theme-editor-extras">
          {extras.map((challenge, i) => (
            <li key={challenge} className="reward-row">
              <span className="reward-title">{challenge}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
              >
                {t("Remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="log-head">
        <h4 className="subsection-title">{t("Pick from existing challenges")}</h4>
        <span className="log-last">{t("{n} picked", { n: picked.size })}</span>
      </div>
      <input
        type="search"
        className="text-input"
        placeholder={t("Search challenges")}
        aria-label={t("Search challenges")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="theme-filter-chips" role="group" aria-label={t("Show challenges from")}>
        {chip("all", t("All"))}
        {chip("picked", t("Picked"))}
        {builtIn.map((th) => chip(th.id, th.title))}
      </div>
      {shown.length ? (
        <ul className="challenges-list">
          {shown.map((challenge) => (
            <li key={challenge}>
              <label className="challenge-item">
                <input
                  type="checkbox"
                  className="custom-challenge-check"
                  checked={picked.has(challenge)}
                  onChange={(e) => toggle(challenge, e.target.checked)}
                />
                <span>{challenge}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state-sm">{filter === "picked" && !query.trim() ? t("Nothing picked yet.") : t("No challenges match.")}</p>
      )}

      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block" onClick={save}>
          {existing ? t("Save Changes") : t("Save Theme")}
        </button>
      </div>
    </section>
  );
}
