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

## House rules

- No em dashes anywhere. `npm run check` fails the build if one appears.
- Every piece of UI text goes through `t()` and needs a Japanese entry.
- Every screen runs in the browser. No server actions or server-only features
  in screens, so the static export keeps working.
- Server code (database, auth, storage) lives in `src/server/` and is reached
  only through API routes in files named `route.api.ts`. Those count as routes
  in the server build only, so the static export never contains them. ESLint
  stops the rest of `src/` from importing server-only modules.
