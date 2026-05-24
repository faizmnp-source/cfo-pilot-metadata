// Default 5-day Close Playbook.
// Seeds the 11 standard tasks of a typical month-end close:
//   T-2 → T+5  (pre-close → final lock)
// Derived from finance:close-management skill — the canonical short playbook
// most mid-market finance teams run. Tenants can add custom tasks later.

export type DefaultCloseTask = {
  dayOffset: number;             // -2..+5
  category: string;              // RECONCILIATION | JOURNAL_ENTRIES | CONSOLIDATION | REVIEW | LOCK
  title: string;
  description: string;
  autoStatusOrigin?: string;     // If any FactRow with this origin posts to the period, auto-mark DONE
  sortOrder: number;
};

export const DEFAULT_CLOSE_PLAYBOOK: DefaultCloseTask[] = [
  // T-2 ─ Pre-close ─────────────────────────────────────────────────────
  {
    dayOffset: -2,
    category: "RECONCILIATION",
    title: "Notify business units of cut-off",
    description: "Send the calendar to all BU controllers. Last day to load actuals = T-1 5pm.",
    sortOrder: 10,
  },
  // T-1 ─ Cut-off ───────────────────────────────────────────────────────
  {
    dayOffset: -1,
    category: "RECONCILIATION",
    title: "Bank reconciliations (all GL cash accounts)",
    description: "Match GL cash balance to bank statement for every entity. Flag reconciling items > materiality.",
    sortOrder: 20,
  },
  {
    dayOffset: -1,
    category: "RECONCILIATION",
    title: "Accounts Payable cut-off",
    description: "Close AP for the period. Any invoice dated ≤ period-end goes in; later → next period.",
    sortOrder: 30,
  },
  // T ─ Close day ────────────────────────────────────────────────────────
  {
    dayOffset: 0,
    category: "JOURNAL_ENTRIES",
    title: "Post AR / AP / payroll accruals",
    description: "Standard month-end accruals: unbilled revenue, unpaid expenses, payroll for partial-period.",
    sortOrder: 40,
  },
  {
    dayOffset: 0,
    category: "JOURNAL_ENTRIES",
    title: "Lock prior-period subledgers",
    description: "Set GL period to LOCKED. No more postings to the closed period without admin override.",
    autoStatusOrigin: "Import",
    sortOrder: 50,
  },
  // T+1 ─ Consolidation ────────────────────────────────────────────────
  {
    dayOffset: 1,
    category: "CONSOLIDATION",
    title: "Run FX translation + currency consolidation",
    description: "Translate local-currency facts to reporting currency. Use month-end rates for B/S, average for P/L.",
    autoStatusOrigin: "Translation",
    sortOrder: 60,
  },
  {
    dayOffset: 1,
    category: "CONSOLIDATION",
    title: "Run intercompany eliminations",
    description: "Match bilateral IC pairs (A→B and B→A). Eliminate at the parent. Flag mismatches > $5k.",
    autoStatusOrigin: "Elimination",
    sortOrder: 70,
  },
  // T+2 ─ Analysis ─────────────────────────────────────────────────────
  {
    dayOffset: 2,
    category: "REVIEW",
    title: "Generate trial balance",
    description: "Pull TB at parent + each leaf. Confirm zero out-of-balance after consol.",
    sortOrder: 80,
  },
  {
    dayOffset: 2,
    category: "REVIEW",
    title: "Variance analysis (Actual vs Budget vs Prior)",
    description: "Run variance reports. Flag every line > 10% / > $50k delta for narrative.",
    sortOrder: 90,
  },
  // T+3 ─ Review ───────────────────────────────────────────────────────
  {
    dayOffset: 3,
    category: "REVIEW",
    title: "Management review meeting",
    description: "CFO + controllers walk the P&L, B/S, KPI deck. Capture sign-off in notes below.",
    sortOrder: 100,
  },
  // T+5 ─ Final lock ───────────────────────────────────────────────────
  {
    dayOffset: 5,
    category: "LOCK",
    title: "Lock the close — distribute board pack",
    description: "Mark CloseRun LOCKED. Distribute final P&L + B/S + CF + variance commentary to board.",
    sortOrder: 110,
  },
];

/**
 * The CloseTask categories — used by the UI to group / filter.
 * Keep this list in sync with the `category` values above.
 */
export const CLOSE_CATEGORIES = [
  "RECONCILIATION",
  "JOURNAL_ENTRIES",
  "CONSOLIDATION",
  "REVIEW",
  "LOCK",
] as const;

export const CLOSE_CATEGORY_LABELS: Record<string, string> = {
  RECONCILIATION:  "Reconciliation",
  JOURNAL_ENTRIES: "Journal Entries",
  CONSOLIDATION:   "Consolidation",
  REVIEW:          "Review",
  LOCK:            "Lock",
};

export const CLOSE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "SKIPPED",
] as const;
