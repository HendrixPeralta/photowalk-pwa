"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { fixIsFresh, geolocationSupported } from "@/lib/geo";
import { getDateLocale, t } from "@/lib/i18n/core";
import { lightWindow, solarTimes } from "@/lib/sun";
import { useNow } from "@/lib/useNow";
import { locate, useFix } from "@/state/geo";
import type { Fix } from "@/state/types";
import { showToast } from "@/state/ui";

export interface GoldenReading {
  text: string;
  state: "now" | "next";
  title: string;
}

const hhmm = (date: Date) =>
  date.toLocaleTimeString(getDateLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * One short line of golden-hour timing: minutes left inside the window,
 * otherwise the clock time the next one opens. After sunset that means
 * tomorrow morning rather than a window that already closed.
 */
export function goldenReading(now: Date, fix: Pick<Fix, "lat" | "lon">): GoldenReading {
  const light = lightWindow(now, fix.lat, fix.lon);
  const times = light.times;

  if (light.phase === "golden") {
    return { text: t("{n} min of golden hour left", { n: light.minutesTo ?? 0 }), state: "now", title: light.label };
  }
  if (light.phase === "blue" && times.sunrise) {
    return { text: t("Golden {time}", { time: hhmm(times.sunrise) }), state: "next", title: t("Morning golden hour starts at sunrise") };
  }
  if (light.phase === "day") {
    const target = times.goldenEveningStart || times.sunset;
    if (target) return { text: t("Golden {time}", { time: hhmm(target) }), state: "next", title: light.label };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = solarTimes(tomorrow, fix.lat, fix.lon);
  if (next.sunrise) {
    return { text: t("Golden {time}", { time: hhmm(next.sunrise) }), state: "next", title: t("Tomorrow morning golden hour") };
  }
  return { text: light.label, state: "next", title: light.label };
}

/**
 * Golden-hour timing, worked out on the device from the clock and a cached
 * coarse position. With no position it says so, and tapping it asks for one,
 * rather than quoting a sunset for a city the user isn't in.
 */
export function GoldenBadge() {
  const fix = useFix((s) => s.fix);
  // Minute resolution is plenty for a countdown in minutes.
  const now = useNow(30_000);
  const [status, setStatus] = useState<string | null>(null);
  const fresh = fixIsFresh(fix, now);

  let reading: { text: string; state: string; title: string };
  if (fresh && fix) {
    reading = goldenReading(new Date(now), fix);
  } else {
    const supported = geolocationSupported();
    reading = {
      text: status ?? (supported ? t("Add location") : t("No location support")),
      state: "nofix",
      title: supported ? t("Tap to add your location for golden-hour timings.") : t("Golden-hour timings need location support."),
    };
  }

  const onClick = async () => {
    if (fresh) return;
    if (!geolocationSupported()) { showToast(t("This browser has no location support.")); return; }
    setStatus(t("Finding your location…"));
    try {
      await locate();
      setStatus(null);
    } catch (err) {
      const message = (err as Error).message;
      setStatus(message);
      showToast(message);
    }
  };

  return (
    <button type="button" className="cadence-golden" data-state={reading.state} title={reading.title} onClick={onClick}>
      <Icon name="twilight" />
      <span>{reading.text}</span>
    </button>
  );
}
