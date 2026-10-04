// @vitest-environment node

import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";
import { withServer } from "./http";

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

  it("lets other errors through", async () => {
    await expect(withServer(() => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
