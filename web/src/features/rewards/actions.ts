// Hour rewards: set one, claim it once the hours are in, remove it.

import { t } from "@/lib/i18n/core";
import { earnedHours, newReward } from "@/lib/rewards";
import { totalActivityHours } from "@/lib/stats";
import { formatHours } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import { showToast } from "@/state/ui";

/** Returns true when the reward was added, so the form can clear itself. */
export function addReward(title: string, hours: number): boolean {
  const reward = newReward(title, hours, totalActivityHours(getData().activityLog));
  if ("error" in reward) { showToast(reward.error); return false; }
  update((d) => { d.rewards.push(reward); });
  showToast(t("Reward set! Hours you shoot from now on count toward it."));
  return true;
}

export function claimReward(id: string): void {
  const data = getData();
  const reward = data.rewards.find((r) => r.id === id);
  if (!reward || reward.claimedAt) return;
  if (earnedHours(reward, totalActivityHours(data.activityLog)) < reward.targetHours) return;
  const now = Date.now();
  update((d) => {
    const target = d.rewards.find((r) => r.id === id);
    if (target) target.claimedAt = now;
  });
  showToast(t('Enjoy it! You earned "{title}" with {hours} of shooting.', { title: reward.title, hours: formatHours(reward.targetHours) }), 6000);
}

export function removeReward(id: string): void {
  update((d) => { d.rewards = d.rewards.filter((r) => r.id !== id); });
}
