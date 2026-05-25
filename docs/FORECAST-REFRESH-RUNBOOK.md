# Forecast Refresh Runbook — Apple Inc

**Tenant:** Apple Inc · `admin@apple.com`
**Cadence:** monthly (right after close completes — T+5 onwards) and ad-hoc when material new info comes in (M&A, macro shock, product launch news).
**Horizon:** rolling 12 months forward from the current open period.

Forecast at Apple = next-12-months view at the Group level, broken by entity + product. The CFO Pilot forecast engine handles three layers:

1. **Statistical baseline** — Holt-Winters + Linear + ARIMA/Prophet ensemble per (account, entity).
2. **Driver-based overlay** — apply business drivers (e.g., "iPhone units × ASP", "Headcount × Avg Comp") on top of the baseline.
3. **Manual override** — sales leadership, BU heads, and finance can adjust any cell with full audit trail.

---

## Pre-flight: confirm prior close is locked

Before refreshing forecast for the next 12 months, the prior period must be locked. This ensures the actuals you're forecasting *from* are stable.

1. `/close` → confirm latest closed period (e.g., 2026M05 → LOCKED).
2. `/dashboard` → POV should default to that period.

If the close isn't locked, finish [`MONTHLY-CLOSE-RUNBOOK.md`](./MONTHLY-CLOSE-RUNBOOK.md) first.

---

## Step 1. Pull statistical baseline (~30 min)

**Screen:** `/forecast`

For each leaf revenue account (iPhone, Mac, iPad, Wearables, App Store, iCloud, Music, AppleCare, Advertising):

