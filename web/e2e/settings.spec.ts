import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.locator(".toast").filter({ hasText: text });
const ENDPOINT = /script\.google\.com\/macros\/s\/.*\/exec/;

test("the language switch reloads into the other language and back", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator("#screenTitle")).toHaveText("設定");
  await expect(page.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#screenTitle")).toHaveText("Settings");
});

test("reminders pick days and a time, and say how they'll arrive", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await page.goto("/settings/");
  await expect(page.getByRole("button", { name: "Monday" })).toHaveCount(0);
  await page.locator(".slide-switch").click();
  await expect(page.getByRole("button", { name: "Monday" })).toBeVisible();

  const days = page.locator(".day-chip[aria-pressed=true]");
  const status = page.locator(".reminder-card .hint");
  const before = await days.count();
  await page.getByRole("button", { name: "Sunday" }).click();
  await expect(days).not.toHaveCount(before);
  await page.getByLabel("Time").fill("07:30");
  // Headless Chromium may report notifications as not granted even after
  // granting them, so expect the line that matches what the browser says.
  const granted = await page.evaluate(() => Notification.permission === "granted");
  await expect(status).toContainText(granted
    ? "This browser only shows reminders while PhotoEYE is open."
    : "PhotoEYE will remind you the next time you open the app.");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state.reminder);
  expect(saved).toMatchObject({ enabled: true, time: "07:30" });
});

test("a year of demo history loads, stays across reloads, and Restore brings back the start", async ({ page }) => {
  await page.goto("/settings/");
  const status = page.locator(".theme-card").filter({ hasText: "Practice history" }).locator(".card-text");
  await expect(status).toContainText("Three months of starting history is loaded.");

  await page.getByRole("button", { name: "Fill a year" }).click();
  await expect(status).toContainText("A full year of demo history is loaded.");
  await page.reload();
  await expect(status).toContainText("A full year of demo history is loaded.");

  await page.getByRole("button", { name: "Restore mine" }).click();
  await expect(status).toContainText("Three months of starting history is loaded.");
});

test("URL switches run once and leave the address", async ({ page }) => {
  await page.goto("/album/");
  await expect(page.locator(".view .album-thumb")).toHaveCount(6);
  await page.goto("/album/?photos=clear");
  await expect(page).toHaveURL(/\/album\/$/);
  await expect(page.locator(".view .album-thumb")).toHaveCount(0);
  // The switch is gone, so a reload is an ordinary start: the starter set comes back once.
  await page.reload();
  await expect(page.locator(".view .album-thumb")).toHaveCount(6);

  await page.goto("/?demo");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.locator(".activity-lifetime")).toContainText(/\d{3} walks|\d{2,3} walks/);
});

test("a review asks for something first, then sends", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route(ENDPOINT, async (route) => {
    sent.push(JSON.parse(route.request().postData()!));
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Leave a review" }).click();
  await dialog(page).getByRole("button", { name: "Send review" }).click();
  await expect(dialog(page)).toContainText("Add a rating or an answer first.");

  // The form's own language toggle, independent of the app.
  await dialog(page).getByRole("button", { name: "JA" }).click();
  await expect(dialog(page).getByRole("heading", { name: "レビューを書く" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "EN" }).click();

  await dialog(page).getByRole("radio", { name: "4 stars" }).click();
  await dialog(page).getByRole("checkbox", { name: "Rewards" }).click();
  await dialog(page).getByLabel("Something you'd like to improve?").fill("More themes");
  await dialog(page).getByRole("button", { name: "Send review" }).click();
  await expect(toast(page, "Thanks! Your review has been saved.")).toBeVisible();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ source: "photoeye-web", rating: 4, features: "Rewards", improveText: "More themes" });
});

test("a review written offline waits, then goes out when the connection is back", async ({ page, context }) => {
  const sent: unknown[] = [];
  await page.route(ENDPOINT, async (route) => {
    sent.push(JSON.parse(route.request().postData()!));
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.goto("/settings/");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Write a review" }).click();
  await dialog(page).getByRole("radio", { name: "5 stars" }).click();
  await dialog(page).getByRole("button", { name: "Send review" }).click();
  await page.getByRole("button", { name: "Write a review" }).click();
  await expect(dialog(page)).toContainText("1 review is waiting to send.");
  await page.keyboard.press("Escape");
  expect(sent).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(() => sent.length).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("photowalk:review-queue"))).toBe("[]");
});
