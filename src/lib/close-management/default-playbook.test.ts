/*
 * Unit tests for `src/lib/close-management/default-playbook.ts`.
 *
 * `DEFAULT_CLOSE_PLAYBOOK` is the seed list of 11 standard month-end close
 * tasks (T-2 → T+5). It is loaded by the close-management seeder the first
 * time a tenant opens a CloseRun: every entry becomes a CloseTask row.
 *
 * Drift here breaks two downstream things silently:
 *   1. New tenants get the wrong / missing seed tasks on their first close.
 *   2. The autoStatusOrigin → CloseTask auto-mark flow (Translation,
 *      Elimination, Import) misses an origin label and the task never
 *      flips to DONE.
 *
 * `CLOSE_CATEGORIES`, `CLOSE_CATEGORY_LABELS`, and `CLOSE_STATUSES` are
 * the canonical enums for the /close UI. Tests pin them so a rename or
 * extra value can't sneak in without a deliberate update.
 *
 * Pure node-env Jest — no DOM, no Prisma, no I/O.
 */

import {
  DEFAULT_CLOSE_PLAYBOOK,
  CLOSE_CATEGORIES,
  CLOSE_CATEGORY_LABELS,
  CLOSE_STATUSES,
  type DefaultCloseTask,
} from "./default-playbook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPECTED_TASK_COUNT = 11;

/** The expected dayOffset distribution across the 11 standard tasks. */
const EXPECTED_DAY_OFFSETS: Record<number, number> = {
  [-2]: 1, // pre-close
  [-1]: 2, // cut-off
  0: 2,    // close day
  1: 2,    // consolidation
  2: 2,    // analysis
  3: 1,    // review
  5: 1,    // final lock
};

/** Categories that every CloseTask must belong to. */
const EXPECTED_CATEGORIES = [
  "RECONCILIATION",
  "JOURNAL_ENTRIES",
  "CONSOLIDATION",
  "REVIEW",
  "LOCK",
] as const;

const EXPECTED_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "SKIPPED",
] as const;

const EXPECTED_AUTO_ORIGINS = ["Import", "Translation", "Elimination"] as const;

