"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { chooseSavedTheme, openThemeEditor, removeSavedTheme } from "@/features/walks/actions";
import { t } from "@/lib/i18n/core";
import { marketEnabled } from "@/lib/themesApi";
import { useAppStore } from "@/state/appStore";
import type { CustomTheme } from "@/state/types";
import { closeModal, openModal } from "@/state/ui";
import { addedLabel, publishOwnTheme, refreshPublished, usePublished } from "./market";
import { MarketScreen, UnpublishModal } from "./MarketScreen";
import { ThemeEditorScreen } from "./ThemeEditorScreen";

/**
 * The themes the user has built, ready to use again, edit, remove or share,
 * and (?tab=market) the Theme Market of everyone's shared themes. With
 * ?edit=new (or a theme's id) it shows the theme builder instead.
 */
export function MyThemesScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const edit = params.get("edit");
  if (edit) {
    // Keyed so moving from one theme's editor to another starts fresh.
    return <ThemeEditorScreen key={edit} themeId={edit === "new" ? null : edit} fromWalk={params.get("from") === "walk"} />;
  }
  const market = marketEnabled() && params.get("tab") === "market";

  return (
    <section className="view" data-view="themes">
      {marketEnabled() && (
        <div className="segmented themes-tabs" role="group" aria-label={t("My Themes")}>
          <button
            type="button"
            className={`segment${market ? "" : " active"}`}
            aria-pressed={!market}
            onClick={() => router.replace("/themes")}
          >
            {t("Mine")}
          </button>
          <button
            type="button"
            className={`segment${market ? " active" : ""}`}
            aria-pressed={market}
            onClick={() => router.replace("/themes?tab=market")}
          >
            {t("Market")}
          </button>
        </div>
      )}
      {market ? <MarketScreen /> : <ThemeList />}
    </section>
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
      <p className="muted card-text">{t("Themes you've made yourself, saved so you can use them again.")}</p>
      {!custom.length && (
        <p className="empty-state-sm">{t("No custom themes yet.")}</p>
      )}
      <ul className="rewards-list">
        {custom.map((theme) => (
          <li key={theme.id} className="reward-item">
            <div className="reward-row my-theme-row">
              <span className="my-theme-name">
                <span className="reward-title">{theme.title}</span>
                {theme.market && <span className="muted my-theme-note">{t("From the Market, by {name}", { name: theme.market.author })}</span>}
                {published?.[theme.id] && (
                  <span className="my-theme-note my-theme-shared">
                    {t("On the Market")} · {addedLabel(published[theme.id].addCount)}
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
      {/* Same corner button as the walk launcher. Comes back to this list
          after saving, so the new theme shows up in it. */}
      <div className="walk-fab-wrap">
        <button type="button" className="walk-fab" aria-label={t("Build a Custom Theme")} onClick={() => openThemeEditor(null)}>
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
      <h3>{shared ? t("On the Theme Market") : t("Share to the Theme Market?")}</h3>
      {shared ? (
        <>
          <p className="muted">{addedLabel(shared.addCount)}</p>
          {shared.hidden && <p className="market-hidden">{t("Hidden from the Market after reports. Only you can see it.")}</p>}
          <p className="muted">{t("Edited it since? Update sends the Market your latest version. Copies people already added don't change.")}</p>
        </>
      ) : (
        <p className="muted">{t("Anyone signed in to PhotoEYE can see this theme with your name and photo, and add a copy to their own themes.")}</p>
      )}
      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block" disabled={busy} onClick={() => void publish()}>
          {shared ? t("Update") : t("Publish")}
        </button>
        {shared && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => openModal(<UnpublishModal id={shared.id} />)}>
            {t("Unpublish")}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Cancel")}</button>
      </div>
    </>
  );
}
