// Every Theme Market endpoint (see src/server/themes/handlers.ts for the
// list). Server build only (see pageExtensions in next.config.ts).

import { themesRoute } from "@/server/themes/live";

export const dynamic = "force-dynamic";

export { themesRoute as GET, themesRoute as POST };
