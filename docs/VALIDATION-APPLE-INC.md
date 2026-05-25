# Apple Inc — End-to-End CFO Pilot Validation

**Tenant:** Apple Inc · slug `apple-inc` · login `admin@apple.com` / `admin123`
**Built with:** `npm run seed:apple` (idempotent — re-run any time)
**Purpose:** prove every shipped module works against a realistic dataset.

This is the smoke test you run after every promotion (dev→master) to make sure nothing rotted. Hit it once now to validate Wk1–Wk3 work; hit it again whenever something feels broken to confirm.

---

## 0. Pre-flight (one-time)

1. Make sure your local `.env.local` has a `DATABASE_URL` pointing at the **dev** Neon branch (not prod).
   - To verify: `vercel env pull .env.local --environment=preview --git-branch=dev --token=$VERCEL_TOKEN`
2. Run the seed:
   ```bash
   cd cfo-pilot-metadata
   npm run seed:apple
   ```
3. Expected output: ~80 dimension members, ~25K–60K fact rows, FX rates, 2 forms, 15 mapping rules, 1 calc rule, 1 automation job, 1 open close run for `2026M05`.
4. Vercel preview URL (dev branch): https://metadata-module-git-dev-faizmnp-sources-projects.vercel.app

---

## 1. Login & Settings (Section 1 — Tenant setup)

| Step | What to do | Expected |
|---|---|---|
| 1.1 | Go to `/login`, sign in as `admin@apple.com` / `admin123` | Lands on `/explore` |
| 1.2 | Sidebar header shows "Apple Inc" | Tenant name resolved |
| 1.3 | Open `/settings` | Base currency = USD, fiscal year = calendar, features show multi-entity + multi-currency + intercompany ALL enabled |
| 1.4 | Open `/settings/features` | UD1=Product, UD2=Channel are enabled and named |

**PASS criteria:** Tenant name shows correctly. Settings reflect the seed.

---

## 2. Metadata (Section 2 — Dimensions)

| Step | What to do | Expected |
|---|---|---|
| 2.1 | Sidebar → Metadata → Dimensions | 9 dims listed (Account, Entity, Scenario, Time, Currency, ICP, Origin, Product, Channel) |
| 2.2 | Click Account → tree view | 60+ accounts, hierarchy correct (Total Net Sales → Products → iPhone/Mac/iPad/Wearables) |
| 2.3 | Click Entity → tree view | AAPL_GROUP root with 4 children (US, EU, CN, APAC) |
| 2.4 | Click Time → tree view | FY2025 + FY2026 each with 4 quarters and 12 months |
| 2.5 | Click Currency | 6 real ccys + Local + Reporting |

**PASS criteria:** Every dim resolves, hierarchies expand, no console errors.

---

## 3. Smart Mapping (Section 3 — Phase 2)

| Step | What to do | Expected |
|---|---|---|
| 3.1 | Sidebar → Data Load → Mapping | List of 15 rules (Phone Sales → iPhone, MacBook Pro → Mac, etc.) |
| 3.2 | In the Suggest panel, type "Phone Sales" | Returns suggestion "iPhone" with high confidence (≥80) |
| 3.3 | Type something new like "iPhone 17 Pro Max" | Suggestion engine ranks "iPhone" (4110) at top via token similarity |
| 3.4 | Approve a fresh suggestion | New MappingRule row appears in the list, hit count starts at 1 |

**PASS criteria:** Engine returns ranked suggestions. Approve flow creates a rule.

---

## 4. Data Load (Section 4)

| Step | What to do | Expected |
|---|---|---|
| 4.1 | Sidebar → Data → Load | Upload UI visible, last batch listed |
| 4.2 | Download the Excel facts template | XLSX downloads with header row matching intersection columns |
| 4.3 | Upload `Q1 2026 Actuals.xlsx` (any small file with 5 rows) | LoadBatch created, success toast, rows committed count matches |
| 4.4 | Sidebar → Data → Forms → "Monthly P&L Input" | Grid loads with Apr/May/Jun 2026 columns and all leaf P&L accounts |

**PASS criteria:** File import creates a LoadBatch and fact rows. Form grid renders.

---

## 5. Forms & Input (Section 5)

