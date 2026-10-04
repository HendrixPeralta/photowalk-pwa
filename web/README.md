# PhotoEYE (Next.js)

The React, Next.js and TypeScript version of PhotoEYE. The old vanilla-JS app
at the repo root is a separate site and keeps running on GitHub Pages.

- **Live:** https://photoeye-wine.vercel.app (Vercel deploys every push to `main`)
- **Requires:** Node 24 or newer

## Commands

Run these inside `web/`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run verify` | The full check every change must pass: types, lint, unit tests, copy check, production build, and static export build |
| `npm run test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests at a phone viewport (Playwright). Run `npm run build` first |
| `npm run build:static` | Static export into `out/`. Must keep working so a Capacitor phone app stays possible |
| `npm run shots -- old` | Screenshots of every screen of the old live site, in English and Japanese, into `e2e/shots/old/` |
| `npm run shots -- new` | The same for this app, served on http://localhost:3100 |

## House rules

- No em dashes anywhere. `npm run check` fails the build if one appears.
- Every piece of UI text goes through `t()` and needs a Japanese entry.
- Every screen runs in the browser. No server actions or server-only features,
  so the static export keeps working.
