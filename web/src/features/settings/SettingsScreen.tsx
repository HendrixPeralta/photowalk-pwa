"use client";

import { useState } from "react";
import { AccountCard } from "@/features/account/AccountCard";
import { clearStarterAlbum, seedStarterAlbum } from "@/features/album/references";
import { openReview } from "@/features/review/ReviewModal";
import { accountsEnabled } from "@/lib/authApi";
import { LANGS, getLangChoice, setLang, t, type LangChoice } from "@/lib/i18n/core";
import { reloadPage } from "@/lib/page";
import { dayLabels, dayName, reminderStatus } from "@/lib/reminders";
import { totalActivityHours } from "@/lib/stats";
import { formatHours } from "@/lib/util";
import { currentStreak } from "@/lib/walk";
import { update, useAppStore } from "@/state/appStore";
import { clearDemoData, seedDemoData } from "@/state/demo";
import { seedStarterHistory, undoStarterHistory } from "@/state/seed";
import { showToast } from "@/state/ui";
import { notificationAccess, setReminderTime, setRemindersEnabled, toggleReminderDay } from "./reminders";

export function SettingsScreen() {
  return (
    <section className="view" data-view="settings">
      <h2 className="section-title">{t("Settings")}</h2>
      {accountsEnabled() && <AccountCard />}
      <LanguageCard />
      <ReminderCard />
      <div className="theme-card">
        <span className="label-caps" style={{ color: "var(--accent-strong)" }}>{t("Feedback")}</span>
        <h3 className="subsection-title" style={{ marginTop: 6 }}>{t("Leave a review")}</h3>
        <p className="muted card-text">
          {t("Tried PhotoEYE? Tell us what worked and what got in your way. The star button in the top bar opens the same form from any screen.")}
        </p>
        <div className="theme-btn-row">
          <button type="button" className="btn btn-accent btn-sm" onClick={openReview}>{t("Write a review")}</button>
        </div>
      </div>
      <DemoDataCard />
    </section>
  );
}

/**
 * Always in both languages, so someone stuck in the wrong one can still find
 * the way back. Changing it reloads, since the language is fixed per page.
 */
