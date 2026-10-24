// The Theme Market API over HTTP: reads a request, checks its shape, hands it
// to the service, and writes the answer. live.ts supplies the real database
// and session, so the e2e tests can answer /api/themes with these handlers.
//
//   GET  /api/themes/?sort=popular|new&q=&offset=  browse            { themes, more }
//   GET  /api/themes/mine/                         what I published  { themes }
//   POST /api/themes/publish/   { sourceId, title, brief, concepts, challenges }  { theme }
//   POST /api/themes/unpublish/ { id }                                            204
//   POST /api/themes/add/       { id }                                            { theme }
//   POST /api/themes/report/    { id }                                            204

import { HttpError, jsonBody, stringField } from "../http";
import * as service from "./service";
import type { ThemeDeps } from "./service";

/** Market requests by path. Deps are built only once the request is known to be one. */
export async function handleThemesRequest(req: Request, deps: () => Promise<ThemeDeps>): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;
  // A cookie-carrying request from another site is never the app.
  if (method !== "GET" && req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "forbidden");

  switch (`${method} ${path}`) {
    case "GET /api/themes": {
      const sort = url.searchParams.get("sort") === "new" ? "new" : "popular";
      const offset = Number(url.searchParams.get("offset") ?? 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw new HttpError(400, "invalid");
      return Response.json(await service.listThemes(await deps(), { sort, q: url.searchParams.get("q") ?? "", offset }));
    }
    case "GET /api/themes/mine":
      return Response.json({ themes: await service.listMine(await deps()) });
    case "POST /api/themes/publish":
      return Response.json({ theme: await service.publishTheme(await deps(), await jsonBody(req)) });
    case "POST /api/themes/unpublish": {
      const body = await jsonBody(req);
      await service.unpublishTheme(await deps(), stringField(body, "id"));
      return new Response(null, { status: 204 });
    }
    case "POST /api/themes/add": {
      const body = await jsonBody(req);
      return Response.json({ theme: await service.addTheme(await deps(), stringField(body, "id")) });
    }
    case "POST /api/themes/report": {
      const body = await jsonBody(req);
      await service.reportTheme(await deps(), stringField(body, "id"));
      return new Response(null, { status: 204 });
    }
    default:
      throw new HttpError(404, "not_found");
  }
}
