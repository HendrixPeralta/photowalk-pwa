import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByRole("dialog");
const thumbs = (page: Page) => page.locator(".view .album-grid .album-thumb");
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);

async function openAlbum(page: Page) {
  await page.goto("/album/");
  await expect(thumbs(page)).toHaveCount(6);
}

test("a new profile gets the starter photos once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await openAlbum(page);
  await expect(thumbs(page).first()).toHaveAttribute("style", /background-image: url\("blob:/);
  expect((await saved(page)).seededAlbum.count).toBe(6);

  await page.reload();
  await expect(thumbs(page)).toHaveCount(6);
  expect((await saved(page)).album).toHaveLength(6);
  expect(errors).toEqual([]);
});

test("filters and search narrow the album", async ({ page }) => {
  await openAlbum(page);
  await page.getByLabel("Any shape").selectOption("Portrait");
  const portraits = await thumbs(page).count();
  expect(portraits).toBeGreaterThan(0);
  expect(portraits).toBeLessThan(6);
  await expect(thumbs(page).first()).toContainText("Portrait");

  // Filters survive a trip to another tab.
  await page.getByRole("link", { name: "Walks", exact: true }).click();
  await page.getByRole("link", { name: "Album", exact: true }).click();
  await expect(page.getByLabel("Any shape")).toHaveValue("Portrait");
  await expect(thumbs(page)).toHaveCount(portraits);

  await page.getByLabel("Search tags, camera, or settings").fill("no such thing");
  await expect(thumbs(page)).toHaveCount(0);
  await expect(page.getByText("No references match these filters.")).toBeVisible();
});

test("a reference opens, goes to Analysis, and can be deleted", async ({ page }) => {
  await openAlbum(page);
  await thumbs(page).first().click();
  await expect(dialog(page).locator(".detail-image")).toHaveAttribute("src", /^blob:/);
  await expect(dialog(page).locator(".chip").first()).toBeVisible();
  await expect(dialog(page).locator(".swatch-sm").first()).toBeVisible();

  await dialog(page).getByRole("button", { name: "Analyze this shot" }).click();
  await expect(page).toHaveURL(/\/analysis\/$/);
  await expect(page.getByRole("button", { name: "Update Reference" })).toBeVisible();
  await page.getByPlaceholder("Tags, comma separated (e.g. bridge, sunset)").fill("harbor");
  await page.getByRole("button", { name: "Update Reference" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reference updated." })).toBeVisible();

  await page.getByRole("link", { name: "Album", exact: true }).click();
  await page.getByLabel("Search tags, camera, or settings").fill("harbor");
  await expect(thumbs(page)).toHaveCount(1);
  await thumbs(page).first().click();
  await expect(dialog(page).locator(".tag")).toHaveText("harbor");
  await dialog(page).getByRole("button", { name: "Delete from Album" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Removed from Reference Album." })).toBeVisible();
  await expect(thumbs(page)).toHaveCount(0);
  expect((await saved(page)).album).toHaveLength(5);
});
