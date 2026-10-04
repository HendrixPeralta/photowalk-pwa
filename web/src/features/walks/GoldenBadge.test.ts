import { describe, expect, it } from "vitest";
import { solarTimes } from "@/lib/sun";
import { goldenReading } from "./GoldenBadge";

// Tokyo in June. Moments are placed relative to the computed sun times, so
// the test holds whatever time zone it runs in.
const TOKYO = { lat: 35.6812, lon: 139.7671 };
const DAY = new Date(2026, 5, 10, 12, 0);
const times = solarTimes(DAY, TOKYO.lat, TOKYO.lon);
const shift = (d: Date | null, minutes: number) => new Date(d!.getTime() + minutes * 60_000);

describe("golden-hour badge", () => {
  it("counts down the minutes left inside golden hour", () => {
    const reading = goldenReading(shift(times.sunset, -20), TOKYO);
    expect(reading).toMatchObject({ text: "20 min of golden hour left", state: "now" });
  });

  it("gives the clock time the evening window opens during the day", () => {
    const reading = goldenReading(times.solarNoon, TOKYO);
    expect(reading.state).toBe("next");
    expect(reading.text).toMatch(/^Golden \d\d:\d\d$/);
  });

  it("points at sunrise before dawn, and at tomorrow morning after sunset", () => {
    expect(goldenReading(shift(times.sunrise, -30), TOKYO).title).toBe("Morning golden hour starts at sunrise");
    expect(goldenReading(shift(times.sunset, 60), TOKYO).title).toBe("Tomorrow morning golden hour");
  });
});