| Step | What to do | Expected |
|---|---|---|
| 5.1 | Open form "Monthly P&L Input" | Loads with current POV (Actual / AAPL_US / 2026Q2) |
| 5.2 | Type a value into iPhone × Apr 2026 cell | Cell highlights as dirty |
| 5.3 | Click Save | New fact row written with `origin=Form`, prior row's `isCurrent=false`, version bumps to v2 |
| 5.4 | Click the ⓘ icon on the cell | Lineage drawer opens showing both versions (v1 Import, v2 Form) |
| 5.5 | Open form "Variance Review" | Loads with Actual vs Budget columns + Δ% computed |

**PASS criteria:** Save creates fact + audit version. Lineage drawer shows full chain.

---

## 6. Ad Hoc Analysis (Section 8 — Wk3 W3.1)

| Step | What to do | Expected |
|---|---|---|
| 6.1 | Sidebar → Analyze | Pivot UI loads, default Account × Time |
| 6.2 | Set POV: Actual / AAPL_GROUP / 2026Q1, rows=Entity, cols=Account leaf | Returns grid with 4 entities × leaf revenues |
| 6.3 | Save view as "Q1 Rev by Entity" | View persists, appears in saved list |
| 6.4 | Click Share → toggle isShared → copy permalink → open in new tab | Same grid loads via `?view=<id>` |

**PASS criteria:** Pivot resolves both ways, save+share works.

---

## 7. Visual Analytics + Commentary (Section 12, 13 — Wk3 W3.3/W3.4)

| Step | What to do | Expected |
|---|---|---|
| 7.1 | Sidebar → Analytics | 4 cards: revenue waterfall, account heatmap, treemap, scatter |
| 7.2 | Click "Generate commentary" on the waterfall | AI returns 2–3 sentences explaining the biggest movers |
| 7.3 | Hover a treemap rectangle | Tooltip shows entity name + amount |

**PASS criteria:** All 4 charts render with real data. Commentary endpoint responds.

---

## 8. Reports (Section 11 — financial statements)

| Step | What to do | Expected |
|---|---|---|
| 8.1 | Sidebar → Reports → Income Statement | Shows Apple-style P&L: Net Sales (Products + Services), COGS, Gross Profit, OpEx (R&D + SG&A), Operating Income, Provision for Tax, Net Income |
| 8.2 | Toggle POV to Actual vs Budget side-by-side | Both columns populate, variance arrow shows on each line |
| 8.3 | Click ⓘ on any line | Drill drawer opens showing top contributing entities + fact-row trail |
| 8.4 | Reports → Balance Sheet | Total Assets = Liabilities + Equity (within rounding) |
| 8.5 | Reports → Cash Flow | Operating / Investing / Financing sections populate |
| 8.6 | Reports → Trial Balance | All accounts listed, debits = credits |

**PASS criteria:** Four reports load with real numbers. BS balances. Drill works.

---

## 9. Consolidation + FX Translation (Section 6 — Process)

| Step | What to do | Expected |
|---|---|---|
| 9.1 | Sidebar → Process → Consolidation | Launcher card shows last 5 runs |
| 9.2 | Pick POV: Actual / AAPL_GROUP / 2026Q1, click Run | ProcessRun created with `kind=CONSOLIDATION`, status moves QUEUED→RUNNING→SUCCEEDED |
| 9.3 | After success, open IS for AAPL_GROUP | Numbers now reflect sum-of-subsidiaries (with FX into USD) |
| 9.4 | Open lineage drawer on any consolidated line | Shows `processRunId` link back to the run that wrote it |
| 9.5 | Sidebar → Process → Translation, run for AAPL_EU 2026Q1 | EUR facts translated to USD reporting using AVERAGE rate for P&L, CLOSING for BS |

**PASS criteria:** Consol writes new facts with proper lineage. FX uses correct rate types.

---

## 10. Intercompany Elimination (Section 7)

| Step | What to do | Expected |
|---|---|---|
| 10.1 | Sidebar → Process → Elimination | Lists eligible IC pairs |
| 10.2 | Run elimination for AAPL_GROUP 2026Q1 | Matching ICP pairs cancel, residual reported as Eliminations |
| 10.3 | Open elimination summary report | Per-pair table: source value, ICP value, residual |

