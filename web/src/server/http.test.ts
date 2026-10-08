// @vitest-environment node

import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";
import { HttpError, withServer } from "./http";

describe("withServer", () => {
  it("answers 503 when the server is missing settings", async () => {
    delete process.env.PHOTOEYE_TEST_UNSET;
    const res = await withServer(() => {
      requireEnv("PHOTOEYE_TEST_UNSET");
      return new Response("unreachable");
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("answers an HttpError with its status and code", async () => {
    const res = await withServer(() => { throw new HttpError(403, "not_member"); });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_member" });
  });

  it("lets other errors through", async () => {
    await expect(withServer(() => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