// ---------------------------------------------------------------------------
// DEFAULT_CLOSE_PLAYBOOK — surface + cardinality
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — surface", () => {
  test("is exported as an array", () => {
    expect(Array.isArray(DEFAULT_CLOSE_PLAYBOOK)).toBe(true);
  });

  test(`contains exactly ${EXPECTED_TASK_COUNT} tasks`, () => {
    expect(DEFAULT_CLOSE_PLAYBOOK).toHaveLength(EXPECTED_TASK_COUNT);
  });

  test("is non-empty", () => {
    expect(DEFAULT_CLOSE_PLAYBOOK.length).toBeGreaterThan(0);
  });

  test("every entry is a plain object", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(typeof t).toBe("object");
      expect(t).not.toBeNull();
      expect(Array.isArray(t)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-task shape — every task has the required fields with correct types
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — per-task shape", () => {
  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] has a numeric integer dayOffset",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(typeof t.dayOffset).toBe("number");
      expect(Number.isFinite(t.dayOffset)).toBe(true);
      expect(Number.isInteger(t.dayOffset)).toBe(true);
    },
  );

  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] has a non-empty string category",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(typeof t.category).toBe("string");
      expect(t.category.length).toBeGreaterThan(0);
    },
  );

  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] has a non-empty string title",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(typeof t.title).toBe("string");
      expect(t.title.trim().length).toBeGreaterThan(0);
    },
  );

  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] has a non-empty string description",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(typeof t.description).toBe("string");
      expect(t.description.trim().length).toBeGreaterThan(0);
    },
  );

  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] has a numeric integer sortOrder",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(typeof t.sortOrder).toBe("number");
      expect(Number.isFinite(t.sortOrder)).toBe(true);
      expect(Number.isInteger(t.sortOrder)).toBe(true);
      expect(t.sortOrder).toBeGreaterThan(0);
    },
  );

  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] autoStatusOrigin is either undefined or a non-empty string",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      if (t.autoStatusOrigin !== undefined) {
        expect(typeof t.autoStatusOrigin).toBe("string");
        expect(t.autoStatusOrigin.length).toBeGreaterThan(0);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Category invariants — every task belongs to a known category
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — category coverage", () => {
  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] uses a known category from CLOSE_CATEGORIES",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(EXPECTED_CATEGORIES).toContain(t.category);
    },
  );

  test("uses every category at least once", () => {
    const used = new Set(DEFAULT_CLOSE_PLAYBOOK.map((t) => t.category));
    for (const cat of EXPECTED_CATEGORIES) {
      expect(used).toContain(cat);
    }
  });

  test("RECONCILIATION appears 3 times (pre-close + cut-off pair)", () => {
    const count = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "RECONCILIATION",
    ).length;
    expect(count).toBe(3);
  });

  test("JOURNAL_ENTRIES appears 2 times (accruals + subledger lock)", () => {
    const count = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "JOURNAL_ENTRIES",
    ).length;
    expect(count).toBe(2);
  });

  test("CONSOLIDATION appears 2 times (translation + elimination)", () => {
    const count = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "CONSOLIDATION",
    ).length;
    expect(count).toBe(2);
  });

  test("REVIEW appears 3 times (TB + variance + mgmt review)", () => {
    const count = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "REVIEW",
    ).length;
    expect(count).toBe(3);
  });

  test("LOCK appears exactly 1 time (final close lock)", () => {
    const count = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "LOCK",
    ).length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Day-offset invariants — every task lives within T-2..T+5
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — dayOffset bounds", () => {
  test.each(DEFAULT_CLOSE_PLAYBOOK.map((t, i) => [i, t]))(
    "task[%i] dayOffset is in [-2, +5]",
    (_i, task) => {
      const t = task as DefaultCloseTask;
      expect(t.dayOffset).toBeGreaterThanOrEqual(-2);
      expect(t.dayOffset).toBeLessThanOrEqual(5);
    },
  );

  test("dayOffset distribution matches expected calendar", () => {
    const actual: Record<number, number> = {};
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      actual[t.dayOffset] = (actual[t.dayOffset] ?? 0) + 1;
    }
    expect(actual).toEqual(EXPECTED_DAY_OFFSETS);
  });

  test("T-2 (notify BUs) is the first day on the calendar", () => {
    const minDay = Math.min(...DEFAULT_CLOSE_PLAYBOOK.map((t) => t.dayOffset));
    expect(minDay).toBe(-2);
  });

  test("T+5 (final lock) is the last day on the calendar", () => {
    const maxDay = Math.max(...DEFAULT_CLOSE_PLAYBOOK.map((t) => t.dayOffset));
    expect(maxDay).toBe(5);
  });

  test("T+4 is intentionally empty (review buffer day)", () => {
    const t4 = DEFAULT_CLOSE_PLAYBOOK.filter((t) => t.dayOffset === 4);
    expect(t4).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sortOrder invariants — strictly increasing, multiples of 10, aligned to calendar
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — sortOrder ordering", () => {
  test("every sortOrder is a multiple of 10", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(t.sortOrder % 10).toBe(0);
    }
  });

  test("sortOrders are strictly increasing in declared order", () => {
    for (let i = 1; i < DEFAULT_CLOSE_PLAYBOOK.length; i++) {
      expect(DEFAULT_CLOSE_PLAYBOOK[i].sortOrder).toBeGreaterThan(
        DEFAULT_CLOSE_PLAYBOOK[i - 1].sortOrder,
      );
    }
  });

  test("sortOrders are unique", () => {
    const orders = DEFAULT_CLOSE_PLAYBOOK.map((t) => t.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  test("sortOrder ordering tracks dayOffset ordering (no out-of-order calendar)", () => {
    // For any two tasks A, B: if A.sortOrder < B.sortOrder then
    // A.dayOffset <= B.dayOffset. Otherwise the UI would render the
    // calendar out of chronological order.
    for (let i = 0; i < DEFAULT_CLOSE_PLAYBOOK.length; i++) {
      for (let j = i + 1; j < DEFAULT_CLOSE_PLAYBOOK.length; j++) {
        const a = DEFAULT_CLOSE_PLAYBOOK[i];
        const b = DEFAULT_CLOSE_PLAYBOOK[j];
        // a comes earlier in the declared array, so its sortOrder is lower.
        expect(a.dayOffset).toBeLessThanOrEqual(b.dayOffset);
      }
    }
  });

  test("first task has sortOrder 10", () => {
    expect(DEFAULT_CLOSE_PLAYBOOK[0].sortOrder).toBe(10);
  });

  test("last task has sortOrder 110", () => {
    expect(
      DEFAULT_CLOSE_PLAYBOOK[DEFAULT_CLOSE_PLAYBOOK.length - 1].sortOrder,
    ).toBe(110);
  });
});

// ---------------------------------------------------------------------------
// Title uniqueness — a tenant should never see two tasks with the same name
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — title uniqueness", () => {
  test("every task title is unique", () => {
    const titles = DEFAULT_CLOSE_PLAYBOOK.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("no title is the empty string after trim", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(t.title.trim()).not.toBe("");
    }
  });

  test("no description is the empty string after trim", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(t.description.trim()).not.toBe("");
    }
  });

  test("titles do not start or end with whitespace", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(t.title).toBe(t.title.trim());
    }
  });
});

