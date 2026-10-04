import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// `npm run build:static` sets NEXT_OUTPUT=export. That build has to keep
// passing in every phase: it is the shape a Capacitor phone app needs later,
// so nothing in the app may depend on server-only features.
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  typedRoutes: true,
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "" },
};

// Keeps esbuild out of the server bundle; it builds the service worker.
export default withSerwist(nextConfig);
