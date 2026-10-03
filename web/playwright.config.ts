import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// On this WSL box Chromium's system libraries live in a user-level folder
// (no sudo). Elsewhere the folder does not exist and nothing changes.
const localLibs = join(homedir(), ".local/pw-libs/usr/lib/x86_64-linux-gnu");
const env = existsSync(localLibs)
  ? { ...process.env, LD_LIBRARY_PATH: [localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
  : undefined;

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    browserName: "chromium",
    launchOptions: env ? { env } : {},
  },
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
