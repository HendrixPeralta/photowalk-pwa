"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { chooseSavedTheme, openThemeEditor, removeSavedTheme } from "@/features/walks/actions";
import { t } from "@/lib/i18n/core";
import { navigateTo } from "@/lib/nav";
import { marketEnabled } from "@/lib/themesApi";
import { useAppStore } from "@/state/appStore";
import type { CustomTheme } from "@/state/types";
import { closeModal, openModal } from "@/state/ui";
import { CommunityScreen, UnpublishModal } from "./CommunityScreen";
import { addedLabel, publishOwnTheme, refreshPublished, usePublished } from "./market";
import { ThemeEditorScreen } from "./ThemeEditorScreen";

/**
 * The user's own themes, ready to use again, edit, remove or share. With
 * ?edit=new (or a theme's id) it shows the theme builder instead, and with
 * ?view=community the themes other people have shared.
 */
export function MyThemesScreen() {
  const params = useSearchParams();
  const edit = params.get("edit");
  if (edit) {
    // Keyed so moving from one theme's editor to another starts fresh.
    return <ThemeEditorScreen key={edit} themeId={edit === "new" ? null : edit} fromWalk={params.get("from") === "walk"} />;
  }
  if (marketEnabled() && params.get("view") === "community") {
    return (
      <section className="view" data-view="themes">
        <button type="button" className="btn btn-ghost btn-sm theme-editor-back" onClick={() => navigateTo("/themes")}>{t("Back")}</button>
        <h2 className="section-title">{t("Community Themes")}</h2>
        <CommunityScreen />
      </section>
    );
  }
  return (
    <section className="view" data-view="themes">
      <ThemeList />
    </section>
  );
}

/** The + button's choice: build a theme, or add one someone else shared. */
function NewThemeModal() {
  return (
    <>
      <h3>{t("Add a theme")}</h3>
      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block new-theme-option" onClick={() => { closeModal(); openThemeEditor(null); }}>
          <span>{t("Build your own")}</span>
          <span className="new-theme-hint">{t("Pick challenges or write your own.")}</span>
        </button>
        <button type="button" className="btn btn-ghost btn-block new-theme-option" onClick={() => { closeModal(); navigateTo("/themes?view=community"); }}>
          <span>{t("Browse community themes")}</span>
          <span className="new-theme-hint">{t("Add a theme another photographer shared.")}</span>
        </button>
      </div>
    </>
  );
}

function ThemeList() {
  const custom = useAppStore((s) => s.customThemes);
  const published = usePublished((s) => s.bySource);

  useEffect(() => {
    if (marketEnabled()) void refreshPublished();
  }, []);

  return (
    <>
      <div className="log-head">
        <span className="label-caps">{t("My Themes")}</span>
        <span className="log-last">{custom.length ? t("{n} saved", { n: custom.length }) : t("None yet")}</span>
      </div>
      <p className="muted card-text">{t("Themes you've built or added, saved so you can use them again.")}</p>
      {!custom.length && (
        <p className="empty-state-sm">{t("No custom themes yet.")}</p>
      )}
      <ul className="rewards-list">
        {custom.map((theme) => (
          <li key={theme.id} className="reward-item">
            <div className="reward-row my-theme-row">
              <span className="my-theme-name">
                <span className="reward-title">{theme.title}</span>
                {theme.market && <span className="muted my-theme-note">{t("Shared by {name}", { name: theme.market.author })}</span>}
                {published?.[theme.id] && (
                  <span className="my-theme-note my-theme-shared">
                    {t("Shared")} · {addedLabel(published[theme.id].addCount)}
                  </span>
                )}
              </span>
              <span className="reward-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => chooseSavedTheme(theme.id)}>{t("Use")}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openThemeEditor(theme)}>{t("Edit")}</button>
                {marketEnabled() && !theme.market && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(<ShareModal theme={theme} />)}>{t("Share")}</button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSavedTheme(theme.id)}>{t("Remove")}</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {/* Same corner button as the walk launcher. Building comes back to this
          list after saving, so the new theme shows up in it. */}
      <div className="walk-fab-wrap">
        <button type="button" className="walk-fab" aria-label={t("Add a theme")} onClick={() => (marketEnabled() ? openModal(<NewThemeModal />) : openThemeEditor(null))}>
          <Icon name="plus" />
        </button>
      </div>
    </>
  );
}

/** Publish one of my themes to the Market, send it the latest version, or take it off. */
function ShareModal({ theme }: { theme: CustomTheme }) {
  const shared = usePublished((s) => s.bySource?.[theme.id]);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setBusy(true);
    const ok = await publishOwnTheme(theme);
    setBusy(false);
    if (ok) closeModal();
  };

  return (
    <>
      <h3>{shared ? t("Shared with the community") : t("Share with the community?")}</h3>
      {shared ? (
        <>
          <p className="muted">{addedLabel(shared.addCount)}</p>
          {shared.hidden && <p className="market-hidden">{t("Hidden after reports. Only you can see it.")}</p>}
          <p className="muted">{t("Edited it since? Update shares your latest version. Copies people already added don't change.")}</p>
        </>
      ) : (
        <p className="muted">{t("Anyone signed in to PhotoEYE can see this theme with your name and photo, and add a copy to their own themes.")}</p>
      )}
      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block" disabled={busy} onClick={() => void publish()}>
          {shared ? t("Update") : t("Share")}
        </button>
        {shared && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => openModal(<UnpublishModal id={shared.id} />)}>
            {t("Stop sharing")}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
    </>
  );
}
