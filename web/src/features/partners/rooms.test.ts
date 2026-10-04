import { beforeEach, describe, expect, it } from "vitest";
import { getData, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { createRoom, joinRoom, leaveRoom } from "./rooms";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
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
