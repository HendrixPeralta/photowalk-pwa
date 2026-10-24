// The rules of the Theme Market, on the server. Like the rooms service, it
// works on what it is handed (a database, the signed-in person, the time),
// so tests run it against an in-memory Postgres.
//
// Anyone signed in can publish their own themes, browse everyone's, add one
// (the app keeps its own copy), and report one. Enough reports hide a theme
// from everyone but its author until it's reviewed by hand.

import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { LIMITS, type MarketSort, type PublishedFields, type SharedTheme } from "@/lib/themes/protocol";
import type { Db } from "../db";
import { user as users } from "../db/auth-schema";
import { sharedThemes, themeAdds, themeReports } from "../db/themes-schema";
import { HttpError } from "../http";
import type { SessionUser } from "../session";

export interface ThemeDeps {
  db: Db;
  user: SessionUser;
  now: Date;
}

type ThemeRow = typeof sharedThemes.$inferSelect;

/* ---------- Reading ---------- */

/**
 * A page of the Market: everything not hidden, plus my own (hidden or not).
 * Themes I've reported drop out of my list. `q` matches title or brief.
 */
export async function listThemes(
  deps: ThemeDeps,
  { sort, q, offset }: { sort: MarketSort; q: string; offset: number },
): Promise<{ themes: SharedTheme[]; more: boolean }> {
  const me = deps.user.id;
  const conditions: (SQL | undefined)[] = [
    or(eq(sharedThemes.hidden, false), eq(sharedThemes.authorId, me)),
    isNull(themeReports.reporterId),
  ];
  const search = q.trim().slice(0, LIMITS.search);
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(sharedThemes.title, pattern), ilike(sharedThemes.brief, pattern)));
  }
  const order = sort === "popular"
    ? [desc(sharedThemes.addCount), desc(sharedThemes.createdAt), desc(sharedThemes.id)]
    : [desc(sharedThemes.createdAt), desc(sharedThemes.id)];
  const rows = await selectThemes(deps.db, me)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(LIMITS.pageSize + 1)
    .offset(offset);
  return { themes: rows.slice(0, LIMITS.pageSize).map((r) => toShared(r, me)), more: rows.length > LIMITS.pageSize };
}

/** Everything I've published, newest first, so My Themes can mark what's shared. */
export async function listMine(deps: ThemeDeps): Promise<SharedTheme[]> {
  const me = deps.user.id;
  const rows = await selectThemes(deps.db, me)
    .where(eq(sharedThemes.authorId, me))
    .orderBy(desc(sharedThemes.createdAt));
  return rows.map((r) => toShared(r, me));
}

/* ---------- Changes ---------- */

/**
 * Publishes one of my themes, or updates it if I published it before. A
 * hidden theme stays hidden: editing it isn't a way around the reports.
 */
export async function publishTheme(deps: ThemeDeps, raw: Record<string, unknown>): Promise<SharedTheme> {
  const { db, user, now } = deps;
  const fields = publishedFields(raw);
  const [existing] = await db.select({ id: sharedThemes.id }).from(sharedThemes)
    .where(and(eq(sharedThemes.authorId, user.id), eq(sharedThemes.sourceId, fields.sourceId)));
  if (!existing) {
    const [{ n }] = await db.select({ n: count() }).from(sharedThemes).where(eq(sharedThemes.authorId, user.id));
    if (n >= LIMITS.publishedPerUser) throw new HttpError(409, "too_many_themes");
  }
  const { sourceId, ...content } = fields;
  const [row] = await db.insert(sharedThemes)
    .values({ id: crypto.randomUUID(), authorId: user.id, sourceId, ...content, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [sharedThemes.authorId, sharedThemes.sourceId], set: { ...content, updatedAt: now } })
    .returning({ id: sharedThemes.id });
  return loadTheme(deps, row.id);
}

/** Takes one of my themes off the Market. Copies people already added stay theirs. */
export async function unpublishTheme(deps: ThemeDeps, id: string): Promise<void> {
  const theme = await findTheme(deps, id);
  if (theme.authorId !== deps.user.id) throw new HttpError(403, "forbidden");
  await deps.db.delete(sharedThemes).where(eq(sharedThemes.id, id));
}

/** Notes that I added someone's theme (once per person) and hands it over for the app to copy. */
export async function addTheme(deps: ThemeDeps, id: string): Promise<SharedTheme> {
  const { db, user, now } = deps;
  const theme = await findTheme(deps, id);
  if (theme.authorId === user.id) throw new HttpError(409, "own_theme");
  await db.transaction(async (tx) => {
    const added = await tx.insert(themeAdds).values({ themeId: id, userId: user.id, createdAt: now })
      .onConflictDoNothing().returning({ themeId: themeAdds.themeId });
    if (added.length) {
      await tx.update(sharedThemes).set({ addCount: sql`${sharedThemes.addCount} + 1` }).where(eq(sharedThemes.id, id));
    }
  });
  return loadTheme(deps, id);
}