**PASS criteria:** Elimination produces auditable per-pair lines.

---

## 11. Forecasting (Section 15 — Phase 4)

| Step | What to do | Expected |
|---|---|---|
| 11.1 | Sidebar → Forecast | Pick account = "iPhone (4110)", entity = AAPL_US, horizon = 6 months |
| 11.2 | Click "Run Forecast" | Returns ensemble forecast (Holt-Winters + Linear + ARIMA via Modal) |
| 11.3 | Inspect MAPE chart | Shows error of each method on training window |
| 11.4 | Click "Save as Forecast scenario" | New facts written under scenario=Forecast, origin=Forecast, for next 6 months |
| 11.5 | Re-open IS for Forecast scenario | Apr–Sep 2026 populated |

**PASS criteria:** Forecast ensemble runs + writes facts under correct scenario.

---

## 12. Workforce (Section 4.3 — Phase 4.3)

| Step | What to do | Expected |
|---|---|---|
| 12.1 | Sidebar → Workforce → Positions | Lists positions (seed: ~5 sample) |
| 12.2 | Add an attrition assumption (5% annual) | Forward-projected headcount drops |
| 12.3 | Add a promotion assumption (10% promo cycle Apr) | Cost line in R&D Salaries adjusts upward |
| 12.4 | Click "Push to Comp Builder" | Total Comp recalculated, fact rows written under Calc origin |

**PASS criteria:** What-if assumptions flow into fact rows.

---

## 13. Allocations (Section 19 — Wk3 W3.8)

| Step | What to do | Expected |
|---|---|---|
| 13.1 | Sidebar → Allocations → Library | 8 patterns visible (Revenue, Headcount, Cost, Shared-Services, Occupancy, IT, HR, Marketing) |
| 13.2 | Click "Run Headcount allocation" | Reads driver fact (Headcount), spreads source amount proportionally, writes target facts with origin=Calc |
| 13.3 | Open lineage drawer on any allocated value | Shows `calcRunId` linking back to the rule run |

**PASS criteria:** Allocation engine writes auditable target facts.

---

## 14. Jobs Library + Calc Rules (Section 18, 17)

| Step | What to do | Expected |
|---|---|---|
| 14.1 | Sidebar → Jobs → Library | 7 Copy/Clear cards |
| 14.2 | Run "Copy Actual → Budget" for FY2026 | Facts cloned with origin=Copy, transform applied (e.g., +5%) |
| 14.3 | Sidebar → Calc → Rules → "Accrue 15% Bonus on R&D Salaries" → Run | New CalcRuleRun, facts written to Accrued Expenses |
| 14.4 | Open lineage on the accrued value | Shows the calc run + the source R&D salary line |

**PASS criteria:** Copy + Clear + CalcRule all execute and audit-log correctly.

---

## 15. Close Management (Section 16 — Phase 3)

| Step | What to do | Expected |
|---|---|---|
| 15.1 | Sidebar → Close | Open close for 2026M05 shows 12 tasks T-2 → T+5 |
| 15.2 | Click "Bank reconciliation" task → "Go to screen" pill | Lands on `/process/reconciliation` |
| 15.3 | Mark task DONE | Status updates, progress bar advances |
| 15.4 | Click "Run consolidation engine" task | Lands on /process/consolidation pre-filtered to the close period |
| 15.5 | Click "Lock period" task | Period flips to LOCKED, future writes for 2026M05 blocked |

**PASS criteria:** Tasks deep-link, status updates, lock blocks writes.

---

## 16. Automation (Section 22 — Wk3 W3.10)

| Step | What to do | Expected |
|---|---|---|
| 16.1 | Sidebar → Automation → Library | "Monthly Consolidation (T+3)" job listed |
| 16.2 | Click Run Now | New JobRun row, status moves through QUEUED→RUNNING→SUCCEEDED |
| 16.3 | Sidebar → Automation → Monitor | Board shows the run with retry button |
| 16.4 | Inject a transient failure (e.g., set bad params), Run again, Retry from the monitor | Retry increments `retryCount`, eventually succeeds |

**PASS criteria:** Scheduled job runs, monitor + retry work.

---

## 17. Ownership / Consolidation Method (Section 21 — Wk3 W3.9, W3.13)

