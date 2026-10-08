// Who is asking. API routes other than sign-in itself need a signed-in person;
// Better Auth reads the session cookie (usually from its short-lived signed
// cache, without a database read).

import { getAuth, type Auth } from "./auth";
import { HttpError } from "./http";

export interface SessionUser {
  id: string;
  name: string;
  image: string | null;
}

/** The signed-in person, or a 401 "signed_out". */
export async function requireUser(req: Request, auth: Auth = getAuth()): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new HttpError(401, "signed_out");
  const { id, name, image } = session.user;
  return { id, name, image: image ?? null };
}