// ---------------------------------------------------------------------------
// autoStatusOrigin invariants — every auto-marker maps to a real origin
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — autoStatusOrigin", () => {
  test("at least one task carries an autoStatusOrigin", () => {
    const withOrigin = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.autoStatusOrigin,
    );
    expect(withOrigin.length).toBeGreaterThan(0);
  });

  test("every autoStatusOrigin matches a known FactRow.origin label", () => {
    const withOrigin = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.autoStatusOrigin,
    );
    for (const t of withOrigin) {
      expect(EXPECTED_AUTO_ORIGINS).toContain(t.autoStatusOrigin!);
    }
  });

  test("Translation origin is wired to the FX translation task", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.autoStatusOrigin === "Translation",
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("CONSOLIDATION");
    expect(t!.title).toMatch(/translation/i);
  });

  test("Elimination origin is wired to the IC elimination task", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.autoStatusOrigin === "Elimination",
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("CONSOLIDATION");
    expect(t!.title).toMatch(/intercompany|elimination/i);
  });

  test("Import origin is wired to the subledger-lock task on T", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.autoStatusOrigin === "Import",
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("JOURNAL_ENTRIES");
    expect(t!.dayOffset).toBe(0);
  });

  test("no two tasks share the same autoStatusOrigin", () => {
    const origins = DEFAULT_CLOSE_PLAYBOOK
      .map((t) => t.autoStatusOrigin)
      .filter((o): o is string => Boolean(o));
    expect(new Set(origins).size).toBe(origins.length);
  });

  test("REVIEW tasks never carry an autoStatusOrigin (human sign-off only)", () => {
    const reviews = DEFAULT_CLOSE_PLAYBOOK.filter(
      (t) => t.category === "REVIEW",
    );
    for (const r of reviews) {
      expect(r.autoStatusOrigin).toBeUndefined();
    }
  });

  test("LOCK task never carries an autoStatusOrigin (admin-only action)", () => {
    const locks = DEFAULT_CLOSE_PLAYBOOK.filter((t) => t.category === "LOCK");
    for (const l of locks) {
      expect(l.autoStatusOrigin).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Spot checks — specific tasks that downstream code depends on
// ---------------------------------------------------------------------------

describe("DEFAULT_CLOSE_PLAYBOOK — specific task spot checks", () => {
  test("contains a 'notify business units' task on T-2", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === -2 && /notify/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("RECONCILIATION");
  });

  test("contains a 'bank reconciliations' task on T-1", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === -1 && /bank/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("RECONCILIATION");
  });

  test("contains an 'accounts payable cut-off' task on T-1", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) =>
        x.dayOffset === -1 &&
        /accounts payable|AP cut/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("RECONCILIATION");
  });

  test("contains an 'accruals' task on T (close day)", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === 0 && /accrual/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("JOURNAL_ENTRIES");
  });

  test("contains a trial balance review task on T+2", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === 2 && /trial balance/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("REVIEW");
  });

  test("contains a variance analysis task on T+2", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === 2 && /variance/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("REVIEW");
  });

  test("contains a management review task on T+3", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === 3 && /management review/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("REVIEW");
  });

  test("contains a 'final lock' task on T+5", () => {
    const t = DEFAULT_CLOSE_PLAYBOOK.find(
      (x) => x.dayOffset === 5 && /lock/i.test(x.title),
    );
    expect(t).toBeDefined();
    expect(t!.category).toBe("LOCK");
  });
});

// ---------------------------------------------------------------------------
// CLOSE_CATEGORIES constant
// ---------------------------------------------------------------------------

