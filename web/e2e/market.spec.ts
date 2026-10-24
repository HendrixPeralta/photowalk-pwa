import { expect, PARTNER, test, type Page } from "./fixtures";

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const card = (page: Page, title: string) => page.locator(".market-card").filter({ hasText: title });
const row = (page: Page, title: string) => page.locator(".reward-item").filter({ hasText: title });

async function buildTheme(page: Page, title: string, challenge: string) {
  await page.goto("/themes/?edit=new");
  await page.getByPlaceholder("Title (e.g. Rainy Day Reflections)").fill(title);
  await page.getByPlaceholder("Write a mini-challenge").fill(challenge);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save Theme" }).click();
  await expect(page).toHaveURL(/\/themes\/$/);
}

test("a published theme is added by someone else as their own copy", async ({ page: aki, openAs }) => {
  await buildTheme(aki, "Rainy Day", "Find a puddle");
  await row(aki, "Rainy Day").getByRole("button", { name: "Share" }).click();
  await expect(dialog(aki)).toContainText("your name and photo");
  await dialog(aki).getByRole("button", { name: "Share", exact: true }).click();
  await expect(toast(aki, "Shared with the community.")).toBeVisible();
  await expect(row(aki, "Rainy Day")).toContainText("Shared · Not added yet");

  const ken = await openAs(PARTNER);
  // My Themes only lists your own; community themes are behind the + button.
  await ken.goto("/themes/");
  await expect(ken.locator(".market-card")).toHaveCount(0);
  await ken.getByRole("button", { name: "Add a theme" }).click();
  await ken.getByRole("button", { name: "Community Themes" }).click();
  await expect(ken).toHaveURL(/\/themes\/\?view=community$/);
  await expect(ken.getByRole("heading", { name: "Community Themes" })).toBeVisible();
  const rainy = card(ken, "Rainy Day");
  await expect(rainy).toContainText("Aki Tanaka");
  await expect(rainy).toContainText("1 challenge");
  await rainy.getByRole("button", { name: /Rainy Day/ }).click();
  await expect(rainy).toContainText("Find a puddle");
  await rainy.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(ken, "Added to My Themes.")).toBeVisible();
  await expect(rainy.getByRole("button", { name: "Added", exact: true })).toBeDisabled();
  await expect(rainy).toContainText("Added once");

  // Ken's copy is his own: editing it leaves Aki's alone.
  await ken.getByRole("button", { name: "Back", exact: true }).click();
  await expect(row(ken, "Rainy Day")).toContainText("Shared by Aki Tanaka");
  await expect(row(ken, "Rainy Day").getByRole("button", { name: "Share" })).toHaveCount(0);
  await row(ken, "Rainy Day").getByRole("button", { name: "Edit" }).click();
  await ken.getByPlaceholder("Title (e.g. Rainy Day Reflections)").fill("Ken's Rain");
  await ken.getByRole("button", { name: "Save Changes" }).click();
  const kens = await saved(ken);
  expect(kens.customThemes).toEqual([expect.objectContaining({ title: "Ken's Rain", challenges: ["Find a puddle"], market: expect.objectContaining({ author: "Aki Tanaka" }) })]);

  await aki.reload();
  await expect(row(aki, "Rainy Day")).toContainText("Added once");
  expect((await saved(aki)).customThemes[0].title).toBe("Rainy Day");
});

test("reporting hides a theme from the reporter, and unpublishing takes it off", async ({ page: aki, openAs }) => {
  await buildTheme(aki, "Neon Nights", "Shoot a sign");
  await aki.getByRole("button", { name: "Share" }).click();
  await dialog(aki).getByRole("button", { name: "Share", exact: true }).click();
  await expect(toast(aki, "Shared with the community.")).toBeVisible();

  const ken = await openAs(PARTNER);
  await ken.goto("/themes/?view=community");
  await card(ken, "Neon Nights").getByRole("button", { name: "Report" }).click();
  await dialog(ken).getByRole("button", { name: "Report" }).click();
  await expect(toast(ken, "Thanks for the report.")).toBeVisible();
  await expect(card(ken, "Neon Nights")).toHaveCount(0);
  await ken.reload();
  await expect(ken.locator(".empty-state-sm")).toContainText("No community themes yet");

  // Aki still sees it, as hers, and takes it down.
  await aki.goto("/themes/?view=community");
  await expect(card(aki, "Neon Nights")).toContainText("You");
  await card(aki, "Neon Nights").getByRole("button", { name: "Stop sharing" }).click();
  await dialog(aki).getByRole("button", { name: "Stop sharing" }).click();
  await expect(toast(aki, "No longer shared.")).toBeVisible();
  await expect(card(aki, "Neon Nights")).toHaveCount(0);
  await aki.getByRole("button", { name: "Back", exact: true }).click();
  await expect(row(aki, "Neon Nights")).not.toContainText("Shared");
});

test("the Market searches and sorts", async ({ page: aki, openAs }) => {
  for (const [title, challenge] of [["Rainy Day", "Find a puddle"], ["Neon Nights", "Shoot a sign"]]) {
    await buildTheme(aki, title, challenge);
    await row(aki, title).getByRole("button", { name: "Share" }).click();
    await dialog(aki).getByRole("button", { name: "Share", exact: true }).click();
    await expect(toast(aki, "Shared with the community.")).toBeVisible();
  }
  const ken = await openAs(PARTNER);
  await ken.goto("/themes/?view=community");
  await card(ken, "Rainy Day").getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(ken, "Added to My Themes.")).toBeVisible();

  // Most added first, once the list is fetched again.
  await ken.reload();
  const titles = ken.locator(".market-card .reward-title");
  await expect(titles).toHaveText(["Rainy Day", "Neon Nights"]);
  await ken.getByRole("button", { name: "Newest" }).click();
  await expect(titles).toHaveText(["Neon Nights", "Rainy Day"]);
  await ken.getByPlaceholder("Search community themes").fill("rain");
  await expect(titles).toHaveText(["Rainy Day"]);
  await ken.getByPlaceholder("Search community themes").fill("zzz");
  await expect(ken.locator(".empty-state-sm")).toHaveText("No themes match.");
});
