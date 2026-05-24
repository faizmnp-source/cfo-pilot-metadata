/*
 * Unit tests for the cron parser used by AutomationJob autopilot (Sprint S).
 *
 * Covers both exported helpers:
 *   - nextRunFrom(schedule, fromDate?) → Date | null
 *   - describeSchedule(schedule)        → string
 *
 * No DB, no I/O. The cron parser controls when jobs auto-fire, so any
 * regression here changes production scheduling behavior. Anchor all tests
 * to fixed UTC reference dates so they remain deterministic regardless of
 * the runner's local timezone.
 *
 * Reference date used throughout (when not overridden):
 *   2026-05-25T10:30:00.000Z  (Monday)
 */

import { nextRunFrom, describeSchedule } from "./cron-parser";

const REF = new Date("2026-05-25T10:30:00.000Z"); // Monday 10:30 UTC

// ---------------------------------------------------------------------------
// nextRunFrom — null/manual paths
// ---------------------------------------------------------------------------

describe("nextRunFrom — manual / unset", () => {
  test("empty string returns null", () => {
    expect(nextRunFrom("", REF)).toBeNull();
  });

  test("whitespace-only returns null", () => {
    expect(nextRunFrom("   ", REF)).toBeNull();
  });

  test('"manual" returns null', () => {
    expect(nextRunFrom("manual", REF)).toBeNull();
  });

  test('"@manual" returns null', () => {
    expect(nextRunFrom("@manual", REF)).toBeNull();
  });

  test("undefined-cast-to-string returns null", () => {
    // mimics callers that pass `job.schedule ?? ""` then forward
    expect(nextRunFrom(undefined as unknown as string, REF)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — macro schedules
// ---------------------------------------------------------------------------

describe("nextRunFrom — @hourly", () => {
  test("rolls to top of the next hour, zeroed mins/secs/ms", () => {
    const got = nextRunFrom("@hourly", REF)!;
    expect(got).toBeInstanceOf(Date);
    expect(got.toISOString()).toBe("2026-05-25T11:00:00.000Z");
  });

  test("at HH:00:00 exactly, rolls to HH+1:00", () => {
    const at = new Date("2026-05-25T09:00:00.000Z");
    const got = nextRunFrom("@hourly", at)!;
    expect(got.toISOString()).toBe("2026-05-25T10:00:00.000Z");
  });

  test("crosses day boundary at 23:xx", () => {
    const at = new Date("2026-05-25T23:42:11.500Z");
    const got = nextRunFrom("@hourly", at)!;
    expect(got.toISOString()).toBe("2026-05-26T00:00:00.000Z");
  });
});

describe("nextRunFrom — @daily / @midnight", () => {
  test('"@daily" returns next midnight UTC', () => {
    expect(nextRunFrom("@daily", REF)!.toISOString()).toBe(
      "2026-05-26T00:00:00.000Z"
    );
  });

  test('"@midnight" is an alias for @daily', () => {
    const a = nextRunFrom("@daily", REF)!.toISOString();
    const b = nextRunFrom("@midnight", REF)!.toISOString();
    expect(a).toBe(b);
  });

  test("at 00:00:00 exactly, rolls to next day", () => {
    const at = new Date("2026-05-25T00:00:00.000Z");
    expect(nextRunFrom("@daily", at)!.toISOString()).toBe(
      "2026-05-26T00:00:00.000Z"
    );
  });
});

describe("nextRunFrom — @weekly", () => {
  test("from Monday rolls to next Sunday 00:00 UTC", () => {
    // REF is Monday 2026-05-25; next Sunday is 2026-05-31
    expect(nextRunFrom("@weekly", REF)!.toISOString()).toBe(
      "2026-05-31T00:00:00.000Z"
    );
  });

  test("from Saturday 23:59 rolls to next-day Sunday 00:00", () => {
    const sat = new Date("2026-05-30T23:59:59.000Z");
    expect(nextRunFrom("@weekly", sat)!.toISOString()).toBe(
      "2026-05-31T00:00:00.000Z"
    );
  });

  test("from Sunday 00:00 exactly, rolls to following Sunday", () => {
    const sun = new Date("2026-05-31T00:00:00.000Z");
    expect(nextRunFrom("@weekly", sun)!.toISOString()).toBe(
      "2026-06-07T00:00:00.000Z"
    );
  });
});

describe("nextRunFrom — @monthly", () => {
  test("mid-month picks the 1st of next month", () => {
    expect(nextRunFrom("@monthly", REF)!.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
  });

  test("on the 1st at 00:00 exactly, rolls to 1st of following month", () => {
    const firstOfMonth = new Date("2026-06-01T00:00:00.000Z");
    expect(nextRunFrom("@monthly", firstOfMonth)!.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z"
    );
  });

  test("crosses year boundary from December", () => {
    const dec = new Date("2026-12-15T08:00:00.000Z");
    expect(nextRunFrom("@monthly", dec)!.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — 5-field cron: M H * * *  (daily at H:M UTC)
// ---------------------------------------------------------------------------

describe("nextRunFrom — daily at H:M", () => {
  test('"0 6 * * *" before 06:00 today returns today at 06:00', () => {
    const early = new Date("2026-05-25T05:00:00.000Z");
    expect(nextRunFrom("0 6 * * *", early)!.toISOString()).toBe(
      "2026-05-25T06:00:00.000Z"
    );
  });

  test('"0 6 * * *" after 06:00 today rolls to tomorrow 06:00', () => {
    expect(nextRunFrom("0 6 * * *", REF)!.toISOString()).toBe(
      "2026-05-26T06:00:00.000Z"
    );
  });

  test('"30 14 * * *" produces 14:30 anchor correctly', () => {
    expect(nextRunFrom("30 14 * * *", REF)!.toISOString()).toBe(
      "2026-05-25T14:30:00.000Z"
    );
  });

  test('"0 0 * * *" equivalent to @daily', () => {
    const a = nextRunFrom("0 0 * * *", REF)!.toISOString();
    const b = nextRunFrom("@daily", REF)!.toISOString();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — 5-field cron: M H * * D  (weekly on DOW at H:M)
// ---------------------------------------------------------------------------

describe("nextRunFrom — weekly on DOW at H:M", () => {
  test('"0 6 * * 1" Monday 06:00 — from Monday 10:30 rolls to next Monday', () => {
    // REF=Monday 10:30; same-day 06:00 has passed → next Monday
    expect(nextRunFrom("0 6 * * 1", REF)!.toISOString()).toBe(
      "2026-06-01T06:00:00.000Z"
    );
  });

  test('"0 6 * * 1" Monday 06:00 — from Sunday returns next-day Monday', () => {
    const sun = new Date("2026-05-24T12:00:00.000Z"); // Sun
    expect(nextRunFrom("0 6 * * 1", sun)!.toISOString()).toBe(
      "2026-05-25T06:00:00.000Z"
    );
  });

  test('"0 12 * * 0" Sunday noon — from Friday returns this Sunday 12:00', () => {
    const fri = new Date("2026-05-22T10:00:00.000Z"); // Fri
    expect(nextRunFrom("0 12 * * 0", fri)!.toISOString()).toBe(
      "2026-05-24T12:00:00.000Z"
    );
  });

  test('"0 12 * * 6" Saturday noon — from Saturday 12:00 exact rolls to next Sat', () => {
    const sat = new Date("2026-05-23T12:00:00.000Z");
    expect(nextRunFrom("0 12 * * 6", sat)!.toISOString()).toBe(
      "2026-05-30T12:00:00.000Z"
    );
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — 5-field cron: M H D * *  (monthly on DOM at H:M)
// ---------------------------------------------------------------------------

describe("nextRunFrom — monthly on DOM at H:M", () => {
  test('"0 6 1 * *" 1st @ 06:00 — mid-month rolls to next month 1st', () => {
    expect(nextRunFrom("0 6 1 * *", REF)!.toISOString()).toBe(
      "2026-06-01T06:00:00.000Z"
    );
  });

  test('"0 6 28 * *" 28th @ 06:00 — same month from REF returns 2026-05-28', () => {
    expect(nextRunFrom("0 6 28 * *", REF)!.toISOString()).toBe(
      "2026-05-28T06:00:00.000Z"
    );
  });

  test('"0 6 31 * *" in February clamps to last day of Feb', () => {
    const jan = new Date("2026-01-15T00:00:00.000Z");
    // From Jan 15 → next 31 is Jan 31
    expect(nextRunFrom("0 6 31 * *", jan)!.toISOString()).toBe(
      "2026-01-31T06:00:00.000Z"
    );
    // From Feb 1 → next "31" clamps to Feb 28 (2026 non-leap)
    const feb1 = new Date("2026-02-01T00:00:00.000Z");
    expect(nextRunFrom("0 6 31 * *", feb1)!.toISOString()).toBe(
      "2026-02-28T06:00:00.000Z"
    );
  });

  test('"0 6 31 * *" clamps to Feb 29 in leap year 2028', () => {
    const feb1Leap = new Date("2028-02-01T00:00:00.000Z");
    expect(nextRunFrom("0 6 31 * *", feb1Leap)!.toISOString()).toBe(
      "2028-02-29T06:00:00.000Z"
    );
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — invalid / unsupported patterns
// ---------------------------------------------------------------------------

describe("nextRunFrom — invalid / unsupported", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("4-field cron returns null", () => {
    expect(nextRunFrom("0 6 * *", REF)).toBeNull();
  });

  test("6-field (with seconds) returns null", () => {
    expect(nextRunFrom("0 0 6 * * *", REF)).toBeNull();
  });

  test("non-numeric minute returns null", () => {
    expect(nextRunFrom("X 6 * * *", REF)).toBeNull();
  });

  test("out-of-range minute (60) returns null", () => {
    expect(nextRunFrom("60 6 * * *", REF)).toBeNull();
  });

  test("out-of-range hour (24) returns null", () => {
    expect(nextRunFrom("0 24 * * *", REF)).toBeNull();
  });

  test("out-of-range DOW (7) returns null", () => {
    expect(nextRunFrom("0 6 * * 7", REF)).toBeNull();
  });

  test("out-of-range DOM (32) returns null", () => {
    expect(nextRunFrom("0 6 32 * *", REF)).toBeNull();
  });

  test("DOM=0 returns null (parser min is 1)", () => {
    expect(nextRunFrom("0 6 0 * *", REF)).toBeNull();
  });

  test("step/list syntax (not supported) returns null", () => {
    expect(nextRunFrom("*/5 * * * *", REF)).toBeNull();
    expect(nextRunFrom("0,15,30 * * * *", REF)).toBeNull();
    expect(nextRunFrom("0 9-17 * * *", REF)).toBeNull();
  });

  test("both DOM and DOW set is unsupported and returns null", () => {
    // The parser only handles M H * * *, M H D * *, M H * * D
    expect(nextRunFrom("0 6 1 * 1", REF)).toBeNull();
  });

  test("month field other than '*' is unsupported", () => {
    expect(nextRunFrom("0 6 1 6 *", REF)).toBeNull();
  });

  test("warns at least once on an unsupported pattern", () => {
    nextRunFrom("X Y Z Q R", REF);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// nextRunFrom — invariants
// ---------------------------------------------------------------------------

describe("nextRunFrom — invariants", () => {
  test("result is always strictly after the reference moment", () => {
    const refs = [
      "@hourly",
      "@daily",
      "@weekly",
      "@monthly",
      "0 6 * * *",
      "30 14 * * *",
      "0 6 * * 1",
      "0 6 1 * *",
    ];
    for (const s of refs) {
      const got = nextRunFrom(s, REF)!;
      expect(got).toBeInstanceOf(Date);
      expect(got.getTime()).toBeGreaterThan(REF.getTime());
    }
  });

  test("default fromDate uses 'now' (returned date is in the future)", () => {
    const got = nextRunFrom("@daily")!;
    expect(got.getTime()).toBeGreaterThan(Date.now() - 1000);
  });
});

// ---------------------------------------------------------------------------
// describeSchedule — human-readable summaries
// ---------------------------------------------------------------------------

describe("describeSchedule", () => {
  test("empty / manual variants", () => {
    expect(describeSchedule("")).toBe("Manual (no auto-fire)");
    expect(describeSchedule("manual")).toBe("Manual (no auto-fire)");
    expect(describeSchedule("@manual")).toBe("Manual (no auto-fire)");
    expect(describeSchedule("   ")).toBe("Manual (no auto-fire)");
  });

  test("macros", () => {
    expect(describeSchedule("@hourly")).toBe("Every hour, on the hour");
    expect(describeSchedule("@daily")).toBe("Every day at 00:00 UTC");
    expect(describeSchedule("@midnight")).toBe("Every day at 00:00 UTC");
    expect(describeSchedule("@weekly")).toBe("Every Sunday at 00:00 UTC");
    expect(describeSchedule("@monthly")).toBe(
      "1st of every month at 00:00 UTC"
    );
  });

  test("daily H:M zero-pads single-digit hour and minute", () => {
    expect(describeSchedule("5 6 * * *")).toBe("Daily at 06:05 UTC");
    expect(describeSchedule("30 14 * * *")).toBe("Daily at 14:30 UTC");
  });

  test("weekly DOW maps to day name", () => {
    expect(describeSchedule("0 9 * * 0")).toBe("Weekly on Sun at 09:00 UTC");
    expect(describeSchedule("0 9 * * 1")).toBe("Weekly on Mon at 09:00 UTC");
    expect(describeSchedule("0 9 * * 6")).toBe("Weekly on Sat at 09:00 UTC");
  });

  test("weekly with out-of-range DOW falls back to raw value", () => {
    expect(describeSchedule("0 9 * * 7")).toBe("Weekly on 7 at 09:00 UTC");
  });

  test("monthly on DOM", () => {
    expect(describeSchedule("0 6 15 * *")).toBe("Monthly on day 15 at 06:00 UTC");
  });

  test("non-5-field input → 'Custom: …'", () => {
    expect(describeSchedule("0 6 *")).toBe("Custom: 0 6 *");
  });

  test("5-field but unrecognized shape → 'Cron: …'", () => {
    // both DOM and DOW set
    expect(describeSchedule("0 6 1 * 1")).toBe("Cron: 0 6 1 * 1");
    // month != '*'
    expect(describeSchedule("0 6 1 6 *")).toBe("Cron: 0 6 1 6 *");
  });
});
