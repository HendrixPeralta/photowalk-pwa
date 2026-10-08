// What every API route shares: an error with a status and a code the app can
// act on (HttpError), and a server missing its settings answering 503 with a
// reason the app can show, instead of a bare crash.

import { NotConfigured } from "./env";

/** An expected failure: answered as { error: code } with this status. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "HttpError";
  }
}

export async function withServer(handler: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.code }, { status: err.status });
    if (err instanceof NotConfigured) {
      console.error(err.message);
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }
}
