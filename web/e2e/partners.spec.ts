import { join } from "node:path";
import { expect, PARTNER, test, TEST_USER, type Page } from "./fixtures";

const PHOTOS = join(process.cwd(), "public/photos");
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
// Another person's changes arrive by polling, every 5 s while the room is lively.
const POLL = { timeout: 15_000 };

async function createRoom(page: Page): Promise<string> {
  await page.goto("/live/");
  await page.getByRole("button", { name: "Create Room" }).click();
  await page.getByRole("button", { name: "Manage Room" }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  await expect(page.locator(".debrief-title")).toHaveText(/^[A-Z2-9]{6}$/);
  return (await page.locator(".debrief-title").textContent())!;
}

async function upload(page: Page, files: string[]) {
  await page.getByLabel("Choose photos").setInputFiles(files.map((f) => join(PHOTOS, f)));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(toast(page, /Shared (with the room|\d+ shots)/)).toBeVisible();
}

test("two people share a room from their own phones: photos, side by side, and notes", async ({ page: aki, openAs }) => {
  const errors: string[] = [];
  aki.on("pageerror", (err) => errors.push(err.message));
  const code = await createRoom(aki);
  await expect(aki.locator(".room-qr svg")).toBeVisible();
  const link = (await aki.locator(".invite-link").textContent())!;
  expect(link).toMatch(new RegExp(`/partners/\\?room=${code}$`));
  await upload(aki, ["a_1.jpg"]);
  await expect(aki.getByText("Share at least two shots to line them up side by side.")).toBeVisible();

  // Ken, signed in on his own phone, opens the invite link: he joins, and the code leaves the address.
  const ken = await openAs(PARTNER);
  await ken.goto(link);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  await expect(ken).toHaveURL(/\/partners\/$/);
  await expect(ken.locator(".room-thumb")).toHaveCount(1);
  await expect(ken.locator(".room-thumb").first()).toHaveAttribute("style", /background-image: url\("blob:/);
  await expect(ken.locator(".room-person")).toHaveText([/Aki Tanaka\s*Host/, /Ken Ito/]);
  await upload(ken, ["a_33.jpg"]);

  // Aki's phone follows without a reload.
  await expect(aki.locator(".room-thumb")).toHaveCount(2, POLL);
  await expect(aki.locator(".debrief-meta-cyan strong")).toHaveText(`@${TEST_USER.name} & @${PARTNER.name}`);
  await expect(aki.locator(".split-pane-who")).toHaveText([`@${TEST_USER.name}`, `@${PARTNER.name}`]);
  await expect(aki.locator(".split-pane").nth(1)).toContainText("1/250s");

  await aki.getByRole("button", { name: "Slider" }).click();
  const frame = aki.locator(".wipe-frame");
  // page.mouse works in viewport coordinates, so bring the slider on screen.
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  await aki.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(aki.locator(".wipe-top")).toHaveAttribute("style", /clip-path: inset\(0px 75%/);

  await ken.getByRole("button", { name: "#LowAngle" }).click();
  await ken.getByPlaceholder("Add a note or ask a question…").fill("Try it from lower down.");
  await ken.getByRole("button", { name: "Post note" }).click();
  await expect(ken.locator(".critique-note-mine")).toContainText("Try it from lower down.");
  await expect(aki.locator(".critique-note")).toContainText("Try it from lower down.", POLL);
  await expect(aki.locator(".critique-note-mine")).toHaveCount(0);
  await expect(aki.locator(".critique-note-spec")).toHaveText("#LowAngle");
  await expect(aki.locator(".momentum-badge")).toContainText("+1");
  expect(errors).toEqual([]);
});

test("a shared shot takes comments, opens in Analysis, and its poster can take it down", async ({ page }) => {
  await createRoom(page);
  await upload(page, ["a_33.jpg"]);
  await page.locator(".room-thumb").first().click();
  await expect(dialog(page).locator(".detail-image")).toHaveAttribute("src", /^blob:/);
  await expect(dialog(page)).toContainText("No comments yet. Be the first!");
  await dialog(page).getByLabel("Add a comment").fill("Lovely light");
  await dialog(page).getByRole("button", { name: "Post" }).click();
  await expect(dialog(page).locator(".comment")).toHaveText(`${TEST_USER.name} Lovely light`);

  await dialog(page).getByRole("button", { name: "Analyze this shot" }).click();
  await expect(page).toHaveURL(/\/analysis\/$/);
  await expect(page.locator(".canvas-stack")).toBeVisible();

  await page.goto("/partners/");
  await page.locator(".room-thumb").first().click();
  await dialog(page).getByRole("button", { name: "Take down this photo" }).click();
  await dialog(page).getByRole("button", { name: "Delete for everyone" }).click();
  await expect(page.locator(".room-thumb")).toHaveCount(0);
});

test("the host removes someone, who can't come back", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  const ken = await openAs(PARTNER);
  await ken.goto(`/partners/?room=${code}`);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  // Only the host sees Remove; Ken leaves rather than closes.
  await expect(ken.getByRole("button", { name: "Remove from room" })).toHaveCount(0);
  await expect(ken.getByRole("button", { name: "Leave Room" })).toBeVisible();

  await expect(aki.locator(".room-person")).toHaveCount(2, POLL);
  await aki.getByRole("button", { name: "Remove from room" }).click();
  await dialog(aki).getByRole("button", { name: "Remove from room" }).click();
  await expect(aki.locator(".room-person")).toHaveCount(1);

  await expect(toast(ken, "You were removed from this room.")).toBeVisible(POLL);
  await expect(ken.getByText("No active room yet.")).toBeVisible();
  await ken.goto(`/partners/?room=${code}`);
  await expect(toast(ken, "You were removed from this room.")).toBeVisible();
});

test("the study sheet downloads, and the host closes the room for everyone", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  await upload(aki, ["a_1.jpg", "a_33.jpg"]);
  const download = aki.waitForEvent("download");
  await aki.getByRole("button", { name: "Download Side-by-Side Sheet" }).click();
  expect((await download).suggestedFilename()).toMatch(/^photoeye-/);

  const ken = await openAs(PARTNER);
  await ken.goto(`/partners/?room=${code}`);
  await expect(ken.locator(".room-thumb")).toHaveCount(2);

  await aki.getByRole("button", { name: "Close Room" }).click();
  await dialog(aki).getByRole("button", { name: "Close Room" }).click();
  await expect(aki.getByText("No active room yet.")).toBeVisible();
  await expect(toast(ken, `Room ${code} has closed.`)).toBeVisible(POLL);
  await expect(ken.getByText("No active room yet.")).toBeVisible();

  await aki.getByRole("button", { name: "Go to Live Walk" }).click();
  await expect(aki).toHaveURL(/\/live\/$/);
});

test("rooms you're in show on the Live Walk card on another device", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  const ken = await openAs(PARTNER);
  await ken.goto(`/partners/?room=${code}`);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  // Ken's other phone: no room on this device yet, but his rooms are listed.
  const kenAgain = await openAs(PARTNER);
  await kenAgain.goto("/live/");
  await kenAgain.locator(".your-room", { hasText: code }).click();
  await expect(kenAgain).toHaveURL(/\/partners\/$/);
  await expect(kenAgain.locator(".debrief-title")).toHaveText(code);
});
