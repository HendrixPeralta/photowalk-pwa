import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNavigator } from "@/lib/nav";
import { getData, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { useShareInbox } from "./inbox";
import { handleLaunchIntent } from "./launchIntent";

const inbox: File[] = [];
vi.mock("@/lib/db", () => ({ takeSharedFiles: async () => inbox.splice(0) }));

async function launch(path: string) {
  window.history.replaceState(null, "", path);
  await handleLaunchIntent();
}

const push = vi.fn();

beforeEach(() => {
  inbox.length = 0;
  push.mockReset();
  setNavigator(push);
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  useShareInbox.setState({ files: [] });
});

describe("opening PhotoEYE from outside", () => {
  it("an invite link joins the room, opens Partners and drops the code from the address", async () => {
    useAppStore.setState({ rooms: { ABC234: { code: "ABC234", theme: "", createdAt: 0, photos: [] } } });
    await launch("/?room=abc234");
    expect(getData().currentRoom).toBe("ABC234");
    expect(push).toHaveBeenCalledWith("/partners");
    expect(window.location.search).toBe("");
  });

  it("an invite to a room this browser doesn't have says so", async () => {
    await launch("/?room=NOPE22");
    expect(getData().currentRoom).toBeNull();
    expect(useToasts.getState().toasts[0].message).toMatch(/^Room not found/);
  });

  it("photos from the share sheet wait on Partners for a room", async () => {
    inbox.push(new File(["x"], "a.jpg"), new File(["x"], "b.jpg"));
    await launch("/partners/?shared=1");
    expect(useShareInbox.getState().files.map((f) => f.name)).toEqual(["a.jpg", "b.jpg"]);
    // Already on Partners: nowhere to go.
    expect(push).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts[0].message).toContain("Create or join a room");
    expect(window.location.search).toBe("");
  });

  it("does nothing on an ordinary visit", async () => {
    await launch("/album/");
    expect(push).not.toHaveBeenCalled();
  });
});
