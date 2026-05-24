// Forecast Waterfall — pure functions for Sprint P.
//
// Bridges FORECAST total → ACTUAL total by stacking per-account variance
// contributions. The classic FP&A waterfall: a left anchor bar (forecast),
// floating bars in the middle (top contributors, colored by favorability),
// optional "Other" rollup bar, and a right anchor bar (actual). The vertical
// position of each floating bar is the running cumulative.
//
// Kept dependency-free so it can be unit-tested without React or a database.

import type { Favorability, AccountTypeForFav, VarianceRow } from "./variance";

// Minimal row shape the waterfall needs. Lifted out of variance.ts's
// `VarianceRow` so the lib stays loosely coupled and a caller can synthesize
// it from any source (mock data, future scenario-vs-scenario, etc.).
export type WaterfallSourceRow = {
  accountId:    string;
  accountCode?: string;
  accountName?: string;
  accountType?: AccountTypeForFav | null;
  variance:     number;             // actual - forecast on this row
  favorability?: Favorability;      // when omitted, derived from variance sign + accountType
};

// One bar in the waterfall, ready for rendering. `runningStart` is where the
// bar starts on the value axis, `runningEnd` is where it ends. For floating
// bars the diff equals `variance`; for anchor bars (forecast/actual) the
// bar goes from 0 → that total.
export type WaterfallBar = {
  kind:        "anchor-start" | "contributor" | "anchor-end" | "other";
  label:       string;
  sublabel?:   string;             // small text under the label (e.g. account code)
  variance:    number;             // signed contribution (anchor bars use total here too)
  runningStart: number;            // y-position where the bar starts
  runningEnd:   number;            // y-position where the bar ends
  favorability?: Favorability;     // drives color
  accountId?:   string;            // for click-through later
};

export type WaterfallSeries = {
  forecastTotal: number;
  actualTotal:   number;
  bars:          WaterfallBar[];
  topN:          number;
  otherCount:    number;
  otherVariance: number;
};

// Aggregate rows by account (sum variance across entities/periods).
// Returns deterministic ordering: by absolute variance descending, ties
// broken by accountCode asc so snapshots are stable.
export function aggregateByAccount(rows: WaterfallSourceRow[]): WaterfallSourceRow[] {
  const acc = new Map<string, WaterfallSourceRow>();
  for (const r of rows) {
    const prior = acc.get(r.accountId);
    if (!prior) {
      acc.set(r.accountId, { ...r });
      continue;
    }
    // Sum the variance; keep first non-null label/type/favorability.
    prior.variance += r.variance;
    prior.accountCode ??= r.accountCode;
    prior.accountName ??= r.accountName;
    prior.accountType ??= r.accountType;
    // Favorability re-derived later if needed (see deriveFavorability).
    prior.favorability ??= r.favorability;
  }
  const out = Array.from(acc.values());
  out.sort((a, b) => {
    const d = Math.abs(b.variance) - Math.abs(a.variance);
    if (d !== 0) return d;
    return (a.accountCode ?? a.accountId).localeCompare(b.accountCode ?? b.accountId);
  });
  return out;
}

// Derive favorability from variance sign + account type when the caller
// didn't pass it explicitly. Mirrors the rules in variance.ts so the
// waterfall stays consistent with the scorecard table.
export function deriveFavorability(variance: number, accountType: AccountTypeForFav | null | undefined, epsilon = 0.5): Favorability {
  if (Math.abs(variance) < epsilon) return "flat";
  if (accountType === "REVENUE") return variance > 0 ? "favorable" : "unfavorable";
  if (accountType === "EXPENSE") return variance > 0 ? "unfavorable" : "favorable";
  // ASSET / LIABILITY / EQUITY / null — neutral (no P&L story).
  return "neutral";
}

// Build the bar list given a forecast anchor, an actual anchor, the top N
// contributors, and any leftover variance rolled into an "Other" bar.
//
// Top-N rule: take the N rows with largest |variance|. If there are more
// than N source rows, the remainder is collapsed into a single "Other" bar.
export type BuildOptions = {
  topN?:                 number;   // default 8
  includeOther?:         boolean;  // default true — show rollup of leftovers
  forecastLabel?:        string;   // default "Forecast"
  actualLabel?:          string;   // default "Actual"
  otherLabel?:           string;   // default "Other"
  deriveFavorabilityFn?: (v: number, t: AccountTypeForFav | null | undefined) => Favorability;
};

