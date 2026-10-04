import { describe, expect, it, vi } from "vitest";
import { navigate, setNavigator } from "@/lib/nav";
import { screenTitle, viewForPath } from "./routes";

describe("routes", () => {
  it("maps paths to screens, with or without the trailing slash", () => {
    expect(viewForPath("/")).toBe("walks");
    expect(viewForPath("/live")).toBe("hud");
    expect(viewForPath("/live/")).toBe("hud");
    expect(viewForPath("/partners/")).toBe("share");
    expect(viewForPath("/nope/")).toBeNull();
    expect(screenTitle("hud")).toBe("Live Walk");
    expect(screenTitle(null)).toBe("PhotoEYE");
  });

  it("navigation asked for before the router is ready waits for it", () => {
    setNavigator(null);
    navigate("album");
    const push = vi.fn();
    setNavigator(push);
    expect(push).toHaveBeenCalledWith("/album");
    navigate("settings");
    expect(push).toHaveBeenLastCalledWith("/settings");
    setNavigator(null);
  });

  it("going to the screen already showing does nothing", () => {
    window.history.replaceState(null, "", "/album/");
    const push = vi.fn();
    setNavigator(push);
    navigate("album");
    expect(push).not.toHaveBeenCalled();
    navigate("walks");
    expect(push).toHaveBeenCalledWith("/");
    setNavigator(null);
    window.history.replaceState(null, "", "/");
  });
});
