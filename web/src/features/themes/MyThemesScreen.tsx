"use client";

import { chooseSavedTheme, openThemeEditor, removeSavedTheme } from "@/features/walks/actions";
import { t } from "@/lib/i18n/core";
import { useAppStore } from "@/state/appStore";

/** The themes the user has built, ready to use again, edit or remove. */
export function MyThemesScreen() {
  const custom = useAppStore((s) => s.customThemes);

  return (
    <section className="view" data-view="themes">
      <div className="log-head">
        <span className="label-caps">{t("My Themes")}</span>
        <span className="log-last">{custom.length ? t("{n} saved", { n: custom.length }) : t("None yet")}</span>
      </div>
      <p className="muted card-text">{t("Themes you've made yourself, saved so you can use them again.")}</p>
      {!custom.length && (
        <p className="empty-state-sm">{t("No custom themes yet. Make one from Change Theme on the Walks tab.")}</p>
      )}
      <ul className="rewards-list">
        {custom.map((theme) => (
          <li key={theme.id} className="reward-item">
            <div className="reward-row">
              <span className="reward-title">{theme.title}</span>
              <span className="reward-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => chooseSavedTheme(theme.id)}>{t("Use")}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openThemeEditor(theme)}>{t("Edit")}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSavedTheme(theme.id)}>{t("Remove")}</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
