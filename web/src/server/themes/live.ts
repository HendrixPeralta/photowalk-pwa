// The Theme Market API's real surroundings: the Neon database and the
// signed-in person.

import { getDb } from "../db";
import { withServer } from "../http";
import { requireUser } from "../session";
import { handleThemesRequest } from "./handlers";
import type { ThemeDeps } from "./service";

export function themesRoute(req: Request): Promise<Response> {
  return withServer(() => handleThemesRequest(req, async (): Promise<ThemeDeps> => ({
    db: getDb(),
    user: await requireUser(req),
    now: new Date(),
  })));
}
