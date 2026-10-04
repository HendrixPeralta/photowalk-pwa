import { describe, expect, it } from "vitest";
import { defaultState } from "@/state/defaults";
import { reminderBody, reminderStatus, shouldNudgeOnOpen, upcomingTimes } from "./reminders";

describe("reminders", () => {
  const wed6pm = new Date(2026, 5, 10, 18, 30); // Wednesday

  it("schedules the chosen days at the chosen time, never in the past", () => {
    const times = upcomingTimes({ enabled: true, time: "18:00", days: [3, 5] }, wed6pm).map((t) => new Date(t));
    expect(times[0].getDay()).toBe(5); // today's 18:00 has passed, so Friday is next
    expect(times.every((d) => d.getHours() === 18 && d.getMinutes() === 0)).toBe(true);
    expect(times.every((d) => [3, 5].includes(d.getDay()))).toBe(true);
    expect(upcomingTimes({ enabled: true, time: "18:00", days: [] }, wed6pm)).toEqual([]);
  });

  it("nudges on open only on a planned day, after the time, with nothing logged", () => {
    const data = defaultState();
    data.reminder = { enabled: true, time: "18:00", days: [3] };
    expect(shouldNudgeOnOpen(data, wed6pm)).toBe(true);
    expect(shouldNudgeOnOpen(data, new Date(2026, 5, 10, 17, 0))).toBe(false);
    data.activityLog["2026-06-10"] = 0.5;
    expect(shouldNudgeOnOpen(data, wed6pm)).toBe(false);
  });

  it("mentions the nearest reward when there is one", () => {
    const reward = { id: "r", title: "Lens", targetHours: 10, baselineHours: 0, createdAt: 0, claimedAt: null, notified: false };
    expect(reminderBody([reward], 7)).toBe('Time for a walk! 3h of shooting left to earn "Lens".');
    expect(reminderBody([], 7)).toBe("Time for a walk! Grab a theme and go shoot for a bit.");
  });

  it("explains how reminders will arrive", () => {
    const r = { enabled: true, time: "18:00", days: [1, 3] };
    expect(reminderStatus(r, "default")).toBe("Mon, Wed. PhotoEYE will remind you the next time you open the app.");
    expect(reminderStatus(r, "granted")).toBe("Mon, Wed. This browser only shows reminders while PhotoEYE is open.");
    expect(reminderStatus({ ...r, days: [] }, "granted")).toBe("Pick at least one day.");
  });
});
