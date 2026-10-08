import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@/lib/rooms/protocol";
import { roomsApi } from "@/lib/roomsApi";
import { useAccount } from "@/state/account";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { useShareInbox } from "./inbox";
import { keepPostedImage } from "./roomImages";
import { addComment, closeRoom, createRoom, inviteUrl, joinRoom, leaveRoom, postNote, uploadToRoom } from "./rooms";
import { useRoom } from "./roomStore";

vi.mock("./roomImages", () => ({ keepPostedImage: vi.fn(async () => {}), pruneRoomImages: vi.fn(async () => {}) }));
vi.mock("@/lib/exif", () => ({ readExif: async () => ({ shutter: "1/60s" }) }));
vi.mock("@/lib/image", () => ({
  readFileAsDataUrl: async (file: File) => file.name,
  loadImage: async (src: string) => {
    if (src === "broken.jpg") throw new Error("cannot decode");
    return {};
  },
  drawToCanvas: () => ({ width: 900, height: 600 }),
  canvasToBlob: async () => new Blob(["x"], { type: "image/jpeg" }),
}));

const room = (over: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code: "ABC234", theme: "", hostId: "ana", version: 1, createdAt: 0, lastActivityAt: 0, expiresAt: 0,
  members: ["ana"], people: { ana: { id: "ana", name: "Ana", image: null } }, photos: [], notes: [], ...over,
});
const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useRoom.setState({ room: null, syncedAt: null, offline: false, paused: false });
  useAccount.setState({ user: { id: "ana", name: "Ana", email: "ana@example.com", image: null }, status: "signed-in" });
  useToasts.setState({ toasts: [] });
  useShareInbox.setState({ files: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("rooms", () => {
  it("creates a room on the server, named after the walk", async () => {
    update((d) => { d.lastWalk = { id: "w", themeId: "reflections", mode: "casual", durationMin: null, hours: 1, challengesDone: 0, challengeCount: 0, endedAt: 0 }; });
    const create = vi.spyOn(roomsApi, "create").mockResolvedValue({ ok: true, data: { room: room({ code: "XYZ789" }) } });
    expect(await createRoom()).toBeNull();
    expect(create.mock.calls[0][0]).not.toBe("");
    expect(getData().currentRoom).toBe("XYZ789");
    expect(toasts()[0]).toContain("Room XYZ789 created.");
  });

  it("joins with a code typed any way, or says why not", async () => {
    const join = vi.spyOn(roomsApi, "join").mockResolvedValue({ ok: true, data: { room: room() } });
    expect(await joinRoom(" abc-234 ")).toBeNull();
    expect(join).toHaveBeenCalledWith("ABC234");
    expect(getData().currentRoom).toBe("ABC234");

    expect(await joinRoom("")).toBe("Enter a room code.");
    expect(await joinRoom("nope")).toBe("That doesn't look like a room code.");
    join.mockResolvedValue({ ok: false, error: "room_not_found" });
    expect(await joinRoom("ZZZ999")).toBe("Room not found. It may have closed.");
  });

  it("leaves the room, or forgets it if it's already gone", async () => {
    update((d) => { d.currentRoom = "ABC234"; });
    const remove = vi.spyOn(roomsApi, "removeMember").mockResolvedValue({ ok: true, data: undefined });
    await leaveRoom();
    expect(remove).toHaveBeenCalledWith("ABC234", "ana");
    expect(getData().currentRoom).toBeNull();

    update((d) => { d.currentRoom = "ABC234"; });
    remove.mockResolvedValue({ ok: false, error: "room_not_found" });
    await leaveRoom();
    expect(getData().currentRoom).toBeNull();
  });

  it("closes the host's room", async () => {
    update((d) => { d.currentRoom = "ABC234"; });
    vi.spyOn(roomsApi, "close").mockResolvedValue({ ok: true, data: undefined });
    await closeRoom();
    expect(getData().currentRoom).toBeNull();
    expect(toasts()).toEqual(["Room ABC234 closed."]);
  });
});

describe("posting", () => {
  beforeEach(() => { update((d) => { d.currentRoom = "ABC234"; }); });

  it("uploads shrunk photos one at a time, skipping unreadable files, and keeps them on the device", async () => {
    const upload = vi.spyOn(roomsApi, "uploadPhoto").mockImplementation(async () => ({
      ok: true, data: { photo: { id: `p${upload.mock.calls.length}` } as never, room: room() },
    }));
    const progress: string[] = [];
    useShareInbox.setState({ files: [photo("a.jpg"), photo("broken.jpg"), photo("b.jpg")] });
    const files = useShareInbox.getState().files;
    expect(await uploadToRoom(files, "  At the pier ", (d, n) => progress.push(`${d}/${n}`))).toBe(true);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][2]).toEqual({ note: "At the pier", width: 900, height: 600, exif: { shutter: "1/60s" }, themeId: null });
    expect(keepPostedImage).toHaveBeenCalledWith("p1", expect.any(Blob));
    expect(progress).toEqual(["0/3", "1/3", "2/3", "3/3"]);
    // Posted files leave the share inbox; the unreadable one is left to the person.
    expect(useShareInbox.getState().files.map((f) => f.name)).toEqual(["broken.jpg"]);
    expect(toasts()).toEqual(["Shared 2 shots with the room."]);
  });

  it("stops at the first failure and keeps what didn't go", async () => {
    vi.spyOn(roomsApi, "uploadPhoto").mockResolvedValue({ ok: false, error: "photo_too_large" });
    useShareInbox.setState({ files: [photo("a.jpg")] });
    expect(await uploadToRoom(useShareInbox.getState().files, "")).toBe(false);
    expect(useShareInbox.getState().files).toHaveLength(1);
    expect(toasts()).toEqual(["That photo is too large."]);
  });

  it("asks for a room, a photo, and a connection first", async () => {
    update((d) => { d.currentRoom = null; });
    expect(await uploadToRoom([photo("a.jpg")], "")).toBe(false);
    update((d) => { d.currentRoom = "ABC234"; });
    expect(await uploadToRoom([], "")).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await uploadToRoom([photo("a.jpg")], "")).toBe(false);
    expect(toasts()).toEqual([
      "Create or join a room first, then upload.",
      "Choose at least one photo to upload first.",
      "You're offline. Connect to use the room.",
    ]);
  });

  it("posts comments and notes with canonical tags", async () => {
    const comment = vi.spyOn(roomsApi, "comment").mockResolvedValue({ ok: true, data: { room: room() } });
    const note = vi.spyOn(roomsApi, "note").mockResolvedValue({ ok: true, data: { room: room() } });
    expect(await addComment("p1", "  Nice light ")).toBe(true);
    expect(comment).toHaveBeenCalledWith("p1", "Nice light");
    expect(await addComment("p1", "   ")).toBe(false);
    expect(await postNote("Shot from the hip", ["#LowAngle", "#Backlit"])).toBe(true);
    expect(note).toHaveBeenCalledWith("ABC234", "Shot from the hip", ["#LowAngle", "#Backlit"]);
  });

  it("a room that closed meanwhile is forgotten", async () => {
    vi.spyOn(roomsApi, "note").mockResolvedValue({ ok: false, error: "room_not_found" });
    expect(await postNote("Hello", [])).toBe(false);
    expect(getData().currentRoom).toBeNull();
    expect(toasts()).toEqual(["Room ABC234 has closed."]);
  });
});

it("invite links open the room's page", () => {
  expect(inviteUrl("ABC234", "https://example.com")).toBe("https://example.com/partners/?room=ABC234");
});
