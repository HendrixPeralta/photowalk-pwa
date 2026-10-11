import { join } from "node:path";
import { expect, PARTNER, test, TEST_USER, type Page } from "./fixtures";

const PHOTOS = join(process.cwd(), "public/photos");
const dialog = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
// Another person's changes arrive by polling, every 5 s while the room is lively.
const POLL = { timeout: 15_000 };

async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  await page.locator(".walk-fab-menu").getByRole("button", { name: /Create Room/ }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  await expect(page.locator(".debrief-title")).toHaveText(/^[A-Z2-9]{6}$/);
  return (await page.locator(".debrief-title").textContent())!;
}

async function upload(page: Page, files: string[]) {
  await page.getByLabel("Choose photos").setInputFiles(files.map((f) => join(PHOTOS, f)));
  await expect(toast(page, /Shared (with the room|\d+ shots)/)).toBeVisible();
}

test("two people share a room from their own phones: photos with their camera settings", async ({ page: aki, openAs }) => {
  const errors: string[] = [];
  aki.on("pageerror", (err) => errors.push(err.message));
  const code = await createRoom(aki);
  // The QR beside the code opens the invite; tapping the QR copies it as an image.
  await aki.getByRole("button", { name: "Invite your walk partners" }).click();
  await expect(dialog(aki).locator(".room-qr svg")).toBeVisible();
  const link = (await dialog(aki).locator(".invite-link").textContent())!;
  expect(link).toMatch(new RegExp(`/partners/\\?room=${code}$`));
  await aki.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog(aki).getByRole("button", { name: "Copy the QR code" }).click();
  await expect(toast(aki, "QR code copied.")).toBeVisible();
  expect(await aki.evaluate(async () => (await navigator.clipboard.read())[0].types)).toContain("image/png");
  await aki.keyboard.press("Escape");
  await upload(aki, ["a_1.jpg"]);
  await expect(aki.locator(".split-pane")).toHaveCount(1, POLL);

  // Ken, signed in on his own phone, opens the invite link: he joins, and the code leaves the address.
  const ken = await openAs(PARTNER);
  await ken.goto(link);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  await expect(ken).toHaveURL(/\/partners\/$/);
  await expect(ken.getByRole("img", { name: "1 photo", exact: true })).toBeVisible();
  await expect(ken.locator(".room-person")).toHaveCount(2);
  await expect(ken.getByRole("button", { name: "Aki Tanaka (host)" })).toBeVisible();
  await expect(ken.getByRole("button", { name: "Ken Ito", exact: true })).toBeVisible();
  await upload(ken, ["a_33.jpg"]);

  // Aki's phone follows without a reload.
  await expect(aki.locator(".split-pane")).toHaveCount(2, POLL);
  await expect(aki.locator(".split-pane-photo img").first()).toHaveAttribute("src", /^blob:/);
  // Newest first.
  await expect(aki.locator(".split-pane-who").first()).toHaveAttribute("title", PARTNER.name);
  await expect(aki.locator(".split-pane-who").nth(1)).toHaveAttribute("title", TEST_USER.name);
  await expect(aki.locator(".split-pane").first()).toContainText("1/250s");

  expect(errors).toEqual([]);
});

test("a shared shot takes comments, opens in Analysis, and its poster can take it down", async ({ page }) => {
  await createRoom(page);
  await upload(page, ["a_1.jpg", "a_33.jpg"]);
  await page.locator(".split-pane-photo").first().click();
  await expect(dialog(page).locator(".detail-image")).toHaveAttribute("src", /^blob:/);
  await expect(dialog(page)).toContainText("No comments yet. Be the first!");
  await dialog(page).getByLabel("Add a comment").fill("Lovely light");
  await dialog(page).getByRole("button", { name: "Post" }).click();
  await expect(dialog(page).locator(".comment")).toHaveText(`${TEST_USER.name} Lovely light`);

  await dialog(page).getByRole("button", { name: "Analyze this shot" }).click();
  await expect(page).toHaveURL(/\/analysis\/$/);
  await expect(page.locator(".canvas-stack")).toBeVisible();

  await page.goto("/partners/");
  await page.locator(".split-pane-photo").first().click();
  await dialog(page).getByRole("button", { name: "Take down this photo" }).click();
  await dialog(page).getByRole("button", { name: "Delete for everyone" }).click();
  await expect(page.getByRole("img", { name: "1 photo", exact: true })).toBeVisible();
});

