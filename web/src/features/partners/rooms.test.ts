import { beforeEach, describe, expect, it, vi } from "vitest";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { useShareInbox } from "./inbox";
import { addComment, createRoom, inviteUrl, joinRoom, leaveRoom, postNote, uploadToRoom } from "./rooms";

vi.mock("@/lib/db", () => ({ putImage: async () => {}, storageEstimate: async () => null }));
vi.mock("@/lib/exif", () => ({ readExif: async () => ({ shutter: "1/60s" }) }));
vi.mock("@/lib/image", () => ({
  readFileAsDataUrl: async (file: File) => file.name,
  loadImage: async (src: string) => {
    if (src === "broken.jpg") throw new Error("cannot decode");
    return {};
  },
  drawToCanvas: () => ({}),
  canvasToBlob: async () => new Blob(["x"]),
}));

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  useShareInbox.setState({ files: [] });
});

describe("rooms", () => {
  it("creates a room and joins it", () => {
    const code = createRoom(1000);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(getData().currentRoom).toBe(code);
    expect(getData().rooms[code]).toEqual({ code, theme: "", createdAt: 1000, photos: [] });
    expect(useToasts.getState().toasts[0].message).toContain(`Room ${code} created.`);
  });

  it("joins an existing room by code, whatever the case and spacing", () => {
    const code = createRoom();
    leaveRoom();
    expect(getData().currentRoom).toBeNull();
    expect(joinRoom(`  ${code.toLowerCase()} `)).toBeNull();
    expect(getData().currentRoom).toBe(code);
  });

  it("says why a code doesn't work", () => {
    expect(joinRoom(" ")).toBe("Enter a room code.");
    expect(joinRoom("NOPE22")).toMatch(/^Room not found/);
    expect(getData().currentRoom).toBeNull();
  });
});

describe("in a room", () => {
  it("shares photos under the poster's name, skipping files that can't be read", async () => {
    const code = createRoom();
    update((d) => { d.activeWalk = { mode: "casual", themeId: "reflections", startedAt: 1, durationMin: null, challengesChecked: [], nudges: [], pausedAt: null }; });
    useShareInbox.setState({ files: [photo("inbox.jpg")] });
    expect(await uploadToRoom([photo("a.jpg"), photo("broken.jpg")], " Ana ", " at dusk ")).toBe(true);

    const [shot] = getData().rooms[code].photos;
    expect(getData().rooms[code].photos).toHaveLength(1);
    expect(shot).toMatchObject({ name: "Ana", note: "at dusk", exif: { shutter: "1/60s" }, themeId: "reflections", comments: [] });
    expect(getData().profile.displayName).toBe("Ana");
    expect(useShareInbox.getState().files).toEqual([]);
    expect(toasts().at(-1)).toBe("Shared with the room.");
  });

  it("says what is missing before uploading", async () => {
    expect(await uploadToRoom([photo("a.jpg")], "Ana", "")).toBe(false);
    createRoom();
    expect(await uploadToRoom([], "Ana", "")).toBe(false);
    expect(await uploadToRoom([photo("broken.jpg")], "Ana", "")).toBe(false);
    expect(toasts().filter((m) => !m.startsWith("Room "))).toEqual([
      "Create or join a room first, then upload.",
      "Choose at least one photo to upload first.",
      "None of those files could be read as images.",
    ]);
  });

  it("takes comments and feedback notes", async () => {
    const code = createRoom();
    await uploadToRoom([photo("a.jpg")], "Ana", "");
    const id = getData().rooms[code].photos[0].id;
    expect(addComment(code, id, "", "  ")).toBe(false);
    expect(addComment(code, id, "Ken", "Nice light")).toBe(true);
    expect(getData().rooms[code].photos[0].comments).toMatchObject([{ name: "Ken", text: "Nice light" }]);

    expect(postNote("Shot from the hip", ["#LowAngle", "#Backlit"])).toBe(true);
    expect(getData().rooms[code].critique).toMatchObject([{ name: "Ken", text: "Shot from the hip", spec: "#LowAngle #Backlit" }]);
  });

  it("invites with a link straight to the room", () => {
    expect(inviteUrl("ABC234", "https://photoeye.app")).toBe("https://photoeye.app/partners/?room=ABC234");
  });
});
