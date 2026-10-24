import { afterEach, describe, expect, it, vi } from "vitest";
import { themesApi } from "./themesApi";

function answer(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("themesApi", () => {
  it("browses with the sort, page and search in the URL", async () => {
    const fetchMock = answer(200, { themes: [], more: false });
    expect(await themesApi.list("new", "  rainy day ", 30)).toEqual({ ok: true, data: { themes: [], more: false } });
    expect(fetchMock).toHaveBeenCalledWith("/api/themes/?sort=new&offset=30&q=rainy+day", expect.objectContaining({ credentials: "same-origin" }));
    await themesApi.list("popular", "", 0);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/themes/?sort=popular&offset=0", expect.anything());
  });

  it("posts changes as JSON", async () => {
    const fetchMock = answer(200, { theme: { id: "s1" } });
    await themesApi.add("s1");
    expect(fetchMock).toHaveBeenCalledWith("/api/themes/add/", expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "s1" }) }));
    answer(204);
    expect(await themesApi.report("s1")).toEqual({ ok: true, data: undefined });
  });

  it("settles every failure to a code", async () => {
    answer(409, { error: "too_many_themes" });
    expect(await themesApi.publish({ sourceId: "t", title: "T", brief: "", concepts: [], challenges: [] }))
      .toEqual({ ok: false, error: "too_many_themes" });
    answer(500, { error: "room_full" });
    expect(await themesApi.mine()).toEqual({ ok: false, error: "server" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await themesApi.unpublish("s1")).toEqual({ ok: false, error: "offline" });
  });
});
