# PhotoEYE

Plan photo walks, learn composition, and keep a reference library. PhotoEYE
is a phone-first progressive web app for people who take lots of photos and
want to get better at taking them. It does two things: it makes looking
teachable, and it makes practice visible.

- **Live app:** https://photoeye-wine.vercel.app (Vercel deploys `main`)
- **Original version:** https://hendrixperalta.github.io/photowalk-pwa/ (vanilla JS on the `master` branch, built by GitHub Pages)

## Features

| Screen | Path | What it does |
| --- | --- | --- |
| Walks | `/` | Start a walk, see a year of practice as a heatmap, keep a streak, and work toward rewards you price in hours of shooting |
| Live Walk | `/live` | The on-walk view: the current theme, frames taken, and the time of day |
| Analysis | `/analysis` | Composition guides you can drag and rotate (thirds, golden ratio, golden spiral), a histogram, scopes, a tone curve, and plain-language readouts such as "your shadows are blue". Compare your shot with a photo you admire |
| Album | `/album` | A reference library of photos, filtered by technique. Album photos stay on the phone |
| Partners | `/partners` | Walk Partners rooms: join with a code, QR or invite link, post photos, and swap comments and critique notes |
| My Themes | `/themes` | Walk themes such as leading lines or night lights, suggested from what you've practiced least |
| Settings | `/settings` | Account, reminders, language (English and Japanese), and demo data |

None of the analysis is AI. The app doesn't score photos. It gives you the
words to describe what you see.

## Tech stack

- **App:** Next.js 16, React 19, TypeScript, Zustand, and a Serwist service worker for offline use and installing
- **Local data:** IndexedDB on the device
- **Server:** Better Auth (Google sign-in), Neon Postgres via Drizzle, and a private Vercel Blob store for photos posted to rooms
- **Tests:** Vitest with PGlite for unit tests, Playwright at a phone viewport for end-to-end tests

## Repository layout

```
.
├── web/                    The Next.js app (start here)
│   ├── src/app/            Routes, one per screen, plus API routes (route.api.ts)
│   ├── src/features/       Screen components and their logic
│   ├── src/lib/            Analysis, scopes, color, EXIF, i18n, and other shared code
│   ├── src/server/         Auth, database, blob storage, rooms (server only)
│   ├── src/state/          App store, seed and demo data
│   ├── drizzle/            Database migrations
│   └── e2e/                Playwright tests
├── tools/review-endpoint.gs  Google Apps Script that collects review form answers in a Google Sheet
└── PRESENTATION.md         A 5-minute talk script for demoing the app
```

## Getting started

You need Node 24 or newer.

```sh
cd web
npm install
npm run dev        # http://localhost:3000
```

The app builds and runs without any server settings. Sign-in and Partners
rooms need your own server settings: copy
[`web/.env.example`](web/.env.example) to `web/.env.local` and fill it in.
`.env.local` is ignored by git, so never commit real values or paste them
into an issue or pull request.

Before you push, run `npm run verify`. It runs types, lint, unit tests, the
copy check, the production build, and the static export build.

See [`web/README.md`](web/README.md) for every command, the one-time Google,
Neon and Vercel setup, how rooms and their clean-up work, and the house rules.

## House rules (short version)

- No em dashes in the code or UI text. `npm run check` fails if it finds one.
- All UI text goes through `t()` and needs a Japanese entry.
- Screens run only in the browser, so the static export (`npm run build:static`) keeps working.
- Server code lives in `web/src/server/`, and the app reaches it only through `route.api.ts` API routes.
