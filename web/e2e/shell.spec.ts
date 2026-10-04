import { expect, test, type Page } from "./fixtures";

const SCREENS = [
  { path: "/", title: "Walks", tab: "Walks" },
  { path: "/live/", title: "Live Walk", tab: "Live Walk" },
  { path: "/analysis/", title: "Analysis", tab: "Analysis" },
  { path: "/album/", title: "Album", tab: "Album" },
  { path: "/partners/", title: "Partners", tab: null },
  { path: "/settings/", title: "Settings", tab: null },
  { path: "/themes/", title: "My Themes", tab: null },
];

/** Fails the test on any console error or uncaught exception. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("every screen has its own address, title and tab", async ({ page }) => {
  const errors = watchErrors(page);
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.locator("#screenTitle")).toHaveText(screen.title);
    if (screen.tab) {
      await expect(page.getByRole("link", { name: screen.tab, exact: true })).toHaveAttribute("aria-current", "page");
    } else {
      await expect(page.locator(".bottom-nav [aria-current]")).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test("tabs navigate and the back button goes back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Album", exact: true }).click();
  await expect(page).toHaveURL(/\/album\/$/);
  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await expect(page.locator("#screenTitle")).toHaveText("Analysis");
  await page.goBack();
  await expect(page.locator("#screenTitle")).toHaveText("Album");
  await page.goBack();
  await expect(page.locator("#screenTitle")).toHaveText("Walks");
});

test("the menu opens, navigates, and closes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "My Themes" }).click();
  await expect(page).toHaveURL(/\/themes\/$/);
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Profile" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Profile" })).toBeFocused();
});

test("a new visitor starts with a practice history", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".streak-badge")).toContainText(/[1-9]\d*-day streak/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);
  expect(saved.seededHistory.days).toBe(91);
  // A reload keeps the same history instead of seeding again.
  await page.reload();
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);
  expect(again.walkHistory.length).toBe(saved.walkHistory.length);
});

test("the app is in Japanese when Japanese is chosen", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("photoeye-lang", "ja"));
  await page.goto("/album/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.locator("#screenTitle")).toHaveText("アルバム");
  await expect(page.locator(".bottom-nav")).toContainText("ウォーク");
});
