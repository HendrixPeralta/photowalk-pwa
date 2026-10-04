import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// `npm run build:static` sets NEXT_OUTPUT=export. That build has to keep
// passing in every phase: it is the shape a Capacitor phone app needs later,
// so nothing in the app may depend on server-only features.
const isStaticExport = process.env.NEXT_OUTPUT === "export";

// The server API lives in files named `route.api.ts`. Only the server build
// counts "api.ts" as a page extension, so those files become routes there and
// are invisible to the static export, which can't hold server code.
const pageExtensions = ["tsx", "ts", "jsx", "js"];
if (!isStaticExport) pageExtensions.push("api.ts");

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  pageExtensions,
  trailingSlash: true,
  images: { unoptimized: true },
  typedRoutes: true,
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "" },
};

// Keeps esbuild out of the server bundle; it builds the service worker.
export default withSerwist(nextConfig);