export function buildWaterfall(
  forecastTotal: number,
  actualTotal:   number,
  rows:          WaterfallSourceRow[],
  opts:          BuildOptions = {},
): WaterfallSeries {
  const topN          = opts.topN          ?? 8;
  const includeOther  = opts.includeOther  ?? true;
  const forecastLabel = opts.forecastLabel ?? "Forecast";
  const actualLabel   = opts.actualLabel   ?? "Actual";
  const otherLabel    = opts.otherLabel    ?? "Other";
  const favFn         = opts.deriveFavorabilityFn ?? deriveFavorability;

  const aggregated = aggregateByAccount(rows);
  const head       = aggregated.slice(0, topN);
  const tail       = aggregated.slice(topN);
  const tailSum    = tail.reduce((s, r) => s + r.variance, 0);

  const bars: WaterfallBar[] = [];

  // Anchor start — forecast. Always drawn from 0 → forecastTotal.
  bars.push({
    kind:        "anchor-start",
    label:       forecastLabel,
    variance:    forecastTotal,
    runningStart: 0,
    runningEnd:   forecastTotal,
  });

  // Contributors — each variance laid out as running cumulative on top
  // of forecastTotal. A positive variance steps up, negative steps down.
  let running = forecastTotal;
  for (const r of head) {
    const start = running;
    const end   = running + r.variance;
    bars.push({
      kind:        "contributor",
      label:       r.accountCode ?? r.accountId,
      sublabel:    r.accountName,
      variance:    r.variance,
      runningStart: start,
      runningEnd:   end,
      favorability: r.favorability ?? favFn(r.variance, r.accountType ?? null),
      accountId:   r.accountId,
    });
    running = end;
  }

  // Optional "Other" rollup of leftover rows.
  let otherCount = 0;
  if (includeOther && tail.length > 0 && Math.abs(tailSum) > 1e-9) {
    const start = running;
    const end   = running + tailSum;
    bars.push({
      kind:        "other",
      label:       otherLabel,
      sublabel:    `${tail.length} more accounts`,
      variance:    tailSum,
      runningStart: start,
      runningEnd:   end,
      favorability: "neutral",
    });
    running = end;
    otherCount = tail.length;
  }

  // Anchor end — actual. Drawn from 0 → actualTotal. We don't reconcile
  // running here on purpose: the caller may have rows scoped narrower than
  // the totals (e.g. they sent enriched=true but only N accounts), so the
  // walking bars don't necessarily land on actualTotal. The component
  // surfaces the residual with a tiny "Δ unbridged" note if it exists.
  bars.push({
    kind:        "anchor-end",
    label:       actualLabel,
    variance:    actualTotal,
    runningStart: 0,
    runningEnd:   actualTotal,
  });

  return {
    forecastTotal,
    actualTotal,
    bars,
    topN,
    otherCount,
    otherVariance: tailSum,
  };
}

// Compute the residual: how much of (actual - forecast) is NOT explained
// by the bars in `series` (anything outside head + "Other" if disabled).
// Positive means actual is higher than the walk explains.
export function unbridgedDelta(series: WaterfallSeries): number {
  const explained = series.bars
    .filter(b => b.kind === "contributor" || b.kind === "other")
    .reduce((s, b) => s + b.variance, 0);
  const totalVariance = series.actualTotal - series.forecastTotal;
  return totalVariance - explained;
}

// Project bar y-coordinates into a px viewport. Returns the bar with two
// extra fields: `pxTop` (in px from top of the chart) and `pxHeight` (>0).
// Caller supplies the chart pixel height + the min/max of the value axis.
export type ProjectedBar = WaterfallBar & {
  pxTop:    number;
  pxHeight: number;
};
export function projectBarsToPixels(bars: WaterfallBar[], pxHeight: number, valueMin: number, valueMax: number): ProjectedBar[] {
  const range = valueMax - valueMin || 1;
  const valueToPx = (v: number) => pxHeight - ((v - valueMin) / range) * pxHeight;
  return bars.map(b => {
    const yStart = valueToPx(b.runningStart);
    const yEnd   = valueToPx(b.runningEnd);
    const top    = Math.min(yStart, yEnd);
    const height = Math.max(1, Math.abs(yEnd - yStart));
    return { ...b, pxTop: top, pxHeight: height };
  });
}

// Compute the value-axis bounds (min/max) covering every bar, with a
// little headroom so labels don't kiss the edges. 5% padding by default.
export function computeValueBounds(bars: WaterfallBar[], padPct = 0.05): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const b of bars) {
    min = Math.min(min, b.runningStart, b.runningEnd);
    max = Math.max(max, b.runningStart, b.runningEnd);
  }
  const span = max - min || 1;
  const pad  = span * padPct;
  return { min: min - pad, max: max + pad };
}

// Convenience: derive WaterfallSourceRow[] from VarianceRow[].
// VarianceRow is the type that comes back from /api/v2/forecast/variance.
export function sourceFromVarianceRows(rows: VarianceRow[] & Array<{ accountCode?: string; accountName?: string }>): WaterfallSourceRow[] {
  return rows.map(r => ({
    accountId:    r.accountId,
    accountCode:  (r as any).accountCode,
    accountName:  (r as any).accountName,
    accountType:  r.accountType ?? null,
    variance:     r.variance,
    favorability: r.favorability,
  }));
}
