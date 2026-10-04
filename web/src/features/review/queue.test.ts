import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueue, flushQueue, QUEUE_KEY, readQueue, REVIEW_ENDPOINT, type ReviewRecord } from "./queue";

const review = (name: string): ReviewRecord => ({
  source: "photoeye-web", submittedAt: "2026-10-04T00:00:00Z", rating: 5, level: "", features: "", improveText: "", problemText: "", name,
});

let online = true;
let failAfter = Infinity;
const posted: string[] = [];

beforeEach(() => {
  localStorage.clear();
  posted.length = 0;
  online = true;
  failAfter = Infinity;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (posted.length >= failAfter) throw new TypeError("network down");
    expect(url).toBe(REVIEW_ENDPOINT);
    expect(init).toMatchObject({ method: "POST", mode: "no-cors" });
    posted.push(JSON.parse(init.body as string).name);
    return {};
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the review queue", () => {
  it("keeps at most 25, dropping the oldest", () => {
    for (let i = 0; i < 30; i++) enqueue(review(`r${i}`));
    expect(readQueue().map((r) => r.name)).toEqual(Array.from({ length: 25 }, (_, i) => `r${i + 5}`));
  });

  it("waits while offline, then sends oldest first", async () => {
    enqueue(review("a"));
    enqueue(review("b"));
    online = false;
    expect(await flushQueue()).toBe(0);
    expect(readQueue()).toHaveLength(2);

    online = true;
    expect(await flushQueue()).toBe(2);
    expect(posted).toEqual(["a", "b"]);
    expect(readQueue()).toEqual([]);
  });

  it("stops at the first failure so nothing is lost or sent twice", async () => {
    enqueue(review("a"));
    enqueue(review("b"));
    enqueue(review("c"));
    failAfter = 1;
    expect(await flushQueue()).toBe(1);
    expect(readQueue().map((r) => r.name)).toEqual(["b", "c"]);

    failAfter = Infinity;
    await flushQueue();
    expect(posted).toEqual(["a", "b", "c"]);
  });

  it("survives a corrupt queue", () => {
    localStorage.setItem(QUEUE_KEY, "{not json");
    expect(readQueue()).toEqual([]);
  });
});
