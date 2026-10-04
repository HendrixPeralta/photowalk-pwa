import { describe, expect, it } from "vitest";
import { digest } from "@/test/digest";
import { lightWindow, solarTimes, sunPosition } from "./sun";

const TOKYO = { lat: 35.6762, lon: 139.6503 };

describe("sun", () => {
  it("puts Tokyo's 2026 June solstice sunrise and sunset in the right window", () => {
    // Published values: sunrise about 04:25, sunset about 19:00 JST (UTC+9).
    const times = solarTimes(new Date("2026-06-21T03:00:00Z"), TOKYO.lat, TOKYO.lon);
    const jst = (d: Date | null) => {
      const h = (d!.getUTCHours() + 9) % 24;
      return h * 60 + d!.getUTCMinutes();
    };
    expect(Math.abs(jst(times.sunrise) - (4 * 60 + 25))).toBeLessThanOrEqual(3);
    expect(Math.abs(jst(times.sunset) - (19 * 60 + 0))).toBeLessThanOrEqual(3);
  });

  it("has no sunset during polar day", () => {
    const times = solarTimes(new Date("2026-06-21T12:00:00Z"), 78.22, 15.65); // Svalbard
    expect(times.sunset).toBeNull();
    expect(lightWindow(new Date("2026-06-21T12:00:00Z"), 78.22, 15.65).phase).toBe("day");
  });

  // Matched the old app when ported; the snapshot keeps every reading as it was.
  it("readings across a year of hours are unchanged", () => {
    const readings = [];
    for (let day = 0; day < 365; day += 7) {
      for (let hour = 0; hour < 24; hour += 5) {
        const date = new Date(Date.UTC(2026, 0, 1 + day, hour, 17));
        readings.push([sunPosition(date, TOKYO.lat, TOKYO.lon), lightWindow(date, TOKYO.lat, TOKYO.lon)]);
      }
    }
    expect(digest(readings)).toMatchSnapshot();
  });
});
