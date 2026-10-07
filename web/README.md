# PhotoEYE (Next.js)

The React, Next.js and TypeScript version of PhotoEYE. The old vanilla-JS app
lives on the `master` branch and keeps running on GitHub Pages.

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
| `npm run shots -- new` | The same for this app, served on http://localhost:3100, plus the sign-in screen |
| `npm run db:generate` | Writes a migration into `drizzle/` after a change to `src/server/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations to the database in `.env.local` |
| `npm run db:studio` | Browses the database in Drizzle Studio |

## Accounts

Signing in with Google is required. The server side is Better Auth on
`/api/auth/*`, with people and sessions kept in Neon Postgres through
Drizzle. Tests never need any of it: unit tests run Postgres in memory
(PGlite), and e2e answers `/api/auth` itself (`e2e/fixtures.ts`).

To sign in for real, locally or on Vercel, the app needs the settings in
[`.env.example`](.env.example). Without them it still builds, and the sign-in
screen says the server can't be reached.

One-time setup:

1. **Google Cloud Console**, APIs & Services:
   - OAuth consent screen: External, scopes `openid`, `email`, `profile`, then publish it.
   - Credentials, Create OAuth client ID, Web application:
     - Authorized JavaScript origins: `http://localhost:3000` and `https://photoeye-wine.vercel.app`
     - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://photoeye-wine.vercel.app/api/auth/callback/google`
2. **Vercel**, project `photoeye`, Storage: add **Neon** from the Marketplace for Production and Development. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. **Vercel**, Settings, Environment Variables:
   - `BETTER_AUTH_SECRET`: from `openssl rand -base64 32`
   - `BETTER_AUTH_URL`: `https://photoeye-wine.vercel.app` (Production) and `http://localhost:3000` (Development)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from step 1
4. Locally, in `web/`: `vercel env pull .env.local`, then `npm run db:migrate`, then `npm run dev`.

Migrations are applied by hand, never during a Vercel build, so a preview
deployment can't change the production database. Run `npm run db:migrate`
against production before deploying a commit that adds a migration.

Preview deployments can't sign in: Google only accepts the redirect URIs
listed above.

## Walk Partners rooms

Rooms live on the server: rooms, members, comments and critique notes in
Neon (`src/server/db/rooms-schema.ts`), and the photos posted to a room in
a **private** Vercel Blob store, readable only through the API by members
of that room. Album photos never leave the phone; only photos posted to a
room are uploaded.

- Anyone signed in joins with the room code, QR or invite link. The host
  can remove someone (they can't come back) and closes the room instead of
  leaving, which deletes it and its photos.
- A room closes 30 days after its last photo, note or comment. Reads treat
  it as gone at once; a daily Vercel Cron job (`web/vercel.json`, path
  `/api/cron/expire-rooms/` with the slash, because cron doesn't follow
  redirects) deletes it and its pictures.
- The app polls only while Partners is on screen: every 5 s, slowing as the
  room goes quiet, pausing after 15 quiet minutes. That keeps Neon's free
  compute from being spent on a forgotten tab.
- Vercel's Hobby plan **locks the Blob store for 30 days** if the month's
  upload allowance (2,000) runs out, so uploads stop at 1,500 a month
  (`blob_usage`). The code never lists the store, and browsing it in the
  Vercel dashboard also spends that allowance, so avoid it.

One-time setup:

1. **Vercel**, project `photoeye`, Storage: Create, **Blob**, access
   **Private**, connected to Production and Development.
2. **Vercel**, Environment Variables: `CRON_SECRET` (from
   `openssl rand -base64 32`), Production.
3. `vercel env pull .env.local`, then `npm run db:migrate` (the rooms
   tables), before deploying.
4. After the first deploy: Settings, Cron Jobs, run `expire-rooms` once and
   check its log shows 200, not 308.

## House rules

- No em dashes anywhere. `npm run check` fails the build if one appears.
- Every piece of UI text goes through `t()` and needs a Japanese entry.
- Every screen runs in the browser. No server actions or server-only features
  in screens, so the static export keeps working.
- Server code (database, auth, storage) lives in `src/server/` and is reached
  only through API routes in files named `route.api.ts`. Those count as routes
  in the server build only, so the static export never contains them. ESLint
  stops the rest of `src/` from importing server-only modules.
