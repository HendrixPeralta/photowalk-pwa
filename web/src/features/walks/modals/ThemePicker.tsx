"use client";

import { suggestTheme, themes, type Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { themeWalkCounts } from "@/lib/stats";
import { getData, useAppStore } from "@/state/appStore";
import { closeModal } from "@/state/ui";
import { changeWalkTheme, openThemeEditor, openWalkBrief, pickTheme, putThemeOnHand } from "../actions";

/**
 * Change Theme: every built-in theme plus the user's own, and Randomize for
 * when nothing in the list is calling out. Picking one (or building a new
 * one) goes straight back to the brief. Opened mid-walk from the Live screen,
 * a pick swaps the running walk's theme instead, and building a new theme is
 * left for the brief.
 */
export function ThemePickerModal({ midWalk = false }: { midWalk?: boolean }) {
  const custom = useAppStore((s) => s.customThemes);

  const choose = (theme: Theme, isCustom: boolean) => {
    const reason = isCustom ? t("Your own custom theme.") : "";
    if (midWalk) {
      changeWalkTheme(theme, reason);
      closeModal();
      return;
    }
    putThemeOnHand(theme, reason);
    openWalkBrief();
  };

  const randomize = () => {
    if (!midWalk) {
      pickTheme();
      openWalkBrief();
      return;
    }
    const data = getData();
    const picked = suggestTheme(data.activeWalk?.themeId, themeWalkCounts(data.walkHistory));
    changeWalkTheme(picked.theme, picked.reason);
    closeModal();
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
        onClick={randomize}
      >
        {t("Randomize")}
      </button>
      {!midWalk && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          onClick={() => openThemeEditor(null, openWalkBrief)}
        >
          {t("Build a Custom Theme")}
        </button>
      )}
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
