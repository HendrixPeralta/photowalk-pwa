// Serves the service worker at /serwist/sw.js, bundled at build time with the
// list of files to precache. Static, so it works in the static export too.

import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";
import { ROUTES } from "@/routes";

// What changes the cached copy of each screen's page: the commit it was built from.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/worker/sw.ts",
  useNativeEsbuild: true,
  // Every screen, so each one opens offline.
  additionalPrecacheEntries: Object.values(ROUTES).map((route) => ({
    url: route === "/" ? route : `${route}/`,
    revision,
  })),
});
