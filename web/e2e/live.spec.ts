import { join } from "node:path";
import { expect, test, type Page } from "./fixtures";

const PHOTOS = join(process.cwd(), "public/photos");
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const photosCell = (page: Page) => page.locator(".walk-clock-count");

/** Starts a walk from the Live tab and begins shooting. */
async function startWalk(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Live Walk", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Start shooting" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator(".mission-card")).toBeVisible();
}

test("photos logged on a walk show up with their camera data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await startWalk(page);
  await expect(photosCell(page)).toHaveText("0");

  await page.locator("input[type=file]").setInputFiles([join(PHOTOS, "a_33.jpg"), join(PHOTOS, "a_1.jpg")]);
  await expect(toast(page, "2 photos logged.")).toBeVisible();
  await expect(photosCell(page)).toHaveText("2");
  await expect(page.locator(".capture-chip")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Log Photo #3" })).toBeVisible();

  // Label the first photo, then remove it: the other becomes #1.
  await page.locator(".capture-chip").first().click();
  await expect(dialog(page).getByRole("heading", { name: "Frame #1" })).toBeVisible();
  await expect(dialog(page).locator(".detail-image")).toHaveAttribute("src", /^blob:/);
  await dialog(page).getByLabel("Label").fill("Portal");
  await dialog(page).getByRole("button", { name: "Save label" }).click();
  await expect(page.locator(".capture-chip").first()).toContainText("#1 Portal");

  await page.locator(".capture-chip").first().click();
  await dialog(page).getByRole("button", { name: "Remove frame" }).click();
  await expect(photosCell(page)).toHaveText("1");
  await expect(page.locator(".capture-chip")).toHaveText(/^#1/);

  // Finishing counts the walk's photos in the summary.
  await page.getByRole("button", { name: "Finish Walk" }).click();
  await dialog(page).getByRole("button", { name: "Complete Walk" }).click();
  await expect(dialog(page).locator(".summary-stat-delta").nth(1)).toHaveText("+1 this walk");
  expect(errors).toEqual([]);
});

test("pausing freezes the walk clock until it is resumed", async ({ page }) => {
  await page.clock.install();
  await startWalk(page);
  const clock = page.locator(".walk-clock-time");

  await page.clock.runFor(5_000);
  await expect(clock).toHaveText("00:05");
  await page.getByRole("button", { name: "Pause Walk" }).click();
  await expect(toast(page, "Walk paused.")).toBeVisible();

  await page.clock.runFor(60_000);
  await expect(clock).toHaveText("00:05");

  await page.getByRole("button", { name: "Resume Walk" }).click();
  await page.clock.runFor(3_000);
  await expect(clock).toHaveText("00:08");
});

test("a guided walk shows its countdown and checklist progress", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  await page.getByRole("button", { name: "Challenge Walk" }).click();
  await dialog(page).getByRole("button", { name: "Start shooting" }).click();
  await expect(page).toHaveURL(/\/live\/$/);

  await expect(page.locator(".walk-clock-mode")).toHaveText(/30 min/);
  await expect(page.locator(".walk-clock-left")).toHaveText(/^(30:00|29:5\d) left$/);
  await expect(page.locator(".mission-progress-text")).toHaveText("Progress: 0%");
  const pips = page.locator(".mission-pip");
  const total = await pips.count();
  expect(total).toBeGreaterThan(0);

  await page.locator(".mission-card .challenge-check").first().check();
  await expect(page.locator(".mission-pip.done")).toHaveCount(1);
  await expect(page.locator(".mission-progress-text")).toHaveText(`Progress: ${Math.round(100 / total)}%`);
});

test("the theme card folds away and its theme can be changed mid-walk", async ({ page }) => {
  await startWalk(page);
  const title = page.locator(".mission-title");
  const hint = page.locator(".mission-hint");

  await title.click();
  await expect(hint).toBeHidden();
  await title.click();
  await expect(hint).toBeVisible();

  const before = await title.textContent();
  await page.getByRole("button", { name: "Change Theme" }).click();
  await expect(hint).toBeVisible();
  const other = dialog(page).locator(".theme-pick-item").filter({ hasNotText: before ?? "" }).first();
  const next = await other.locator("strong").textContent();
  await other.click();
  await expect(dialog(page)).toBeHidden();
  await expect(title).toHaveText(next ?? "");
  await expect(page.locator(".walk-clock-time")).not.toHaveText("--:--");
});

test("with no walk under way, Live offers only to start one", async ({ page }) => {
  await page.goto("/live/");
  await expect(page.getByRole("button", { name: "Create Room" })).toHaveCount(0);
  await page.locator(".live-start").click();
  await expect(dialog(page).getByRole("button", { name: "Start shooting" })).toBeVisible();
});

test("walk partners can create a room or are told when a code doesn't work", async ({ page }) => {
  await startWalk(page);
  await page.getByRole("button", { name: "Join Room" }).click();
  await dialog(page).getByPlaceholder("Room code").fill("nope");
  await dialog(page).getByRole("button", { name: "Join" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("That doesn't look like a room code.");
  await dialog(page).getByPlaceholder("Room code").fill("ZZZ999");
  await dialog(page).getByRole("button", { name: "Join" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Room not found");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(toast(page, /Room [A-Z2-9]{6} created/)).toBeVisible();
  await expect(page.locator(".theme-card")).toContainText(/Room [A-Z2-9]{6} is open for your walk partners\./);
  await page.getByRole("button", { name: "Manage Room" }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/$/);
});