1. Pick **Account** = e.g. iPhone (`4110`).
2. Pick **Entity scope** = "All subs separately" (the engine runs once per sub).
3. **Training window** = last 24 months (Jan 2024 – May 2026 inclusive — use whatever's loaded).
4. **Horizon** = 12 months forward (Jun 2026 – May 2027).
5. **Method** = Ensemble. The engine runs three methods in parallel:
   - **Holt-Winters** — captures trend + seasonality. Best on stable seasonal series like iPhone.
   - **Linear regression with seasonal dummies** — captures slow trend + monthly bumps.
   - **ARIMA / Prophet (Modal)** — for non-trivial series (Services growth curves). Routed to the Python Modal service.
6. Click "Run Forecast".
7. Inspect the MAPE chart. The ensemble picks the lowest-MAPE method per period; you can override per-cell.

For OpEx accounts (R&D Salaries, SG&A Marketing, etc.), use **method = Linear** — they don't have strong seasonality, and Linear is more robust on short series.

Time: ~3 min runtime per account × 9 accounts × 4 entities ≈ ~30 min wall-clock (engine is async; tab can stay open).

---

## Step 2. Layer in driver-based overlays (~45 min)

**Screen:** `/forecast` → Driver Overlay panel

For each major account where business drivers move faster than history:

### 2a. iPhone — driven by units × ASP

1. Open the iPhone (`4110`) forecast.
2. Add a driver: "iPhone Units" (`9200` — a stat account) × "iPhone ASP" (`9210` — another stat).
3. Set unit forecast per quarter:
   - Q3 2026: 45M units (post-launch quarter, iPhone 18 launches Sep)
   - Q4 2026: 75M units (holiday + new iPhone halo)
   - Q1 2027: 55M units
4. Set ASP: $850 baseline, +2% for new model premium starting Q4 2026.
5. Click "Apply overlay". The driver-derived number replaces the statistical baseline for those months. The engine logs both values (baseline vs overlay) for variance analysis.

### 2b. R&D Salaries — driven by headcount plan

1. Open R&D Salaries (`6110`) forecast.
2. Add driver: "R&D Headcount" (`9100` filtered to R&D) × "Avg R&D Comp" ($350K loaded comp).
3. Pull the headcount plan from `/workforce/positions` — engine reads forward-projected positions.
4. Click "Apply overlay".

### 2c. Marketing — driven by % of revenue

1. Open Marketing & Advertising (`6230`) forecast.
2. Add driver: "% of Net Sales". Set to 5% (Apple's roughly steady ratio).
3. Engine multiplies forecasted Total Net Sales (`4000`) by 5% per period.

Time: ~10 min per overlay × ~5 overlays ≈ 45 min total.

---

## Step 3. Sales overlay — top-down from BU heads (~30 min)

Sales VPs in each region typically have a number they're "going to commit". Capture it here.

**Screen:** `/data/input` → Form "Sales Forecast Override"

1. Switch scenario to Forecast.
2. Each BU lead pastes (or you enter on their behalf) their committed number for the next 4 quarters by product.
3. Save. Origin = Form. Engine treats this as a manual override over the baseline + driver-derived numbers.

The Lineage Drawer will show all three layers for any cell:
- v1 — statistical baseline (origin=Forecast)
- v2 — driver overlay (origin=Calc)
- v3 — sales commit (origin=Form, current)

If sales commit is materially different from the model output, that's the conversation to have at the forecast review.

Time: 30 min (mostly waiting on BU leads).

---

## Step 4. Run consolidation on Forecast (~10 min)

**Screen:** `/process/consolidation`

1. POV: Forecast / AAPL_GROUP / 2026Q3.
2. Click Run Consolidation.
3. Repeat for 2026Q4, 2027Q1, 2027Q2.

Engine sums sub-entities into AAPL_GROUP under the Forecast scenario, applies ownership + FX.

Time: ~3 min per quarter × 4 = 10 min total.

---

## Step 5. Review forecast pack (~30 min)

**Screen:** `/reports/income-statement`

1. POV: Forecast / AAPL_GROUP / FY2026 + FY2027.
2. Compare against:
   - Actual (where available — through May 2026)
   - Budget (the static plan from start of year)
   - Prior Forecast (last month's refresh — stored as scenario "Forecast v -1" if Snapshot was taken)
3. Note material moves vs Prior Forecast:
   - Any line moved > 5% or > $200M = explain in narrative
4. `/analytics` → Run "Forecast Movement" chart (waterfall of changes since prior forecast).

Time: 30 min.

---

## Step 6. Generate forecast story (~10 min)

**Screen:** `/explore` → Storytelling panel

1. POV: Forecast / AAPL_GROUP / next 12 months.
2. Click "Generate forecast narrative".
3. AI produces 3 paragraphs:
   - Revenue outlook (top drivers up/down)
   - Margin outlook
   - Cash + capital allocation outlook
4. Edit if needed. Snapshot the dashboard.

Time: 10 min.

---

## Step 7. Lock the Forecast scenario as "Forecast v <N>" (~5 min)

**Screen:** `/jobs/library`

1. Run "Copy Forecast → Forecast v <N>" job.
2. This creates a frozen versioned copy you can compare against next month.
3. CFO Pilot maintains a rolling 12 of these (older ones auto-archived).

Time: 5 min.

---

## Total time budget

Phase | Time
---|---
1. Statistical baseline | 30 min
2. Driver overlays | 45 min
3. Sales commit overlays | 30 min
4. Consolidate Forecast | 10 min
5. Review + variance | 30 min
6. Generate narrative | 10 min
7. Lock as versioned scenario | 5 min
**Total** | **~2.5 hours**

Reduce by parallelizing Step 3 (sales) with Steps 1-2 (you don't need their numbers until Step 4).

---

## When forecast diverges from reality

If the next month's actuals come in materially different from this forecast, that's a signal — not necessarily an error. Use the variance to learn:

1. `/forecast` → "Backtest" tab → engine logs MAPE per (method, account) per period.
2. If Holt-Winters is consistently better than the ensemble pick, the ensemble weights need re-tuning. File a finding for the AI team.
3. If sales commit is wildly off (over- or under-shooting), it's a BU calibration issue — feedback loop into the next forecast cycle.

---

## Apple-specific notes

| Account | Watch-outs |
|---|---|
| iPhone (`4110`) | Huge launch-quarter spike (Q4 cal Y). Holt-Winters handles this well; don't override unless launch timing slipped. |
| Services (`4200`) | Smooth growth curve. Use Prophet for the long-horizon view — best at growth trajectories. |
| China (`AAPL_CN`) | FX (CNY) and policy risk dominate. Run a separate sensitivity (Step 8 below). |
| R&D | Driven by headcount, not history. Use overlay method. |
| Stock comp | Highly correlated with hiring + stock price. Use the Workforce Comp Builder, not statistical forecast. |

### Step 8 (China sensitivity): optional ±10% CNY move

**Screen:** `/analyze`

1. Build pivot: Entity=AAPL_CN, Account=Net Sales, scenario=Forecast.
2. Use "What-if" → "Apply FX shift" → -10% CNY.
3. Compare against base case. Note USD revenue impact.
4. Save view as "CN FX -10% sensitivity".

This is what you put in the appendix of the forecast review pack.

End — FORECAST-REFRESH-RUNBOOK.md
