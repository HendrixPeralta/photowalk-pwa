// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/themes/protocol";
import type { Db } from "../db";
import { user } from "../db/auth-schema";
import { sharedThemes } from "../db/themes-schema";
import { createTestDb } from "../db/testDb";
import { HttpError } from "../http";
import * as service from "./service";
import type { ThemeDeps } from "./service";

let db: Db;
let client: PGlite;
let clock = Date.UTC(2026, 9, 24, 9, 0);

const as = (id: string): ThemeDeps => ({ db, user: { id, name: id.toUpperCase(), image: null }, now: new Date(clock += 1000) });
const theme = (sourceId: string, extra: Record<string, unknown> = {}) => ({
  sourceId, title: `Theme ${sourceId}`, brief: "A brief", concepts: ["reflection"], challenges: ["Find a puddle"], ...extra,
});
const browse = (who: string, opts: Partial<{ sort: "popular" | "new"; q: string; offset: number }> = {}) =>
  service.listThemes(as(who), { sort: "new", q: "", offset: 0, ...opts });
const failsWith = async (work: Promise<unknown>, status: number, code: string) => {
  await expect(work).rejects.toBeInstanceOf(HttpError);
  await work.catch((err: HttpError) => expect([err.status, err.code]).toEqual([status, code]));
};

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await db.insert(user).values(["ana", "ken", "mio", "sora"].map((id) => ({ id, name: id.toUpperCase(), email: `${id}@example.com` })));
});
beforeEach(() => db.delete(sharedThemes));
afterAll(() => client.close());

describe("publishing", () => {
  it("publishes a theme, and publishing it again updates the same entry", async () => {
    const first = await service.publishTheme(as("ana"), theme("t1"));
    expect(first).toMatchObject({ title: "Theme t1", author: { name: "ANA" }, mine: true, sourceId: "t1", addCount: 0 });

    const again = await service.publishTheme(as("ana"), theme("t1", { title: "  Puddles  ", challenges: ["One", "One", "Two"] }));
    expect(again.id).toBe(first.id);
    expect(again.title).toBe("Puddles");
    expect(again.challenges).toEqual(["One", "Two"]);
    expect((await browse("ken")).themes).toHaveLength(1);
  });

  it("checks every field", async () => {
    await failsWith(service.publishTheme(as("ana"), theme("t1", { title: "  " })), 400, "invalid");
    await failsWith(service.publishTheme(as("ana"), theme("t1", { title: "x".repeat(LIMITS.title + 1) })), 400, "invalid");
    await failsWith(service.publishTheme(as("ana"), theme("t1", { challenges: "Find a puddle" })), 400, "invalid");
    await failsWith(service.publishTheme(as("ana"), theme("t1", { challenges: [42] })), 400, "invalid");
    await failsWith(service.publishTheme(as("ana"), theme("t1", { challenges: Array(LIMITS.challengesPerTheme + 1).fill("x") })), 400, "invalid");
    await failsWith(service.publishTheme(as("ana"), theme("")), 400, "invalid");
  });

  it("caps how many themes one person publishes, but still lets them update one", async () => {
    for (let i = 0; i < LIMITS.publishedPerUser; i++) await service.publishTheme(as("ana"), theme(`t${i}`));
    await failsWith(service.publishTheme(as("ana"), theme("one-more")), 409, "too_many_themes");
    await expect(service.publishTheme(as("ana"), theme("t0", { title: "Renamed" }))).resolves.toMatchObject({ title: "Renamed" });
  });

  it("lets only the author unpublish", async () => {
    const { id } = await service.publishTheme(as("ana"), theme("t1"));
    await failsWith(service.unpublishTheme(as("ken"), id), 403, "forbidden");
    await service.unpublishTheme(as("ana"), id);
    expect((await browse("ken")).themes).toEqual([]);
    await failsWith(service.unpublishTheme(as("ana"), id), 404, "not_found");
  });
});

describe("browsing", () => {
  it("sorts by most added or newest, searches title and brief, and pages", async () => {
    const old = await service.publishTheme(as("ana"), theme("a", { title: "Rainy streets", brief: "Wet pavement" }));
    await service.publishTheme(as("ken"), theme("b", { title: "Neon nights", brief: "100% glow_" }));
    await service.addTheme(as("mio"), old.id);

    expect((await browse("sora", { sort: "popular" })).themes.map((t) => t.title)).toEqual(["Rainy streets", "Neon nights"]);
    expect((await browse("sora", { sort: "new" })).themes.map((t) => t.title)).toEqual(["Neon nights", "Rainy streets"]);
    expect((await browse("sora", { q: "pavement" })).themes.map((t) => t.title)).toEqual(["Rainy streets"]);
    expect((await browse("sora", { q: "NEON" })).themes).toHaveLength(1);
    // % and _ are matched as themselves, not as wildcards.
    expect((await browse("sora", { q: "0% g" })).themes.map((t) => t.title)).toEqual(["Neon nights"]);
    expect((await browse("sora", { q: "%" })).themes.map((t) => t.title)).toEqual(["Neon nights"]);

    const page = await browse("sora");
    expect(page.more).toBe(false);
    expect((await browse("sora", { offset: 1 })).themes).toHaveLength(1);
  });

  it("only tells the author which of their themes it came from", async () => {
    await service.publishTheme(as("ana"), theme("secret-local-id"));
    expect((await browse("ken")).themes[0]).toMatchObject({ sourceId: null, mine: false });
    expect((await service.listMine(as("ana")))[0]).toMatchObject({ sourceId: "secret-local-id", mine: true });
    expect(await service.listMine(as("ken"))).toEqual([]);
  });
});

describe("adding and reporting", () => {
  it("counts each person's add once, and not the author's own", async () => {
    const { id } = await service.publishTheme(as("ana"), theme("t1"));
    expect(await service.addTheme(as("ken"), id)).toMatchObject({ addCount: 1, added: true });
    expect(await service.addTheme(as("ken"), id)).toMatchObject({ addCount: 1, added: true });
    expect(await service.addTheme(as("mio"), id)).toMatchObject({ addCount: 2 });
    await failsWith(service.addTheme(as("ana"), id), 409, "own_theme");
    await failsWith(service.addTheme(as("ken"), "nope"), 404, "not_found");
  });

  it("hides a theme after three people report it, except from its author", async () => {
    const { id } = await service.publishTheme(as("ana"), theme("t1"));
    await failsWith(service.reportTheme(as("ana"), id), 409, "own_theme");

    await service.reportTheme(as("ken"), id);
    await service.reportTheme(as("ken"), id);
    // A reporter stops seeing it straight away; everyone else still does.
    expect((await browse("ken")).themes).toEqual([]);
    expect((await browse("sora")).themes).toHaveLength(1);

    await service.reportTheme(as("mio"), id);
    expect((await browse("sora")).themes).toHaveLength(1);
    await service.reportTheme(as("sora"), id);
    expect((await browse("sora")).themes).toEqual([]);
    expect((await browse("ken", { q: "Theme" })).themes).toEqual([]);
    await failsWith(service.addTheme(as("sora"), id), 404, "not_found");

    const [mine] = (await browse("ana")).themes;
    expect(mine).toMatchObject({ id, hidden: true });
    // Editing it doesn't bring it back.
    expect(await service.publishTheme(as("ana"), theme("t1", { title: "Clean now" }))).toMatchObject({ hidden: true });
  });
});
