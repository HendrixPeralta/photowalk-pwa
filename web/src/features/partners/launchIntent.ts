// The two ways PhotoEYE is opened from outside: an invite link
// (/partners/?room=CODE) and the phone's share sheet, whose photos the service
// worker parks in the inbox. Both land on Partners.

import { takeSharedFiles } from "@/lib/db";
import { t } from "@/lib/i18n/core";
import { navigate } from "@/lib/nav";
import { showToast } from "@/state/ui";
import { getData } from "@/state/appStore";
import { useShareInbox } from "./inbox";
import { joinRoom } from "./rooms";

let handled = false;

/** Handles the address the page was opened with, once per page load. */
export function handleLaunchIntentOnce(): Promise<void> {
  if (handled) return Promise.resolve();
  handled = true;
  return handleLaunchIntent();
}

export async function handleLaunchIntent(): Promise<void> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("room");
  const fromShareSheet = url.searchParams.has("shared");
  let shared: File[] = [];
  try {
    shared = await takeSharedFiles();
  } catch { /* no inbox yet */ }
  if (shared.length) useShareInbox.setState({ files: shared });

  // Drop the query first, so a reload or the back button doesn't replay it.
  if (code || fromShareSheet) {
    url.searchParams.delete("room");
    url.searchParams.delete("shared");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }

  if (code) {
    // Offline the join can't happen; whatever room this device was in stays.
    const problem = await joinRoom(code);
    if (problem) showToast(problem, 6000);
    navigate("share");
  } else if (shared.length) {
    navigate("share");
    if (!getData().currentRoom) showToast(t("Create or join a room, then press Upload to post the photos you shared."), 6000);
  }
}
