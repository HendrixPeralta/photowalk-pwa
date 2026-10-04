import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHOTOS = join(process.cwd(), "public/photos");
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

async function createRoom(page: Page): Promise<string> {
  await page.goto("/live/");
  await page.getByRole("button", { name: "Create Room" }).click();
  await page.getByRole("button", { name: "Manage Room" }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  return (await page.locator(".debrief-title").textContent())!;
}

async function upload(page: Page, name: string, files: string[]) {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Choose photos").setInputFiles(files.map((f) => join(PHOTOS, f)));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(toast(page, /Shared (with the room|\d+ shots)/)).toBeVisible();
}

test("two tabs share a room: photos, side by side, and notes", async ({ context }) => {
  const ana = await context.newPage();
  const errors: string[] = [];
  ana.on("pageerror", (err) => errors.push(err.message));
  const code = await createRoom(ana);
  await expect(ana.locator(".room-qr svg")).toBeVisible();
  const link = (await ana.locator(".invite-link").textContent())!;
  expect(link).toMatch(new RegExp(`/partners/\\?room=${code}$`));
  await upload(ana, "Ana", ["a_1.jpg"]);
  await expect(ana.getByText("Share at least two shots to line them up side by side.")).toBeVisible();

  // The invite link opens the room in another tab, and drops the code from the address.
  const ken = await context.newPage();
  await ken.goto(link);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  await expect(ken).toHaveURL(/\/partners\/$/);
  await expect(ken.locator(".room-thumb")).toHaveCount(1);
  await upload(ken, "Ken", ["a_33.jpg"]);

  // Ana's tab follows without a reload.
  await expect(ana.locator(".room-thumb")).toHaveCount(2);
  await expect(ana.locator(".debrief-meta-cyan strong")).toHaveText("@Ana & @Ken");
  await expect(ana.locator(".split-pane")).toHaveCount(2);
  await expect(ana.locator(".split-pane-who")).toHaveText(["@Ana", "@Ken"]);
  await expect(ana.locator(".split-pane").nth(1)).toContainText("1/250s");

  await ana.getByRole("button", { name: "Slider" }).click();
  const frame = ana.locator(".wipe-frame");
  // page.mouse works in viewport coordinates, so bring the slider on screen.
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  await ana.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(ana.locator(".wipe-top")).toHaveAttribute("style", /clip-path: inset\(0px 75%/);

  await ken.getByRole("button", { name: "#LowAngle" }).click();
  await ken.getByPlaceholder("Add a note or ask a question…").fill("Try it from lower down.");
  await ken.getByRole("button", { name: "Post note" }).click();
  await expect(ana.locator(".critique-note")).toContainText("Try it from lower down.");
  await expect(ana.locator(".critique-note-spec")).toHaveText("#LowAngle");
  await expect(ana.locator(".momentum-badge")).toContainText("+1");
  expect(errors).toEqual([]);
});

test("a shared shot takes comments and opens in Analysis", async ({ page }) => {
  await createRoom(page);
  await upload(page, "Ana", ["a_33.jpg"]);
  await page.locator(".room-thumb").first().click();
  await expect(dialog(page).locator(".detail-image")).toHaveAttribute("src", /^blob:/);
  await expect(dialog(page)).toContainText("No comments yet. Be the first!");
  await dialog(page).getByLabel("Add a comment").fill("Lovely light");
  await dialog(page).getByRole("button", { name: "Post" }).click();
  await expect(dialog(page).locator(".comment")).toHaveText("Ana Lovely light");

  await dialog(page).getByRole("button", { name: "Analyze this shot" }).click();
  await expect(page).toHaveURL(/\/analysis\/$/);
  await expect(page.locator(".canvas-stack")).toBeVisible();
});

test("the study sheet downloads, and leaving the room empties the screen", async ({ page }) => {
  await createRoom(page);
  await upload(page, "Ana", ["a_1.jpg", "a_33.jpg"]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Side-by-Side Sheet" }).click();
  expect((await download).suggestedFilename()).toMatch(/^photoeye-/);

  await page.getByRole("button", { name: "Leave Room" }).click();
  await expect(page.getByText("No active room yet.")).toBeVisible();
  await page.getByRole("button", { name: "Go to Live Walk" }).click();
  await expect(page).toHaveURL(/\/live\/$/);
});
