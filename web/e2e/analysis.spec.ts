import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const PHOTOS = join(process.cwd(), "public/photos");
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("photoeye:state")!).state);

/** How many pixels of a canvas are drawn on (not transparent). */
const paintedPixels = (canvas: Locator) =>
  canvas.evaluate((el: HTMLCanvasElement) => {
    const data = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
    return n;
  });

/** A cheap fingerprint of a canvas's pixels. */
const canvasHash = (canvas: Locator) =>
  canvas.evaluate((el: HTMLCanvasElement) => {
    const data = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let h = 0;
    for (let i = 0; i < data.length; i += 97) h = (h * 31 + data[i]) | 0;
    return h;
  });

async function openSample(page: Page) {
  await page.goto("/analysis/");
  await expect(page.locator(".canvas-stack")).toBeVisible();
  await expect(page.locator(".shot-exposure")).toContainText("1/250s");
}

test("the sample photo opens with every readout filled in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  // Saved data is written once the app has started.
  await expect(page.locator(".film-strip")).toBeVisible();
  const before = (await saved(page)).profile.photosAnalyzed;
  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await expect(page.locator(".shot-exposure")).toContainText("1/250s");

  expect(await paintedPixels(page.locator(".canvas-inner canvas").first())).toBeGreaterThan(1000);
  expect(await paintedPixels(page.locator(".histogram-canvas").first())).toBeGreaterThan(1000);
  await expect(page.locator(".gamut-bar-swatch")).toHaveCount(6);
  await expect(page.locator(".harmony-row")).toContainText("Color Harmony");
  await expect(page.locator(".diag-note-head strong")).toHaveText(/^Tonal key: /);
  // The sample isn't counted as a photo the user analyzed.
  expect((await saved(page)).profile.photosAnalyzed).toBe(before);
  expect(errors).toEqual([]);
});

test("guides change, flip and rotate, and stay put across screens", async ({ page }) => {
  await openSample(page);
  const guides = page.locator(".canvas-inner canvas").nth(1);
  const thirds = await canvasHash(guides);

  await page.getByLabel("Composition guide", { exact: true }).selectOption("golden-spiral");
  await expect(page.getByRole("button", { name: "Rotate" })).toBeVisible();
  const spiral = await canvasHash(guides);
  expect(spiral).not.toBe(thirds);
  await page.getByRole("button", { name: "Rotate" }).click();
  expect(await canvasHash(guides)).not.toBe(spiral);

  await page.getByLabel("Composition guide", { exact: true }).selectOption("golden-triangles");
  await expect(page.getByRole("button", { name: "Flip" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate" })).toHaveCount(0);

  // Leaving the tab and coming back keeps the photo and the guide.
  await page.getByRole("link", { name: "Album", exact: true }).click();
  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await expect(page.getByLabel("Composition guide", { exact: true })).toHaveValue("golden-triangles");
  expect(await paintedPixels(guides)).toBeGreaterThan(0);
});

test("a tool's help opens without folding its panel", async ({ page }) => {
  await openSample(page);
  const note = page.locator(".diag-note");
  await note.getByRole("button", { name: "About Tonal Key" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Tonal Key" })).toBeVisible();
  await expect(dialog(page)).toContainText("How to read it");
  await page.keyboard.press("Escape");
  await expect(note).not.toHaveAttribute("open", "");
});

test("bending the tone curve previews it on the photo", async ({ page }) => {
  await openSample(page);
  await page.locator(".scopes-details summary").click();
  await page.getByRole("button", { name: "Tone Curve", exact: true }).click();
  const curve = page.locator(".curve-canvas");
  const photo = page.locator(".canvas-inner canvas").first();
  await expect(photo).not.toHaveAttribute("style", /filter/);

  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  // page.mouse works in viewport coordinates, so bring the curve on screen.
  await curve.scrollIntoViewIfNeeded();
  const box = (await curve.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.25, { steps: 5 });
  await page.mouse.up();

  await expect(photo).toHaveAttribute("style", /filter: url\("?#toneCurveFilter"?\)/);
  const table = await page.locator("#toneCurveFilter feFuncR").getAttribute("tableValues");
  expect(table!.split(" ")).toHaveLength(33);
  expect(table).not.toBe(Array.from({ length: 33 }, (_, i) => (i / 32).toFixed(4)).join(" "));

  await page.getByRole("button", { name: "Reset curve" }).click();
  await expect(photo).not.toHaveAttribute("style", /filter/);
});

test("a picked photo is analyzed, saved to the album and compared", async ({ page }) => {
  await openSample(page);
  // The starter photos land in the album in the background.
  await expect.poll(async () => (await saved(page)).album.length).toBe(6);

  const before = (await saved(page)).profile.photosAnalyzed;
  await page.getByRole("button", { name: "Choose Another Photo" }).click();
  await expect(page.getByRole("button", { name: "Choose Photo" })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(join(PHOTOS, "a_1.jpg"));
  await expect(page.locator(".canvas-stack")).toBeVisible();
  await expect.poll(async () => (await saved(page)).profile.photosAnalyzed).toBe(before + 1);

  await page.getByPlaceholder("Tags, comma separated (e.g. bridge, sunset)").fill("sea, people");
  await page.getByRole("button", { name: "Save to Reference Album" }).click();
  await expect(toast(page, "Saved to your Reference Album.")).toBeVisible();
  const state = await saved(page);
  const item = state.album[0];
  expect(item.tags).toEqual(["sea", "people"]);
  expect(item.overlay).toEqual({ type: "thirds", flip: false, rotation: 0 });

  // Only a reference opened from the album is left out, so all seven are offered.
  await page.getByRole("button", { name: "Compare…" }).click();
  await expect(dialog(page).locator(".album-thumb")).toHaveCount(7);
  await dialog(page).locator(".album-thumb").nth(1).click();
  await expect(page.locator(".compare-pane")).toHaveCount(2);
  await expect(page.locator(".histogram-canvas")).toHaveCount(2);
  await page.getByRole("button", { name: "Exit Compare" }).click();
  await expect(page.locator(".compare-pane")).toHaveCount(1);
});

test("the summary downloads, and Share to Room goes to Partners", async ({ page }) => {
  await openSample(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Summary" }).click();
  expect((await download).suggestedFilename()).toMatch(/^photoeye-breakdown-.*\.jpg$/);

  await page.getByRole("button", { name: "Share to Room" }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  await expect(toast(page, "Upload this photo to share it with your room.")).toBeVisible();
});
