// What to tell someone when a room request fails.

import { t } from "@/lib/i18n/core";
import type { RoomsFailure } from "@/lib/roomsApi";

export function roomErrorMessage(error: RoomsFailure): string {
  switch (error) {
    case "invalid_code": return t("That doesn't look like a room code.");
    case "room_not_found": return t("Room not found. It may have closed.");
    case "removed": return t("You were removed from this room.");
    case "not_member": return t("You're not in this room anymore.");
    case "room_full": return t("This room is full.");
    case "too_many_rooms": return t("You already have 5 open rooms. Close one first.");
    case "too_many_photos": return t("This room has reached its photo limit.");
    case "too_many_posts": return t("This room has reached its limit for notes and comments.");
    case "photo_too_large": return t("That photo is too large.");
    case "upload_budget": return t("Photo sharing is paused for this month. Try again later.");
    case "host_only": return t("Only the host can do that.");
    case "host_cannot_leave": return t("As the host, close the room instead of leaving.");
    case "signed_out": return t("Your session ended. Sign in again.");
    case "not_configured": return t("Rooms aren't set up on this server yet.");
    case "offline": return t("You're offline. Connect to use the room.");
    case "invalid":
    case "not_found":
    case "forbidden":
    case "busy":
    case "server":
      return t("Couldn't reach the server. Try again.");
  }
}
