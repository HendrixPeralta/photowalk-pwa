"use client";

import { useMemo, useState } from "react";
import { allChallenges, type Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { uid } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import { closeModal, showToast } from "@/state/ui";
import { putThemeOnHand } from "../actions";

/**
 * Builds a theme from the existing mini-challenges plus any of the user's own
 * wording. Also the editor for an existing theme: a custom theme is updated in
 * place, while a built-in one is saved as a new custom copy (the built-in
 * list is shared and can't be rewritten per user).
 */
export function ThemeEditorModal({ existing, onSaved }: { existing: Theme | null; onSaved?: () => void }) {
  const pool = useMemo(() => allChallenges(), []);
  const [editingId] = useState(() =>
    existing && getData().customThemes.some((th) => th.id === existing.id) ? existing.id : null,
  );
  const isBuiltIn = Boolean(existing) && !editingId;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [brief, setBrief] = useState(existing?.brief ?? "");
  const [picked, setPicked] = useState(() => new Set(existing?.challenges.filter((c) => pool.includes(c))));
  const [extras, setExtras] = useState(() => existing?.challenges.filter((c) => !pool.includes(c)) ?? []);
  const [draft, setDraft] = useState("");

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
    setExtras((prev) => [...prev, value]);
    setDraft("");
  };

  const save = () => {
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

    closeModal();
    putThemeOnHand(saved, t("Your own custom theme."));
    if (onSaved) onSaved(); else navigate("walks");
    showToast(editingId ? t("Theme updated.") : t("Custom theme saved."));
  };

  return (
    <>
      <h3>{existing ? t("Edit Theme") : t("Build a Custom Theme")}</h3>
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

      <h4 className="subsection-title">{t("Pick from existing challenges")}</h4>
      <p className="muted card-text">{t("Optional. Challenges only show up on a Challenge Walk. A casual walk uses the theme alone.")}</p>
      <ul className="challenges-list">
        {pool.map((challenge) => (
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

      <h4 className="subsection-title">{t("Add your own")}</h4>
      <div className="reward-form">
        <input
          type="text"
          className="text-input"
          placeholder={t("Write a mini-challenge")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={addExtra}>{t("Add")}</button>
      </div>
      <ul className="challenges-list">
        {extras.map((challenge, i) => (
          <li key={i} className="reward-row">
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

      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block" onClick={save}>
          {existing ? t("Save Changes") : t("Save Theme")}
        </button>
      </div>
    </>
  );
}
