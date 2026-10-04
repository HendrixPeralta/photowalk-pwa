// What every API route shares: a server that is missing its settings answers
// 503 with a reason the app can show, instead of a bare crash.

import { NotConfigured } from "./env";

export async function withServer(handler: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof NotConfigured) {
      console.error(err.message);
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }
}
