"use client";

import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { chooseSavedTheme, openThemeEditor, removeSavedTheme } from "@/features/walks/actions";
import { t } from "@/lib/i18n/core";
import { useAppStore } from "@/state/appStore";
import { ThemeEditorScreen } from "./ThemeEditorScreen";

/**
 * The themes the user has built, ready to use again, edit or remove. With
 * ?edit=new (or a theme's id) it shows the theme builder instead.
 */
export function MyThemesScreen() {
  const params = useSearchParams();
  const edit = params.get("edit");
  if (edit) {
    // Keyed so moving from one theme's editor to another starts fresh.
    return <ThemeEditorScreen key={edit} themeId={edit === "new" ? null : edit} fromWalk={params.get("from") === "walk"} />;
  }
  return <ThemeList />;
}

function ThemeList() {
  const custom = useAppStore((s) => s.customThemes);

  return (
    <section className="view" data-view="themes">
      <div className="log-head">
        <span className="label-caps">{t("My Themes")}</span>
        <span className="log-last">{custom.length ? t("{n} saved", { n: custom.length }) : t("None yet")}</span>
      </div>
      <p className="muted card-text">{t("Themes you've made yourself, saved so you can use them again.")}</p>
      {!custom.length && (
        <p className="empty-state-sm">{t("No custom themes yet.")}</p>
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
      {/* Same corner button as the walk launcher. Comes back to this list
          after saving, so the new theme shows up in it. */}
      <div className="walk-fab-wrap">
        <button type="button" className="walk-fab" aria-label={t("Build a Custom Theme")} onClick={() => openThemeEditor(null)}>
          <Icon name="plus" />
        </button>
      </div>
    </section>
  );
}
