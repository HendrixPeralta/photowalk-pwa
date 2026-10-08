import { afterEach, describe, expect, it, vi } from "vitest";
import { roomsApi } from "./roomsApi";

function answer(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("roomsApi", () => {
  it("calls the slashed URLs with the session cookie", async () => {
    const fetchMock = answer(200, { room: { code: "ABC234" } });
    expect(await roomsApi.join("abc234")).toEqual({ ok: true, data: { room: { code: "ABC234" } } });
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms/join/", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify({ code: "abc234" }),
    }));
    await roomsApi.state("ABC234", 7);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/rooms/state/?code=ABC234&since=7", expect.anything());
  });

  it("settles every failure to a code", async () => {
    answer(404, { error: "room_not_found" });
    expect(await roomsApi.join("ABC234")).toEqual({ ok: false, error: "room_not_found" });
    answer(500, { error: "something new" });
    expect(await roomsApi.join("ABC234")).toEqual({ ok: false, error: "server" });
    answer(502);
    expect(await roomsApi.join("ABC234")).toEqual({ ok: false, error: "server" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await roomsApi.join("ABC234")).toEqual({ ok: false, error: "offline" });
  });

  it("treats an empty success as done", async () => {
    answer(204);
    expect(await roomsApi.close("ABC234")).toEqual({ ok: true, data: undefined });
  });

  it("uploads a photo as a form with its details", async () => {
    const fetchMock = answer(201, { photo: { id: "p1" }, room: {} });
    const meta = { note: "", width: 900, height: 600, exif: null, themeId: null };
    await roomsApi.uploadPhoto("ABC234", new Blob(["x"], { type: "image/jpeg" }), meta);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(JSON.parse(form.get("meta") as string)).toEqual(meta);
  });
});
