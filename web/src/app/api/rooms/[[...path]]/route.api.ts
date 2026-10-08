// Every Walk Partners rooms endpoint (see src/server/rooms/handlers.ts for
// the list). Server build only (see pageExtensions in next.config.ts).

import { roomsRoute } from "@/server/rooms/live";

export const dynamic = "force-dynamic";

export { roomsRoute as GET, roomsRoute as POST, roomsRoute as DELETE };
