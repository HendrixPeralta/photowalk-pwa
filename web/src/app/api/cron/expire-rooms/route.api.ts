// Run daily by Vercel Cron (web/vercel.json). Server build only.

import { getBlobStore } from "@/server/blob";
import { getDb } from "@/server/db";
import { requireEnv } from "@/server/env";
import { withServer } from "@/server/http";
import { handleExpireRooms } from "@/server/rooms/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request): Promise<Response> {
  return withServer(() => handleExpireRooms(req, requireEnv("CRON_SECRET").CRON_SECRET, getDb(), getBlobStore()));
}
