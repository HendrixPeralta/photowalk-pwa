// Screenshots of every screen at a phone viewport, in English and Japanese.
//
//   npm run shots -- old   the GitHub Pages site (the visual reference for the port)
//   npm run shots -- new   the local Next.js app on http://localhost:3100
//
// The old app has no URLs per screen, so it is driven through its own
// navigation event. Output lands in e2e/shots/<target>/ (git-ignored).
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const target = process.argv[2] === "new" ? "new" : "old";
const OLD_URL = "https://hendrixperalta.github.io/photowalk-pwa/index.html?demo";
const NEW_URL = "http://localhost:3100";

const OLD_VIEWS = ["walks", "hud", "analyze", "album", "share", "settings", "themes"];
const NEW_ROUTES: Record<string, string> = {
  walks: "/", hud: "/live/", analyze: "/analysis/", album: "/album/",
  share: "/partners/", settings: "/settings/", themes: "/themes/",
};

const outDir = fileURLToPath(new URL(`../e2e/shots/${target}/`, import.meta.url));
mkdirSync(outDir, { recursive: true });

const libs = join(homedir(), ".local/pw-libs/usr/lib/x86_64-linux-gnu");
const browser = await chromium.launch(
  existsSync(libs) ? { env: { ...process.env, LD_LIBRARY_PATH: libs } } : {},
);

for (const lang of ["en", "ja"] as const) {
  const context = await browser.newContext({ ...devices["Pixel 7"], locale: lang === "ja" ? "ja-JP" : "en-US" });
  await context.addInitScript((l) => localStorage.setItem("photoeye-lang", l), lang);
  const page = await context.newPage();

  if (target === "old") {
    await page.goto(OLD_URL, { waitUntil: "networkidle" });
    for (const view of OLD_VIEWS) {
      await page.evaluate((v) => window.dispatchEvent(new CustomEvent("photowalk:navigate", { detail: { view: v } })), view);
      await page.waitForTimeout(view === "analyze" ? 2500 : 600);
      await page.screenshot({ path: join(outDir, `${view}-${lang}.png`), fullPage: true });
      await page.keyboard.press("Escape");
    }
  } else {
    // The app asks for sign-in first. A pretend person is signed in, as in
    // the e2e tests, so every screen is the app; the sign-in screen comes last.
    let signedIn = true;
    await context.route("**/api/rooms/**", (route) => route.fulfill({ json: { rooms: [] } }));
    await context.route("**/api/auth/**", (route) => route.fulfill({
      json: signedIn ? { user: { id: "shots", name: "Aki Tanaka", email: "aki@example.com", image: null }, session: {} } : null,
    }));
    for (const [view, route] of Object.entries(NEW_ROUTES)) {
      await page.goto(NEW_URL + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, `${view}-${lang}.png`), fullPage: true });
    }
    signedIn = false;
    await page.evaluate(() => localStorage.removeItem("photoeye:account"));
    await page.goto(NEW_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, `sign-in-${lang}.png`), fullPage: true });
  }
  await context.close();
}

await browser.close();
console.log(`shots: wrote ${outDir}`);
