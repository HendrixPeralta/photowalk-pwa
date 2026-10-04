import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Parity tests import the old app's modules from ../js, outside this folder.
  server: { fs: { allow: [".."] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Parity tests decode full-size bundled JPEGs in pure JS and compare large
    // typed arrays, which can pass 5s when every test file runs in parallel.
    testTimeout: 30_000,
  },
});
