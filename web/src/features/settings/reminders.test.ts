import { beforeEach, describe, expect, it } from "vitest";
import { localDateKey } from "@/lib/util";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { maybeNudgeOnOpen, setReminderTime, toggleReminderDay } from "./reminders";

// A Wednesday evening.
const WED_7PM = new Date(2026, 9, 7, 19, 0);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
});

describe("walk reminders", () => {
  it("keep the chosen days in week order, and fall back to 18:00 for a cleared time", () => {
    update((d) => { d.reminder.days = []; });
    toggleReminderDay(5);
    toggleReminderDay(1);
    toggleReminderDay(3);
    toggleReminderDay(5);
    expect(getData().reminder.days).toEqual([1, 3]);
    setReminderTime("");
    expect(getData().reminder.time).toBe("18:00");
  });

  it("nudge on opening the app on a planned day, past the time, before any walk", () => {
    update((d) => { d.reminder = { enabled: true, time: "18:00", days: [3] }; });
    maybeNudgeOnOpen(WED_7PM);
    expect(useToasts.getState().toasts).toHaveLength(1);

    useToasts.setState({ toasts: [] });
    update((d) => { d.activityLog[localDateKey(WED_7PM)] = 0.5; });
    maybeNudgeOnOpen(WED_7PM);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
