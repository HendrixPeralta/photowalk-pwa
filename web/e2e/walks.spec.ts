import { expect, test, type Page } from "./fixtures";

/** Fails the test on any console error or uncaught exception. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

async function openBrief(page: Page, mode: "Casual Walk" | "Challenge Walk" = "Casual Walk") {
  await page.goto("/");
  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  await page.getByRole("button", { name: mode }).click();
  await expect(dialog(page).getByRole("button", { name: "Start shooting" })).toBeVisible();
}

test("a casual walk runs from the brief to the summary", async ({ page }) => {
  const errors = watchErrors(page);
  await openBrief(page);
  const before = await saved(page);
  await expect(dialog(page)).toContainText("Casual walk · no timer");

  await dialog(page).getByRole("button", { name: "Start shooting" }).click();
  await expect(page).toHaveURL(/\/live\/$/);
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator(".nav-live")).toBeVisible();

  await page.getByRole("link", { name: "Walks", exact: true }).click();
  await expect(page.locator(".walk-panel")).toContainText("Casual");
  await expect(page.getByRole("button", { name: /Start Photo Walk/ })).toHaveCount(0);

  // Backing out of the confirmation keeps the walk going.
  await page.getByRole("button", { name: "Stop Walk" }).click();
  await dialog(page).getByRole("button", { name: "Keep Shooting" }).click();
  await expect(toast(page, "Still on your walk.")).toBeVisible();
  await expect(page.locator(".walk-panel")).toBeVisible();

  await page.getByRole("button", { name: "Stop Walk" }).click();
  await dialog(page).getByRole("button", { name: "Complete Walk" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Walk complete!" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("button", { name: /Start Photo Walk/ })).toBeVisible();
  const after = await saved(page);
  expect(after.activeWalk).toBeNull();
  expect(after.walkHistory.length).toBe(before.walkHistory.length + 1);
  expect(after.profile.walksCompleted).toBe(before.profile.walksCompleted + 1);
  await expect(page.locator(".activity-lifetime")).toContainText(`${after.profile.walksCompleted} walks`);
  expect(errors).toEqual([]);
});

test("a guided walk nudges halfway and ends itself when time is up", async ({ page }) => {
  await page.clock.install();
  await openBrief(page, "Challenge Walk");
  await dialog(page).getByLabel("Walk length").selectOption("2");
  await expect(dialog(page)).toContainText("2-minute timer");
  await expect(dialog(page).locator(".challenge-check").first()).toBeVisible();
  await dialog(page).locator(".challenge-check").first().check();
  await dialog(page).getByRole("button", { name: "Start shooting" }).click();
  await expect(page).toHaveURL(/\/live\/$/);

  await page.clock.runFor(61_000);
  await expect(toast(page, "Halfway there! Try:")).toBeVisible();

  await page.clock.runFor(60_000);
  await expect(dialog(page).getByRole("heading", { name: "Time's up, nice work!" })).toBeVisible();
  await expect(dialog(page)).toContainText(/1 of \d+ mini-challenges done/);
  const state = await saved(page);
  expect(state.activeWalk).toBeNull();
  expect(state.walkHistory[0].mode).toBe("guided");
  expect(state.walkHistory[0].hours).toBeCloseTo(2 / 60, 3);
});

test("a long casual walk asks for the hours, which can earn a reward", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");

  await page.locator(".reward-bar").getByRole("button", { name: /Set a reward|Manage rewards/ }).click();
  await dialog(page).getByPlaceholder("Reward (e.g. new camera strap)").fill("New lens");
  await dialog(page).getByPlaceholder("Hours").fill("1");
  await dialog(page).getByRole("button", { name: "Set Reward" }).click();
  await expect(toast(page, "Reward set!")).toBeVisible();
  await expect(dialog(page)).toContainText("New lens");
  await page.keyboard.press("Escape");
  await expect(page.locator(".reward-leg")).toHaveText([/New lens\s*1h of shooting to go/]);
  await expect(page.getByRole("progressbar", { name: "New lens" })).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  await page.getByRole("button", { name: "Casual Walk" }).click();
  await dialog(page).getByRole("button", { name: "Start shooting" }).click();
  await expect(page).toHaveURL(/\/live\/$/);
  await page.clock.fastForward("03:00:00");

  await page.getByRole("link", { name: "Walks", exact: true }).click();
  await page.getByRole("button", { name: "Stop Walk" }).click();
  await dialog(page).getByRole("button", { name: "Complete Walk" }).click();
  await expect(dialog(page).getByRole("heading", { name: "How long were you shooting?" })).toBeVisible();
  await expect(dialog(page).getByLabel("Hours to log")).toHaveValue("3.00");
  await dialog(page).getByLabel("Hours to log").fill("1.5");
  await dialog(page).getByRole("button", { name: "Log it & finish" }).click();

  await expect(dialog(page)).toContainText("+1.5h this walk");
  await expect(dialog(page)).toContainText("Reward earned: New lens");
  await dialog(page).getByRole("button", { name: "Done" }).click();

  await page.locator(".reward-bar").getByRole("button", { name: "Claim" }).click();
  await expect(toast(page, 'You earned "New lens"')).toBeVisible();
  await expect(page.locator(".reward-bar")).toContainText("Claimed");
});

test("a custom theme built from the brief is used and kept in My Themes", async ({ page }) => {
  await openBrief(page);
  await dialog(page).getByRole("button", { name: "Change Theme" }).click();
  await expect(dialog(page).getByRole("heading", { name: "All Themes" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Build a Custom Theme" }).click();

  await dialog(page).getByRole("button", { name: "Save Theme" }).click();
  await expect(toast(page, "Give your theme a title.")).toBeVisible();

  await dialog(page).getByPlaceholder("Title (e.g. Rainy Day Reflections)").fill("Rainy Day Reflections");
  await dialog(page).getByPlaceholder("Write a mini-challenge").fill("Find a puddle");
  await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Save Theme" }).click();

  // Straight back to the brief, now on the new theme.
  await expect(dialog(page).getByRole("heading", { name: "Rainy Day Reflections" })).toBeVisible();
  await expect(dialog(page)).toContainText("Your own custom theme.");
  await page.keyboard.press("Escape");

  // Through the menu: a reload would reopen the brief of the walk left open.
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "My Themes" }).click();
  await expect(page.locator(".log-last")).toHaveText("1 saved");
  await expect(page.locator(".rewards-list")).toContainText("Rainy Day Reflections");

  // The open walk is on this theme, so it can't be removed yet.
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(toast(page, "Finish your current walk before removing its theme.")).toBeVisible();
  await expect(page.locator(".rewards-list")).toContainText("Rainy Day Reflections");
  const state = await saved(page);
  expect(state.customThemes[0].challenges).toEqual(["Find a puddle"]);
  expect(state.activeWalk.themeId).toBe(state.customThemes[0].id);
});

test("the Live tab starts a walk, but opening /live/ directly does not", async ({ page }) => {
  await page.goto("/live/");
  await expect(page.locator("#screenTitle")).toHaveText("Live Walk");
  await expect(dialog(page)).toHaveCount(0);

  await page.getByRole("link", { name: "Walks", exact: true }).click();
  await page.getByRole("link", { name: "Live Walk", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/$/);
  await expect(dialog(page).getByRole("button", { name: "Start shooting" })).toBeVisible();

  // A walk left on its brief comes back on its brief after a reload.
  await page.reload();
  await expect(dialog(page).getByRole("button", { name: "Start shooting" })).toBeVisible();
});

test("the golden-hour badge asks for a location, then shows the light", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 35.6812, longitude: 139.7671 });
  await page.goto("/");
  const badge = page.locator(".cadence-golden");
  await expect(badge).toHaveText("Add location");
  await expect(badge).toHaveAttribute("data-state", "nofix");

  await badge.click();
  await expect(badge).toHaveText(/Golden \d\d:\d\d|min of golden hour left/);
  await expect(badge).not.toHaveAttribute("data-state", "nofix");
});

test("the Walks screen reads in Japanese", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("photoeye-lang", "ja"));
  await page.goto("/");
  await page.getByRole("button", { name: "フォトウォークを開始" }).click();
  await expect(page.locator(".walk-fab-menu")).toContainText("カジュアル");
  await expect(page.locator(".activity-lifetime strong")).toHaveCount(2);
  await expect(page.locator(".film-cell-today")).toBeVisible();
});