function LanguageCard() {
  const choice = getLangChoice();
  const options: { code: LangChoice; label: string }[] = [
    { code: "auto", label: "Device / 端末" },
    ...LANGS.map((l) => ({ code: l.code as LangChoice, label: l.label })),
  ];
  return (
    <div className="theme-card">
      <h3 className="subsection-title" style={{ marginTop: 0 }}>Language / 言語</h3>
      <div className="segmented" role="group" aria-label="Language / 言語">
        {options.map((o) => (
          <button
            key={o.code}
            type="button"
            className={`segment${choice === o.code ? " active" : ""}`}
            aria-pressed={choice === o.code}
            onClick={() => { if (setLang(o.code)) reloadPage(); }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReminderCard() {
  const reminder = useAppStore((s) => s.reminder);
  const labels = dayLabels();
  return (
    <div className="theme-card collapse-card reminder-card">
      <label className="collapse-summary reminder-header">
        <span className="collapse-title">{t("Walk reminders")}</span>
        <span className="slide-switch">
          <input
            type="checkbox"
            aria-label={t("Walk reminders")}
            checked={reminder.enabled}
            onChange={(e) => void setRemindersEnabled(e.target.checked)}
          />
          <span className="slide-switch-track" aria-hidden="true" />
        </span>
      </label>
      {reminder.enabled && (
        <div className="collapse-body">
          <div className="field-row">
            <label htmlFor="reminderTime">{t("Time")}</label>
            <input
              id="reminderTime"
              type="time"
              className="text-input time-input"
              value={reminder.time}
              onChange={(e) => setReminderTime(e.target.value)}
            />
          </div>
          <div className="day-chips">
            {labels.map((label, day) => {
              const on = reminder.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`day-chip${on ? " active" : ""}`}
                  aria-label={dayName(day)}
                  aria-pressed={on}
                  onClick={() => toggleReminderDay(day)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="hint">{reminderStatus(reminder, notificationAccess())}</p>
        </div>
      )}
    </div>
  );
}

/** Shown or hidden by the Demo data switch; remembered on this device. */
const DEMO_TOOLS_KEY = "photoeye:demo-tools";

/**
 * Sample history and photos, for trying the app out or showing it. A new
 * account starts empty, so these sit behind a switch that is off until
 * someone turns it on.
 */
function DemoDataCard() {
  const [open, setOpen] = useState(() => localStorage.getItem(DEMO_TOOLS_KEY) === "1");
  const toggle = (on: boolean) => {
    setOpen(on);
    if (on) localStorage.setItem(DEMO_TOOLS_KEY, "1");
    else localStorage.removeItem(DEMO_TOOLS_KEY);
  };
  return (
    <div className="theme-card collapse-card demo-card">
      <label className="collapse-summary reminder-header">
        <span className="collapse-title">{t("Demo data")}</span>
        <span className="slide-switch">
          <input type="checkbox" aria-label={t("Demo data")} checked={open} onChange={(e) => toggle(e.target.checked)} />
          <span className="slide-switch-track" aria-hidden="true" />
        </span>
      </label>
      {open && (
        <div className="collapse-body">
          <PracticeHistory />
          <SamplePhotos />
        </div>
      )}
    </div>
  );
}

function PracticeHistory() {
  const activeDays = useAppStore((s) => Object.keys(s.activityLog).length);
  const hours = useAppStore((s) => totalActivityHours(s.activityLog));
  const walks = useAppStore((s) => s.profile.walksCompleted);
  const streak = useAppStore((s) => currentStreak(s.profile));
  const rewards = useAppStore((s) => s.rewards.length);
  const demo = useAppStore((s) => Boolean(s.demoMode));
  const seeded = useAppStore((s) => Boolean(s.seededHistory));

  // What the profile actually holds, so the card never misstates its own effect.
  const facts = [
    activeDays === 1 ? t("{n} day logged", { n: activeDays }) : t("{n} days logged", { n: activeDays }),
    formatHours(hours),
    walks === 1 ? t("{n} walk", { n: walks }) : t("{n} walks", { n: walks }),
    t("{n}-day streak", { n: streak }),
    rewards === 1 ? t("{n} reward", { n: rewards }) : t("{n} rewards", { n: rewards }),
  ].join(" · ");
  const source = demo
    ? t("A full year of demo history is loaded.")
    : seeded ? t("Three months of starting history is loaded.") : t("This is your own history.");

  const fillThreeMonths = () => {
    // The year fixture re-seeds itself while its flag is set, so stand it down first.
    update((d) => { d.demoMode = null; });
    seedStarterHistory();
    showToast(t("Three months of practice loaded."));
  };
  const fillYear = () => {
    seedDemoData();
    showToast(t("A full year of practice loaded. It stays until you tap Restore mine."));
  };
  const restore = () => {
    if (demo) {
      if (!clearDemoData()) showToast(t("Demo history cleared."));
      return;
    }
    if (!undoStarterHistory()) showToast(t("Nothing to restore. This is already your own history."));
  };

  return (
    <div className="demo-section">
      <h3 className="subsection-title" style={{ marginTop: 0 }}>{t("Practice history")}</h3>
      <p className="muted card-text">{t("{source} {facts}.", { source, facts })}</p>
      <div className="theme-btn-row">
        <button type="button" className="btn btn-accent btn-sm" onClick={fillThreeMonths}>{t("Fill 3 months")}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={fillYear}>{t("Fill a year")}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={restore}>{t("Restore mine")}</button>
      </div>
      <p className="hint">
        {t("Fills the weekly strip, activity calendar, streak and rewards with sample history. Your own data is set aside, and Restore mine brings it back.")}
      </p>
    </div>
  );
}

function SamplePhotos() {
  const inAlbum = useAppStore((s) => s.album.filter((item) => item.seeded).length);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const added = await seedStarterAlbum().finally(() => setBusy(false));
    showToast(added ? t("Sample photos added to the Album.") : t("Couldn't add the sample photos. Try again."));
  };
  const remove = async () => {
    setBusy(true);
    await clearStarterAlbum().finally(() => setBusy(false));
    showToast(t("Sample photos removed."));
  };

  return (
    <div className="demo-section">
      <h3 className="subsection-title">{t("Sample photos")}</h3>
      <p className="muted card-text">
        {inAlbum === 0
          ? t("No sample photos in the Album.")
          : inAlbum === 1 ? t("{n} sample photo in the Album.", { n: inAlbum }) : t("{n} sample photos in the Album.", { n: inAlbum })}
      </p>
      <div className="theme-btn-row">
        <button type="button" className="btn btn-accent btn-sm" disabled={busy || inAlbum > 0} onClick={() => void add()}>{t("Add sample photos")}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || inAlbum === 0} onClick={() => void remove()}>{t("Remove sample photos")}</button>
      </div>
      <p className="hint">{t("Six example photos, to try the Album's filters and the analysis tools with.")}</p>
    </div>
  );
}
