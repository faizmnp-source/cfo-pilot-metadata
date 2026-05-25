# Monthly Close Runbook — Apple Inc

**Tenant:** Apple Inc · `admin@apple.com`
**Cadence:** every calendar-month close, kicked off at T-2 (two business days before month-end).
**Period being closed:** the calendar month that just ended. Examples below use **May 2026 (`2026M05`)**.
**Estimated wall-clock:** ~3.5 hours of active work spread over 7 business days (T-2 → T+5).

The CFO Pilot Close Manager (`/close`) is the source of truth — every step below corresponds to a task on the May 2026 close. The runbook simply tells you what to do at each task.

---

## Day -2 (Friday before close): Pre-close preparation

Goal: have everything tied out before month-end so the actual close runs fast.

### 1. Bank reconciliation — all entities

**Screen:** `/process/reconciliation`

For each of AAPL_US, AAPL_EU, AAPL_CN, AAPL_APAC:

1. Click the entity card → "Bank Reconciliation".
2. Upload (or paste) the bank statement for the period. CFO Pilot matches against Cash & Cash Equivalents (account `1110`) GL movements.
3. Resolve reconciling items: outstanding checks, in-transit deposits, bank charges. Each becomes a small JE.
4. Click "Mark Reconciled". The close task auto-completes.

Time: ~30 min total across 4 entities.

### 2. Subledger tie-out (AR, AP, Inventory)

**Screen:** `/process/reconciliation`

1. AR (account `1130`): pull the AR aging from your operational system. Total should equal GL AR within ±0.5%. If not, investigate the difference (usually a missing JE for credit memos).
2. AP (account `2110`): same as above against vendor open balances.
3. Inventory (account `1140`): use the cycle-count snapshot or the perpetual inventory system. Flag any variance > 1% to Operations.
4. For each, click "Reconciled — within tolerance" or "Variance — pending investigation".

Time: ~45 min.

---

## Day -1 (Sunday): Standing journals

Goal: post all known recurring JEs before T-0 so the consolidation engine has clean data to work with.

### 3. Post depreciation & amortization JEs

**Screen:** `/data/input` → Form "Monthly Depreciation"

1. Open the form. It auto-loads PP&E (`1220`) and accumulated depreciation by entity.
2. The seed depreciation schedule comes from the Workforce + Asset module. Click "Apply suggested" to accept the AI-suggested monthly D&A by entity.
3. Save. Origin = Form.

Time: ~10 min.

### 4. Accrue 15% bonus on R&D salaries

**Screen:** `/calc/rules` → "Accrue 15% Bonus on R&D Salaries"

1. Click the rule → Run.
2. Engine reads R&D Salaries (`6110`) for the month and writes 15% to Accrued Expenses (`2120`) with origin = Calc.
3. Inspect via the lineage drawer on Accrued Expenses to verify the source line.

Time: ~5 min.

---

## Day 0 (Monday — month-end + 1 business day): The close kicks off

Goal: lock-down operational data, post intercompany, prep for translation.

### 5. Intercompany matching

**Screen:** `/process/elimination`

CFO Pilot's IC engine matches pairs by ICP member. For Apple, the pairs are typically:

- AAPL_US ↔ AAPL_EU (license fees, royalties)
- AAPL_US ↔ AAPL_CN (cost-plus manufacturing transfers)
- AAPL_EU ↔ AAPL_APAC (regional support services)

1. Click "Match candidates" — engine lists pairs sorted by mismatch amount.
2. For each pair with |mismatch| < $1M: click "Auto-eliminate" — engine posts the elimination JE.
3. For pairs with bigger mismatches: open the drill panel, identify whether it's a timing diff (wait one period) or a missing entry (post correcting JE). Use the lineage drawer to follow the entry chain.

Time: ~45 min.

---

## Day +1 (Tuesday): FX rates + translation

### 6. Upload monthly FX rates

**Screen:** `/data/load` → FX Rates tab

1. Download last month's rate file as a starting template.
2. Update each (foreign ccy, USD, period, rateType) row:
   - CLOSING rate = month-end spot
   - AVERAGE rate = monthly average (use Bloomberg, Reuters, or your treasury system)
3. Upload. The engine validates ISO codes and replaces any prior rate for the same key (audit-logged).

Apple covers EUR, CNY, JPY, INR, GBP. INR (for the small India office) and GBP (UK) round out the set.

Time: ~10 min.

### 7. Post FX revaluation entries

**Screen:** `/process/translation`

1. Pick scenario = Actual, period = 2026M05.
2. Run for each non-USD entity (AAPL_EU, AAPL_CN, AAPL_APAC).
3. Engine:
   - P&L accounts (REVENUE/EXPENSE) → AVERAGE rate
   - BS accounts (ASSET/LIABILITY) → CLOSING rate
   - Equity → HISTORICAL rate (frozen at year of capital contribution)
   - Plug to CTA (Cumulative Translation Adjustment) under Accumulated Other Comprehensive Income (`3300`)
4. Status moves QUEUED → RUNNING → SUCCEEDED. Inspect summary.

Time: ~15 min (mostly waiting on the engine).

---

## Day +2 (Wednesday): Consolidation + variance

