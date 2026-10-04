// A short, stable fingerprint for snapshots of values too big to read: scope
// traces, lookup tables, a year of sun positions. The snapshot then says only
// "unchanged", but that is the point: the values were checked against the old
// app when it was ported, and any change has to be deliberate.

import { createHash } from "node:crypto";

export function digest(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v));
  return `sha256:${createHash("sha256").update(json).digest("hex").slice(0, 16)}`;
}