test("the host removes someone, who can't come back", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  const ken = await openAs(PARTNER);
  await ken.goto(`/partners/?room=${code}`);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  // Only the host sees Remove; Ken leaves rather than closes.
  await ken.getByRole("button", { name: "Aki Tanaka (host)" }).click();
  await expect(dialog(ken)).toContainText("Aki Tanaka");
  await expect(dialog(ken).getByRole("button", { name: "Remove from room" })).toHaveCount(0);
  await ken.keyboard.press("Escape");
  await expect(ken.getByRole("button", { name: "Leave Room" })).toBeVisible();

  await expect(aki.locator(".room-person")).toHaveCount(2, POLL);
  await aki.getByRole("button", { name: "Ken Ito", exact: true }).click();
  await dialog(aki).getByRole("button", { name: "Remove from room" }).click();
  await dialog(aki).getByRole("button", { name: "Remove from room" }).click();
  await expect(aki.locator(".room-person")).toHaveCount(1);

  await expect(toast(ken, "You were removed from this room.")).toBeVisible(POLL);
  await expect(ken.getByText("No active room yet.")).toBeVisible();
  await ken.goto(`/partners/?room=${code}`);
  await expect(toast(ken, "You were removed from this room.")).toBeVisible();
});

test("rooms you're in show on the Live Walk card on another device", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  const ken = await openAs(PARTNER);
  await ken.goto(`/partners/?room=${code}`);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
  // Ken's other phone: no room on this device yet, but once he is out on a
  // walk the Live Walk card lists his rooms.
  const kenAgain = await openAs(PARTNER);
  await kenAgain.goto("/");
  await kenAgain.getByRole("button", { name: /Start Photo Walk/ }).click();
  await kenAgain.locator(".walk-fab-menu").getByRole("button", { name: /Casual Walk/ }).click();
  await dialog(kenAgain).getByRole("button", { name: "Start shooting" }).click();
  await expect(kenAgain).toHaveURL(/\/live\/$/);
  await kenAgain.locator(".your-room", { hasText: code }).getByRole("button", { name: "Enter room" }).click();
  await expect(kenAgain).toHaveURL(/\/partners\/$/);
  await expect(kenAgain.locator(".debrief-title")).toHaveText(code);
});

test("the + button makes a room, and offers the same choices once you're in one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  await page.locator(".walk-fab-menu").getByRole("button", { name: /Create Room/ }).click();
  await expect(page).toHaveURL(/\/partners\/$/);
  const code = (await page.locator(".debrief-title").textContent())!;
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  await page.goto("/");
  await page.getByRole("button", { name: /Start Photo Walk/ }).click();
  const menu = page.locator(".walk-fab-menu");
  await expect(menu.getByRole("button")).toHaveText(["Create Room", "Join Room", "Challenge Walk", "Casual Walk"]);
});

test("the + button joins someone else's room by its code", async ({ page: aki, openAs }) => {
  const code = await createRoom(aki);
  const ken = await openAs(PARTNER);
  await ken.goto("/");
  await ken.getByRole("button", { name: /Start Photo Walk/ }).click();
  await ken.locator(".walk-fab-menu").getByRole("button", { name: /Join Room/ }).click();
  await dialog(ken).getByPlaceholder("Room code").fill(code);
  await dialog(ken).getByRole("button", { name: "Join" }).click();
  await expect(ken).toHaveURL(/\/partners\/$/);
  await expect(ken.locator(".debrief-title")).toHaveText(code);
});
