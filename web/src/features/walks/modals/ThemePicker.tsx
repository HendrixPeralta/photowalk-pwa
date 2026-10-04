"use client";

import { themes, type Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { useAppStore } from "@/state/appStore";
import { openThemeEditor, openWalkBrief, pickTheme, putThemeOnHand } from "../actions";

/**
 * Change Theme: every built-in theme plus the user's own, and Randomize for
 * when nothing in the list is calling out. Picking one (or building a new
 * one) goes straight back to the brief.
 */
export function ThemePickerModal() {
  const custom = useAppStore((s) => s.customThemes);

  const choose = (theme: Theme, isCustom: boolean) => {
    putThemeOnHand(theme, isCustom ? t("Your own custom theme.") : "");
    openWalkBrief();
  };

  const row = (theme: Theme, isCustom: boolean) => (
    <button key={theme.id} type="button" className="quick-card theme-pick-item" onClick={() => choose(theme, isCustom)}>
      <strong>{theme.title}</strong>
      <span className="muted card-text">{theme.brief}</span>
    </button>
  );

  return (
    <>
      <h3>{t("Change Theme")}</h3>
      <button
        type="button"
        className="btn btn-accent btn-block"
        onClick={() => {
          pickTheme();
          openWalkBrief();
        }}
      >
        {t("Randomize")}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 8 }}
        onClick={() => openThemeEditor(null, openWalkBrief)}
      >
        {t("Build a Custom Theme")}
      </button>
      {custom.length > 0 && (
        <>
          <h4 className="subsection-title">{t("My Themes")}</h4>
          <div className="theme-pick-list">{custom.map((th) => row(th, true))}</div>
        </>
      )}
      <h4 className="subsection-title">{t("All Themes")}</h4>
      <div className="theme-pick-list">{themes().map((th) => row(th, false))}</div>
    </>
  );
}
