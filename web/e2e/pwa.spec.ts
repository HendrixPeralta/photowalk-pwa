import { join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SCREENS = [
  { path: "/", title: "Walks" },
  { path: "/live/", title: "Live Walk" },
  { path: "/analysis/", title: "Analysis" },
  { path: "/album/", title: "Album" },
  { path: "/partners/", title: "Partners" },
  { path: "/settings/", title: "Settings" },
  { path: "/themes/", title: "My Themes" },
];

/** Waits until the service worker has installed (precache done) and controls the page. */
async function installed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
}

test("every screen opens offline once the app has been visited", async ({ page, context }) => {
  await installed(page);
  await context.setOffline(true);
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.locator("#screenTitle")).toHaveText(screen.title);
  }
  // An invite link is still the Partners page offline.
  await page.goto("/partners/?room=ABC234");
  await expect(page.locator("#screenTitle")).toHaveText("Partners");
  // The sample photo and its analysis work offline too.
  await page.goto("/analysis/");
  await expect(page.locator(".shot-exposure")).toContainText("1/250s");
});

test("Japanese works offline", async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("photoeye-lang", "ja"));
  await installed(page);
  await context.setOffline(true);
  await page.goto("/album/");
  await expect(page.locator("#screenTitle")).toHaveText("アルバム");
});

test("photos from the share sheet land on Partners", async ({ page }) => {
  await installed(page);
  const photo = readFileSync(join(process.cwd(), "public/photos/a_49.jpg")).toString("base64");
  // What the phone's share sheet does: a multipart POST to the share target.
  const landed = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("photos", new File([bytes], "shared.jpg", { type: "image/jpeg" }));
    const res = await fetch("/share-target", { method: "POST", body: form });
    // Served from the cache, which reports the page's URL without the query.
    return new URL(res.url).pathname;
  }, photo);
  expect(landed).toBe("/partners/");

  await page.goto("/partners/?shared=1");
  await expect(page.locator(".shared-notice")).toHaveText(/^1 photo ready to share\./);
  await expect(page).toHaveURL(/\/partners\/$/);

  await page.getByRole("button", { name: "Go to Live Walk" }).click();
  await page.getByRole("button", { name: "Create Room" }).click();
  await page.getByRole("button", { name: "Manage Room" }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.locator(".room-thumb")).toHaveCount(1);
  await expect(page.locator(".shared-notice")).toHaveCount(0);
});

test("the manifest describes an installable app with a share target", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ id: "/", start_url: "/", display: "standalone", share_target: { action: "/share-target", method: "POST" } });
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});

test("the Install button appears when the browser offers it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);
  await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(offer);
  });
  await page.getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);
});