/** Reports someone's theme. Once enough different people have, it's hidden. */
export async function reportTheme(deps: ThemeDeps, id: string): Promise<void> {
  const { db, user, now } = deps;
  const theme = await findTheme(deps, id);
  if (theme.authorId === user.id) throw new HttpError(409, "own_theme");
  await db.transaction(async (tx) => {
    await tx.insert(themeReports).values({ themeId: id, reporterId: user.id, createdAt: now }).onConflictDoNothing();
    const [{ n }] = await tx.select({ n: count() }).from(themeReports).where(eq(themeReports.themeId, id));
    if (n >= LIMITS.reportsToHide && !theme.hidden) {
      await tx.update(sharedThemes).set({ hidden: true }).where(eq(sharedThemes.id, id));
    }
  });
}

/* ---------- Helpers ---------- */

/** Themes with their author, and whether I've added or reported each. */
function selectThemes(db: Db, me: string) {
  return db
    .select({
      theme: sharedThemes,
      authorName: users.name,
      authorImage: users.image,
      addedBy: themeAdds.userId,
      reportedBy: themeReports.reporterId,
    })
    .from(sharedThemes)
    .innerJoin(users, eq(users.id, sharedThemes.authorId))
    .leftJoin(themeAdds, and(eq(themeAdds.themeId, sharedThemes.id), eq(themeAdds.userId, me)))
    .leftJoin(themeReports, and(eq(themeReports.themeId, sharedThemes.id), eq(themeReports.reporterId, me)))
    .$dynamic();
}

type Selected = Awaited<ReturnType<ReturnType<typeof selectThemes>["execute"]>>[number];

function toShared({ theme, authorName, authorImage, addedBy }: Selected, me: string): SharedTheme {
  const mine = theme.authorId === me;
  return {
    id: theme.id,
    sourceId: mine ? theme.sourceId : null,
    title: theme.title,
    brief: theme.brief,
    concepts: theme.concepts,
    challenges: theme.challenges,
    author: { name: authorName, image: authorImage ?? null },
    addCount: theme.addCount,
    createdAt: theme.createdAt.getTime(),
    updatedAt: theme.updatedAt.getTime(),
    mine,
    added: Boolean(addedBy),
    hidden: theme.hidden,
  };
}

/** A theme I'm allowed to see: not hidden, or mine. Otherwise 404. */
async function findTheme({ db, user }: ThemeDeps, id: string): Promise<ThemeRow> {
  if (!id || id.length > 64) throw new HttpError(404, "not_found");
  const [theme] = await db.select().from(sharedThemes).where(eq(sharedThemes.id, id));
  if (!theme || (theme.hidden && theme.authorId !== user.id)) throw new HttpError(404, "not_found");
  return theme;
}

async function loadTheme({ db, user }: ThemeDeps, id: string): Promise<SharedTheme> {
  const [row] = await selectThemes(db, user.id).where(eq(sharedThemes.id, id));
  if (!row) throw new HttpError(404, "not_found");
  return toShared(row, user.id);
}

/** A theme as published, checked field by field. */
function publishedFields(raw: Record<string, unknown>): PublishedFields {
  const { concepts, challenges } = raw;
  if (!Array.isArray(concepts) || concepts.length > LIMITS.concepts) throw new HttpError(400, "invalid");
  if (!Array.isArray(challenges) || challenges.length > LIMITS.challengesPerTheme) throw new HttpError(400, "invalid");
  return {
    sourceId: cleanText(raw.sourceId, LIMITS.sourceId),
    title: cleanText(raw.title, LIMITS.title),
    brief: cleanText(raw.brief ?? "", LIMITS.brief, { allowEmpty: true }),
    concepts: [...new Set(concepts.map((c) => cleanText(c, LIMITS.concept)))],
    challenges: [...new Set(challenges.map((c) => cleanText(c, LIMITS.challenge)))],
  };
}

/** Trimmed text within its limit, or 400 invalid. */
function cleanText(text: unknown, max: number, { allowEmpty = false } = {}): string {
  if (typeof text !== "string") throw new HttpError(400, "invalid");
  const trimmed = text.trim();
  if ((!trimmed && !allowEmpty) || trimmed.length > max) throw new HttpError(400, "invalid");
  return trimmed;
}
