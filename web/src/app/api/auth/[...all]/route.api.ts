// Every Better Auth endpoint: Google sign-in and its callback, the session,
// sign-out. Server build only (see pageExtensions in next.config.ts).

import { getAuth, withoutTrailingSlash } from "@/server/auth";
import { withServer } from "@/server/http";

export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  return withServer(async () => getAuth().handler(await withoutTrailingSlash(req)));
}

export { handle as GET, handle as POST };
