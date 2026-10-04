import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SERVER_ONLY =
  "Server-only module: use it from src/server or src/app/api, and reach it from the app through fetch.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Server code (database, auth, storage) must never end up in the client
  // bundle or the static export. Only the API routes and src/server may use it.
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: ["src/server/**", "src/app/api/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "better-auth", message: SERVER_ONLY }],
        patterns: [{
          group: [
            "@/server/*",
            "drizzle-orm",
            "drizzle-orm/*",
            "@neondatabase/*",
            "@vercel/blob",
            "@vercel/blob/*",
            "@better-auth/*",
            "better-auth/*",
            "!better-auth/client",
          ],
          message: SERVER_ONLY,
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
