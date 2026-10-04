import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Some tests decode full-size bundled JPEGs in pure JS, which can pass 5s
    // when every test file runs in parallel.
    testTimeout: 30_000,
    // Snapshots of dates and day boundaries hold on any machine.
    env: { TZ: "Asia/Tokyo" },
  },
});