### 8. Run consolidation engine

**Screen:** `/process/consolidation`

1. POV: Actual / AAPL_GROUP / 2026M05.
2. Click "Run Consolidation".
3. Engine:
   - Reads all sub-entity facts at Reporting (USD) view
   - Applies ownership % (from `EntityOwnership` table, currently 100% for all subs)
   - Sums into AAPL_GROUP
   - Applies the IC eliminations
4. Output: AAPL_GROUP facts with origin = Consol, processRunId stamped.

Time: ~5 min runtime.

### 9. Review Group P&L variance vs Budget

**Screen:** `/reports/income-statement`

1. Toggle to Actual vs Budget side-by-side.
2. For any line with |variance| > 5% or > $50M:
   - Click ⓘ to drill into top contributing entities.
   - Open the lineage chain to identify which specific transactions drive the variance.
   - Note the explanation (CFO Pilot lets you attach a LineageNote to the value).

Time: ~30 min.

---

## Day +3 (Thursday): Story + close package

### 10. Generate exec dashboard story

**Screen:** `/explore`

1. POV: AAPL_GROUP / 2026M05 Actual.
2. The Storytelling panel auto-generates 3 paragraphs from the consolidated numbers:
   - Revenue narrative (top movers vs prior period + budget)
   - Margin narrative (gross margin, opex leverage)
   - Cash narrative (operating cash, free cash flow)
3. Edit any paragraph the AI got wrong (one-click).
4. Click "Snapshot" — saves the dashboard as a versioned report.

Time: ~20 min.

---

## Day +4 (Friday): CFO sign-off

### 11. Sign-off CFO review meeting

**Pre-meeting prep (you):**
- Pull the Snapshot from Day +3
- Pull the Variance Review form (`/data/forms` → "Variance Review")
- Pull the elimination summary

**In the meeting:**
- Walk through P&L variances (top 5)
- Walk through BS movements (working capital, debt, equity)
- Walk through cash flow drivers
- Identify any reclassifications or corrections needed

**Post-meeting:**
- Post any approved adjusting JEs in `/data/input`
- Re-run consolidation if material adjustments were made
- Mark task DONE in `/close`

Time: 1 hr meeting + ~30 min for follow-ups.

---

## Day +5 (Monday): Lock

### 12. Lock period & open next month

**Screen:** `/close` → "Lock period" task

1. Click "Lock 2026M05".
2. Confirm dialog: this prevents any new fact writes for this period without an Admin unlock.
3. CFO Pilot:
   - Flips CloseRun status to LOCKED
   - Sets `is_frozen=true` on the (scenario, period) combo
   - Auto-creates the next CloseRun for 2026M06 with the same 12-task template
4. Email/Slack notification fires (if connector configured) to "Period 2026M05 locked".

Time: ~2 min.

---

## What to do if something breaks mid-close

| Problem | Where to look | Recovery |
|---|---|---|
| Consolidation engine fails | `/process/consolidation` → Run history → click failed run for error | Re-run with same params after fixing root cause. Idempotent. |
| FX translation gives wrong number | `/process/translation` → expand FX rate used → verify rate type matches account.time_balance | Re-upload corrected rate, re-run translation |
| Variance looks wrong | Drill via ⓘ on the line → check each contributor's prior version chain | If a fact is wrong, edit via `/data/input` form, save (creates new version) |
| Wrong number got locked | `/close` → admin role → "Unlock period" with reason | Re-do affected steps, lock again |

---

## Reference: the 12 close tasks (from seed)

| Day | Category | Task | Screen |
|---|---|---|---|
| T-2 | RECONCILIATION | Bank reconciliation — all entities | /process/reconciliation |
| T-2 | RECONCILIATION | Subledger tie-out (AR, AP, Inventory) | /process/reconciliation |
| T-1 | JOURNAL_ENTRIES | Post depreciation & amortization JEs | /data/input |
| T-1 | JOURNAL_ENTRIES | Accrue 15% bonus on R&D salaries | /calc/rules |
| T+0 | RECONCILIATION | Intercompany matching (US ↔ EU ↔ CN) | /process/elimination |
| T+1 | JOURNAL_ENTRIES | Post FX revaluation entries | /process/translation |
| T+1 | REVIEW | Upload monthly FX rates | /data/load |
| T+2 | REVIEW | Run consolidation engine | /process/consolidation |
| T+2 | REVIEW | Review Group P&L variance vs Budget | /reports/income-statement |
| T+3 | REVIEW | Generate exec dashboard story | /explore |
| T+4 | REVIEW | Sign-off CFO review meeting | /close |
| T+5 | LOCK | Lock period & open next month | /close |

---

## Audit trail

Every action above writes to one of:
- `process_runs` (consolidation, translation, elimination, calc, allocation)
- `fact_rows` with versioning (every value change creates a new row, prior `isCurrent=false`)
- `close_tasks` (status changes timestamped)
- `audit_logs` (high-level events: lock, unlock, user logins)

Any auditor can trace a final number on the IS → through consolidation run → back through translation run → back to the raw imported fact → back to the load batch + source filename. Run `/audit` to see this in action.

End — MONTHLY-CLOSE-RUNBOOK.md
