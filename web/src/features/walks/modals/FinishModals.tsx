"use client";

import { useId, useState } from "react";
import { t } from "@/lib/i18n/core";
import { formatHours } from "@/lib/util";
import { CASUAL_MAX_HOURS } from "@/lib/walk";
import { closeModal, showToast } from "@/state/ui";

/** The one gate between tapping Stop and the walk actually ending: finishing can't be undone. */
export function ConfirmCompleteModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <>
      <h3>{t("Complete this walk?")}</h3>
      <p className="muted">{t("This ends the walk and saves your time. You can't undo this.")}</p>
      <div className="theme-actions">
        <button type="button" className="btn btn-danger btn-block" onClick={onConfirm}>{t("Complete Walk")}</button>
        <button type="button" className="btn btn-ghost btn-block" onClick={closeModal}>{t("Keep Shooting")}</button>
      </div>
    </>
  );
}

/**
 * Asks before banking a long casual walk. An unconfirmed number would spend
 * into the reward budget, so the user says how long they were really out.
 */
export function ConfirmHoursModal({ measured, onConfirm }: { measured: number; onConfirm: (hours: number) => void }) {
  const [value, setValue] = useState(() => (Math.round(measured * 4) / 4).toFixed(2));
  const inputId = useId();

  const confirm = () => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0) { showToast(t("Enter how many hours to log.")); return; }
    onConfirm(hours);
  };

  return (
    <>
      <h3>{t("How long were you shooting?")}</h3>
      <p className="muted">
        {t("This walk has been open for about {hours}. Log the time you actually spent shooting. Hours earn your rewards, so it's worth keeping them honest.", { hours: formatHours(measured) })}
      </p>
      <div className="field-row">
        <label htmlFor={inputId}>{t("Hours to log")}</label>
        <input
          id={inputId}
          type="number"
          className="text-input hours-input"
          min={0}
          max={CASUAL_MAX_HOURS}
          step={0.25}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="theme-actions">
        <button type="button" className="btn btn-accent btn-block" onClick={confirm}>{t("Log it & finish")}</button>
      </div>
    </>
  );
}
