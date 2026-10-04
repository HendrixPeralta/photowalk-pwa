// Walk reminders. Scheduled notifications (Notification Triggers) never
// shipped in browsers, so the reminder that reaches people is the nudge the
// next time they open the app on a day they meant to walk.

import { t } from "@/lib/i18n/core";
import { shouldNudgeOnOpen, type NotificationAccess } from "@/lib/reminders";
import { getData, update } from "@/state/appStore";
import { showToast } from "@/state/ui";

export function notificationAccess(): NotificationAccess {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Turning reminders on asks for notification permission, and says what happens without it. */
export async function setRemindersEnabled(on: boolean): Promise<void> {
  update((d) => { d.reminder.enabled = on; });
  if (!on) return;
  if (typeof Notification === "undefined") {
    showToast(t("This browser can't show notifications, so PhotoEYE will remind you inside the app instead."), 5000);
    return;
  }
  if (Notification.permission === "granted") return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast(t("Notifications are blocked on this device, but PhotoEYE will still remind you inside the app."), 5000);
  }
}

export function setReminderTime(time: string): void {
  update((d) => { d.reminder.time = time || "18:00"; });
}

export function toggleReminderDay(day: number): void {
  update((d) => {
    const days = d.reminder.days;
    const i = days.indexOf(day);
    if (i === -1) days.push(day); else days.splice(i, 1);
    days.sort((a, b) => a - b);
  });
}

/** On opening the app: a walk was planned for today, it's past the time, and nobody's been out. */
export function maybeNudgeOnOpen(now = new Date()): void {
  if (shouldNudgeOnOpen(getData(), now)) {
    showToast(t("You planned a walk today. There's still time to get out!"), 7000);
  }
}
