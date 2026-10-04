"use client";

import { Icon } from "@/components/icons/Icon";
import { getDateLocale, getLang, t } from "@/lib/i18n/core";
import { useNow } from "@/lib/useNow";
import { localDateKey } from "@/lib/util";
import { useAppStore } from "@/state/appStore";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Japanese reads the locale's own one-character weekday (日 月 火...).
const dayInitial = (d: Date) =>
  getLang() === "ja" ? d.toLocaleDateString(getDateLocale(), { weekday: "narrow" }) : DAY_INITIALS[d.getDay()];

/** The last seven days as film canisters: shot days show their photo count. */
export function FilmStrip() {
  const activityLog = useAppStore((s) => s.activityLog);
  const frameLog = useAppStore((s) => s.frameLog);
  // Re-rendered once a minute, so the strip rolls over at midnight.
  const now = useNow(60_000);

  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const hours = activityLog[key] || 0;
    const frames = frameLog[key] || 0;
    const shot = hours > 0 || frames > 0;
    const today = i === 0;
    const params = { date: key, hours: hours.toFixed(2), n: frames };

    cells.push(
      <div
        key={key}
        className={`film-cell${today ? " film-cell-today" : ""}`}
        data-shot={shot ? 1 : 0}
        title={frames === 1 ? t("{date}: {hours}h, {n} photo", params) : t("{date}: {hours}h, {n} photos", params)}
      >
        <span className="film-cell-day">{today ? t("Today") : dayInitial(d)}</span>
        <span className="film-cell-can">
          <Icon name={shot ? "film" : "camera"} />
        </span>
        {/* Always a photo count: a walked day with no photos reads 0. */}
        <span className="film-cell-val">{today && !shot ? t("Ready") : shot ? String(frames) : "–"}</span>
      </div>,
    );
  }

  return <div className="film-strip">{cells}</div>;
}
