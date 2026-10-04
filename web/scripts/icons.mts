// Renders the PNG app icons from the SVGs in public/icons. Android's install
// prompt and iOS's home screen want PNGs; run again whenever an SVG changes:
//   npx tsx scripts/icons.mts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const OUTPUTS = [
  { svg: "icon.svg", png: "icon-192.png", size: 192 },
  { svg: "icon.svg", png: "icon-512.png", size: 512 },
  { svg: "icon-maskable.svg", png: "icon-maskable-512.png", size: 512 },
  // iOS draws its own rounded corners, so it gets the full-bleed maskable art.
  { svg: "icon-maskable.svg", png: "apple-touch-icon.png", size: 180 },
];

const libs = join(homedir(), ".local/pw-libs/usr/lib/x86_64-linux-gnu");
const browser = await chromium.launch(existsSync(libs) ? { env: { ...process.env, LD_LIBRARY_PATH: libs } } : {});
const page = await browser.newPage();
for (const { svg, png, size } of OUTPUTS) {
  const data = readFileSync(join(dir, svg)).toString("base64");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${data}" width="${size}" height="${size}" style="display:block">`);
  await page.locator("img").screenshot({ path: join(dir, png), omitBackground: true });
}
await browser.close();
console.log("icons: wrote", OUTPUTS.map((o) => o.png).join(", "));
