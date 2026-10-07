// The daily clean-up Vercel Cron runs: rooms 30 days past their last post
// are deleted with their pictures. Vercel calls it with the project's
// CRON_SECRET as a bearer token; anything else is refused.

import { timingSafeEqual } from "node:crypto";
import type { BlobStore } from "../blob";
import type { Db } from "../db";
import { HttpError } from "../http";
import { expireRooms } from "./service";

export async function handleExpireRooms(req: Request, secret: string, db: Db, blobs: BlobStore, now = new Date()): Promise<Response> {
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) throw new HttpError(401, "forbidden");
  return Response.json(await expireRooms(db, blobs, now));
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