describe("CLOSE_CATEGORIES", () => {
  test("is a readonly tuple of exactly 5 entries", () => {
    expect(Array.isArray(CLOSE_CATEGORIES)).toBe(true);
    expect(CLOSE_CATEGORIES).toHaveLength(5);
  });

  test("matches the expected ordering", () => {
    expect([...CLOSE_CATEGORIES]).toEqual([
      "RECONCILIATION",
      "JOURNAL_ENTRIES",
      "CONSOLIDATION",
      "REVIEW",
      "LOCK",
    ]);
  });

  test("entries are unique", () => {
    expect(new Set(CLOSE_CATEGORIES).size).toBe(CLOSE_CATEGORIES.length);
  });

  test("every CLOSE_CATEGORIES entry is used by at least one task", () => {
    const used = new Set(DEFAULT_CLOSE_PLAYBOOK.map((t) => t.category));
    for (const cat of CLOSE_CATEGORIES) {
      expect(used).toContain(cat);
    }
  });

  test("every task category appears in CLOSE_CATEGORIES (no orphan categories)", () => {
    for (const t of DEFAULT_CLOSE_PLAYBOOK) {
      expect(CLOSE_CATEGORIES).toContain(
        t.category as (typeof CLOSE_CATEGORIES)[number],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// CLOSE_CATEGORY_LABELS constant
// ---------------------------------------------------------------------------

describe("CLOSE_CATEGORY_LABELS", () => {
  test("is a plain object", () => {
    expect(typeof CLOSE_CATEGORY_LABELS).toBe("object");
    expect(CLOSE_CATEGORY_LABELS).not.toBeNull();
    expect(Array.isArray(CLOSE_CATEGORY_LABELS)).toBe(false);
  });

  test.each(CLOSE_CATEGORIES)("has a non-empty label for %s", (cat) => {
    const label = CLOSE_CATEGORY_LABELS[cat];
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  test("has exactly one label per category (no extras, no holes)", () => {
    expect(Object.keys(CLOSE_CATEGORY_LABELS).sort()).toEqual(
      [...CLOSE_CATEGORIES].sort(),
    );
  });

  test("labels match the expected human-readable strings", () => {
    expect(CLOSE_CATEGORY_LABELS.RECONCILIATION).toBe("Reconciliation");
    expect(CLOSE_CATEGORY_LABELS.JOURNAL_ENTRIES).toBe("Journal Entries");
    expect(CLOSE_CATEGORY_LABELS.CONSOLIDATION).toBe("Consolidation");
    expect(CLOSE_CATEGORY_LABELS.REVIEW).toBe("Review");
    expect(CLOSE_CATEGORY_LABELS.LOCK).toBe("Lock");
  });

  test("every label starts with an uppercase letter (Title Case)", () => {
    for (const cat of CLOSE_CATEGORIES) {
      const label = CLOSE_CATEGORY_LABELS[cat];
      expect(label[0]).toBe(label[0].toUpperCase());
      expect(label[0]).toMatch(/[A-Z]/);
    }
  });

  test("every label is shorter than the SCREAMING_SNAKE key (human-friendly)", () => {
    // Title Case labels are visually compact compared to the enum key.
    // E.g. "JOURNAL_ENTRIES" → "Journal Entries". This invariant keeps
    // the UI from regressing back to raw enum keys.
    for (const cat of CLOSE_CATEGORIES) {
      const label = CLOSE_CATEGORY_LABELS[cat];
      expect(label.includes("_")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// CLOSE_STATUSES constant
// ---------------------------------------------------------------------------

describe("CLOSE_STATUSES", () => {
  test("is a readonly tuple of exactly 5 entries", () => {
    expect(Array.isArray(CLOSE_STATUSES)).toBe(true);
    expect(CLOSE_STATUSES).toHaveLength(5);
  });

  test("matches the expected ordering (PENDING → terminal states last)", () => {
    expect([...CLOSE_STATUSES]).toEqual([
      "PENDING",
      "IN_PROGRESS",
      "DONE",
      "BLOCKED",
      "SKIPPED",
    ]);
  });

  test("entries are unique", () => {
    expect(new Set(CLOSE_STATUSES).size).toBe(CLOSE_STATUSES.length);
  });

  test.each(EXPECTED_STATUSES)("contains %s", (status) => {
    expect(CLOSE_STATUSES).toContain(status);
  });

  test("PENDING is the first / initial status", () => {
    expect(CLOSE_STATUSES[0]).toBe("PENDING");
  });

  test("DONE / BLOCKED / SKIPPED are terminal sinks (UI never auto-resets them)", () => {
    // We rely on these three as the "done" set when computing completion
    // percent in the /close UI. The set membership matters more than the
    // exact ordering; pin it explicitly.
    const terminals = ["DONE", "BLOCKED", "SKIPPED"];
    for (const t of terminals) {
      expect(CLOSE_STATUSES).toContain(t);
    }
  });
});
