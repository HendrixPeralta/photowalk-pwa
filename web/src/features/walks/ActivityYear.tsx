"use client";

import { useLayoutEffect, useRef } from "react";
import { Trans } from "@/components/Trans";
import { buildWeeks, heatmapSummary, heatmapTotals, levelFor, monthName } from "@/lib/heatmap";
import { getDateLocale, t } from "@/lib/i18n/core";
import { totalActivityHours } from "@/lib/stats";
import { useNow } from "@/lib/useNow";
import { formatHours, localDateKey } from "@/lib/util";
import { useAppStore } from "@/state/appStore";

/** The full year of shooting as a heatmap, under this week's film strip. */
export function ActivityYear() {
  const activityLog = useAppStore((s) => s.activityLog);
  const walks = useAppStore((s) => s.profile.walksCompleted);
  const now = useNow(60_000);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { weeks, today } = buildWeeks(new Date(now));
  const { totalHours, activeDays } = heatmapTotals(activityLog, weeks, today);

  // Today is at the far right; start there.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // A month is labelled on the first week that starts in it.
  const months = weeks.map((week, i) => {
    const month = week[0].getMonth();
    const label = i === 0 || weeks[i - 1][0].getMonth() !== month ? monthName(month) : "";
    return <span key={i} className="heatmap-month">{label}</span>;
  });

  return (
    <div className="cadence-year">
      <div className="activity-head">
        <span className="label-caps">{t("Shooting activity")}</span>
        <span className="activity-lifetime">
          <Trans
            k="<strong>{hours}</strong> shot · <strong>{walks}</strong> walks"
            values={{ hours: formatHours(totalActivityHours(activityLog)), walks }}
          />
        </span>
      </div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div className="heatmap-inner">
          <div className="heatmap-months">{months}</div>
          <div className="heatmap-grid">
            {weeks.map((week, i) => (
              <div key={i} className="heatmap-week">
                {week.map((day) => {
                  const key = localDateKey(day);
                  if (day > today) return <span key={key} className="heatmap-day heatmap-day-empty" />;
                  const hours = activityLog[key] || 0;
                  const date = day.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric" });
                  const label = hours > 0
                    ? t("{date}: {hours} shooting", { date, hours: formatHours(hours) })
                    : t("{date}: no walk logged", { date });
                  return <span key={key} className="heatmap-day" data-level={levelFor(hours)} title={label} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-footer">
        <span className="muted">{heatmapSummary(activeDays, totalHours)}</span>
        <span className="heatmap-legend">
          {t("Less")}
          {[0, 1, 2, 3, 4].map((level) => <span key={level} className="heatmap-day" data-level={level} />)}
          {t("More")}
        </span>
      </div>
    </div>
  );
}