| Step | What to do | Expected |
|---|---|---|
| 17.1 | Sidebar → Consolidation → Ownership | 4 edges shown, each AAPL_GROUP → sub at 100% FULL |
| 17.2 | Edit AAPL_CN edge to pctOwned = 75, method = PROPORTIONAL | Indirect matrix recomputes |
| 17.3 | Re-run consolidation | AAPL_CN contribution to AAPL_GROUP now scaled to 75% |

**PASS criteria:** Ownership edits flow into consolidation outputs.

---

## 18. Audit & Lineage (Section 10 — Phase 1)

| Step | What to do | Expected |
|---|---|---|
| 18.1 | Sidebar → Audit | Recent-activity feed shows last 20 fact writes (load, calc, consol, manual) |
| 18.2 | Filter by user = admin@apple.com | Only manual edits show |
| 18.3 | Click any row → opens lineage drawer with full version chain |

**PASS criteria:** Every fact write is auditable, every value drillable.

---

## 19. Discoverability + Personalisation (Sections 14, 16)

| Step | What to do | Expected |
|---|---|---|
| 19.1 | Cmd-K (Mac) or Ctrl-K (Win) → type "iphone" | Suggestions: account 4110, mapping rules, recent forms |
| 19.2 | Star a result (☆ → ★) | Persists in Cmd-K Favourites |
| 19.3 | Open `/explore` → drag a KPI card → reorder | Layout persists in UserPreference |

**PASS criteria:** Cmd-K returns ranked results. Favourites + dashboard reorder persist.

---

## 20. Executive Storytelling (Section 5)

| Step | What to do | Expected |
|---|---|---|
| 20.1 | Open `/explore` for AAPL_GROUP 2026Q1 Actual | Story panel renders 3 paragraphs: revenue narrative, margin narrative, cash narrative |
| 20.2 | Click "Generate Risk Tile" | Lists top 3 risks with severity badges |
| 20.3 | Click "Recommended Actions" | Lists 3 prioritized next steps |

**PASS criteria:** Storytelling produces coherent prose grounded in actual numbers.

---

## 21. Copilot Actions (Phase 6)

| Step | What to do | Expected |
|---|---|---|
| 21.1 | Open Copilot chat | "Lock the May 2026 period" |
| 21.2 | Copilot proposes a CopilotAction `LOCK_PERIOD` with status PENDING_APPROVAL | Shows confirm/reject UI |
| 21.3 | Approve | Status → APPROVED → EXECUTED, period locked |
| 21.4 | Try a destructive action ("Delete all forecast facts") | Copilot refuses without explicit confirmation + admin role |

**PASS criteria:** Write actions are gated by human approval.

---

## Done — what "PASS" looks like

If all 21 sections check out:
- The whole stack (metadata → input → process → calc → forecast → close → reports → copilot) is alive and self-consistent on a realistic dataset.
- You can confidently promote dev → master and run your real-world flows.

**Quick re-run:** anytime, just `npm run seed:apple` to reset. Idempotent. Won't break user data because the tenant is isolated (`apple-inc-tenant-0001`).

---

## What to do if a section fails

1. Open the browser console + Network tab — most fails are 500s on a route.
2. Check `vercel logs metadata-module --token=$VERCEL_TOKEN` for the dev deployment.
3. Cross-reference against `docs/TECHNICAL-ARCHITECTURE.md` to see which module owns the broken endpoint.
4. File a finding in `docs/STATUS-VALIDATION-<date>.md` with: section #, what broke, screenshot, suspected fix.

See also:
- [`MONTHLY-CLOSE-RUNBOOK.md`](./MONTHLY-CLOSE-RUNBOOK.md) — how to do the May 2026 close end-to-end
- [`FORECAST-REFRESH-RUNBOOK.md`](./FORECAST-REFRESH-RUNBOOK.md) — how to refresh the rolling 12-month forecast
- [`TECHNICAL-ARCHITECTURE.md`](./TECHNICAL-ARCHITECTURE.md) — what each module owns
- [`DEPLOYMENT-PLAN.md`](./DEPLOYMENT-PLAN.md) — promotion runbook

End — VALIDATION-APPLE-INC.md
