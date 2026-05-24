// Minimal cron-schedule parser for Sprint S — autopilot Automation jobs.
//
// What we support (intentionally narrow — covers ~95% of real ops use cases):
//   - "manual"                         → no auto-fire (returns null)
//   - "@hourly"                        → top of next hour
//   - "@daily" / "@midnight"           → next 00:00 UTC
//   - "@weekly"                        → next Sunday 00:00 UTC
//   - "@monthly"                       → 1st of next month, 00:00 UTC
//   - "M H * * *"  (e.g. "0 6 * * *")  → daily at H:M UTC
//   - "M H D * *"  (e.g. "0 6 1 * *")  → monthly on Dth at H:M UTC
//   - "M H * * D"  (e.g. "0 6 * * 1")  → weekly on day-of-week D at H:M UTC
//
// Everything else → returns null (treated as manual). We log a warning
// when an unrecognized pattern is seen so we can extend later.
//
// All times computed in UTC. Timezone field on AutomationJob is honoured
// only by treating the schedule as UTC for now (Phase 2: tz support).

export function nextRunFrom(
  schedule: string,
  fromDate: Date = new Date()
): Date | null {
  const s = (schedule ?? "").trim();
  if (!s || s === "manual" || s === "@manual") return null;

  // Macros
  if (s === "@hourly")  return nextHour(fromDate);
  if (s === "@daily" || s === "@midnight") return nextDaily(0, 0, fromDate);
  if (s === "@weekly")  return nextWeekly(0, 0, 0, fromDate); // Sun 00:00
  if (s === "@monthly") return nextMonthly(1, 0, 0, fromDate);

  // 5-field cron: M H D MO DOW
  const parts = s.split(/\s+/);
  if (parts.length !== 5) {
    console.warn(`[cron] unsupported schedule (expected 5 fields or macro): "${s}"`);
    return null;
  }
  const [mStr, hStr, dStr, moStr, dowStr] = parts;
  const M = parseField(mStr, 0, 59);
  const H = parseField(hStr, 0, 23);
  if (M === null || H === null) {
    console.warn(`[cron] non-numeric minute/hour in "${s}"`);
    return null;
  }

  // Pattern: M H * * *  (every day)
  if (dStr === "*" && moStr === "*" && dowStr === "*") {
    return nextDaily(H, M, fromDate);
  }
  // Pattern: M H * * D  (weekly on DOW)
  if (dStr === "*" && moStr === "*" && dowStr !== "*") {
    const dow = parseField(dowStr, 0, 6);
    if (dow === null) {
      console.warn(`[cron] bad DOW in "${s}"`);
      return null;
    }
    return nextWeekly(dow, H, M, fromDate);
  }
  // Pattern: M H D * *  (monthly on Dth)
  if (dStr !== "*" && moStr === "*" && dowStr === "*") {
    const dom = parseField(dStr, 1, 31);
    if (dom === null) {
      console.warn(`[cron] bad DOM in "${s}"`);
      return null;
    }
    return nextMonthly(dom, H, M, fromDate);
  }

  console.warn(`[cron] unsupported field combination in "${s}" — extend cron-parser.ts to handle.`);
  return null;
}

function parseField(v: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  if (n < min || n > max) return null;
  return n;
}

function nextHour(from: Date): Date {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

function nextDaily(H: number, M: number, from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(H, M, 0, 0);
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function nextWeekly(targetDow: number, H: number, M: number, from: Date): Date {
  // targetDow: 0=Sun..6=Sat
  const d = new Date(from);
  d.setUTCHours(H, M, 0, 0);
  const today = d.getUTCDay();
  let diff = targetDow - today;
  if (diff < 0 || (diff === 0 && d <= from)) diff += 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function nextMonthly(dom: number, H: number, M: number, from: Date): Date {
  // Try this month first; if already past, roll forward.
  const d = new Date(from);
  d.setUTCDate(1); // park on 1st so setUTCDate(dom) doesn't overflow weirdly
  d.setUTCHours(H, M, 0, 0);

  // Build candidate at clamped DOM (handles short months gracefully).
  const buildAt = (yr: number, mo: number) => {
    const last = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
    const dayUsed = Math.min(dom, last);
    return new Date(Date.UTC(yr, mo, dayUsed, H, M, 0, 0));
  };

  const yr = from.getUTCFullYear();
  const mo = from.getUTCMonth();
  const thisMonth = buildAt(yr, mo);
  if (thisMonth > from) return thisMonth;
  // Roll to next month
  const nextMo = mo === 11 ? 0 : mo + 1;
  const nextYr = mo === 11 ? yr + 1 : yr;
  return buildAt(nextYr, nextMo);
}

/**
 * Human-readable summary for UI tooltips.
 */
export function describeSchedule(schedule: string): string {
  const s = (schedule ?? "").trim();
  if (!s || s === "manual" || s === "@manual") return "Manual (no auto-fire)";
  if (s === "@hourly")  return "Every hour, on the hour";
  if (s === "@daily" || s === "@midnight") return "Every day at 00:00 UTC";
  if (s === "@weekly")  return "Every Sunday at 00:00 UTC";
  if (s === "@monthly") return "1st of every month at 00:00 UTC";

  const parts = s.split(/\s+/);
  if (parts.length !== 5) return `Custom: ${s}`;
  const [m, h, d, mo, dow] = parts;
  const hhmm = `${h.padStart(2, "0")}:${m.padStart(2, "0")} UTC`;
  if (d === "*" && mo === "*" && dow === "*") return `Daily at ${hhmm}`;
  if (d === "*" && mo === "*" && dow !== "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const idx = Number(dow);
    return `Weekly on ${days[idx] ?? dow} at ${hhmm}`;
  }
  if (d !== "*" && mo === "*" && dow === "*") return `Monthly on day ${d} at ${hhmm}`;
  return `Cron: ${s}`;
}
