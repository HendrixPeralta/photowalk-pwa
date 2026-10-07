// The rooms API's real surroundings: the Neon database, the private Blob
// store, the signed-in person, and Next's after() for clean-up that can wait
// until the answer has gone out.

import { after } from "next/server";
import { getBlobStore } from "../blob";
import { getDb } from "../db";
import { withServer } from "../http";
import { requireUser } from "../session";
import { handleRoomsRequest } from "./handlers";
import type { RoomDeps } from "./service";

export function roomsRoute(req: Request): Promise<Response> {
  return withServer(() => handleRoomsRequest(req, async (): Promise<RoomDeps> => ({
    db: getDb(),
    blobs: getBlobStore,
    user: await requireUser(req),
    now: new Date(),
    later: (work) => after(work),
  })));
}
