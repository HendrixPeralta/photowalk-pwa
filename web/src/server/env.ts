// Server settings, read when a request needs them rather than at import time.
// `next build` imports every route module, and builds without secrets (CI,
// e2e, preview deployments) still have to succeed. A route that runs without
// its settings answers 503 instead of crashing (see http.ts).

export class NotConfigured extends Error {
  constructor(readonly missing: string[]) {
    super(`Server is missing settings: ${missing.join(", ")}`);
    this.name = "NotConfigured";
  }
}

/** The named environment variables, or NotConfigured listing every one that is unset. */
export function requireEnv<const K extends string>(...names: K[]): Record<K, string> {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new NotConfigured(missing);
  return Object.fromEntries(names.map((name) => [name, process.env[name]!])) as Record<K, string>;
}
