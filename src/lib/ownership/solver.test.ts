/*
 * Phase 4 / Section 20 — Indirect ownership solver unit tests.
 *
 * Pins src/lib/ownership/solver.ts indirectOwnershipMatrix() across:
 *   - empty / single-edge / multi-hop chain math
 *   - converging paths (sum across alternate routes)
 *   - branching subsidiaries
 *   - disconnected components
 *   - boundary pcts (0 / 100 / fractional / >100 / negative)
 *   - cycle / self-loop termination (algorithm uses seenEdge keyed
 *     by `${node}|${child}|${pct.toFixed(6)}` — pin terminate +
 *     deterministic, not "ownership math is sensible" for cycles)
 *   - allNodes coverage (every parent + every child appears as a key)
 *   - return type (Map of Map, not array)
 *   - purity (no caller-array mutation)
 *   - determinism (repeat calls return equal output)
 *   - floating-point at deep chains
 *
 * Pure-additive: no source change. solver.ts unchanged.
 *
 * Companion to ownership/apply.test.ts (which pins the rollup wrapper).
 * Together they cover the full ownership math surface before W3.14
 * integrates ownership into runConsolidation() in consolidation-engine.ts.
 */

import { indirectOwnershipMatrix, type OwnershipEdge } from "./solver";

// ──────────────────────────────────────────────────────────────────────────
// Test fixtures — kept small + named so failures point to a real intent.
// ──────────────────────────────────────────────────────────────────────────

const NO_EDGES: OwnershipEdge[] = [];

const SINGLE: OwnershipEdge[] = [
  { parentId: "GRP", childId: "IN", pct: 100 },
];

const CHAIN: OwnershipEdge[] = [
  // GRP → IN (100) → DEL (80) → MUM (50) → KOL (40)
  { parentId: "GRP", childId: "IN",  pct: 100 },
  { parentId: "IN",  childId: "DEL", pct: 80 },
  { parentId: "DEL", childId: "MUM", pct: 50 },
  { parentId: "MUM", childId: "KOL", pct: 40 },
];

const BRANCH: OwnershipEdge[] = [
  // GRP owns A and B at 50% each; A and B both own C at 50%.
  // GRP indirectly owns C via two paths: 50%*50% + 50%*50% = 50%.
  { parentId: "GRP", childId: "A", pct: 50 },
  { parentId: "GRP", childId: "B", pct: 50 },
  { parentId: "A",   childId: "C", pct: 50 },
  { parentId: "B",   childId: "C", pct: 50 },
];

const DISCONNECTED: OwnershipEdge[] = [
  { parentId: "GRP", childId: "IN", pct: 100 },
  { parentId: "X",   childId: "Y",  pct: 100 },
];

// ──────────────────────────────────────────────────────────────────────────
// Shape + return-type pins
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — shape & return type", () => {
  it("returns a Map", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m).toBeInstanceOf(Map);
  });

  it("inner values are Maps", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    for (const v of Array.from(m.values())) {
      expect(v).toBeInstanceOf(Map);
    }
  });

  it("each key in outer Map is a node from edges (parent or child)", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    const keys = Array.from(m.keys()).sort();
    expect(keys).toEqual(["GRP", "IN"]);
  });

  it("empty edges → empty outer Map", () => {
    const m = indirectOwnershipMatrix(NO_EDGES);
    expect(m.size).toBe(0);
  });

  it("inner Map values are numbers in [0, 1] for sensible inputs", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    for (const inner of Array.from(m.values())) {
      for (const v of Array.from(inner.values())) {
        expect(typeof v).toBe("number");
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// allNodes coverage — every node appears as a key
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — allNodes coverage", () => {
  it("includes parent and child of a single edge", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.has("GRP")).toBe(true);
    expect(m.has("IN")).toBe(true);
  });

  it("includes every node in a 4-node chain", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    for (const node of ["GRP", "IN", "DEL", "MUM", "KOL"]) {
      expect(m.has(node)).toBe(true);
    }
  });

  it("leaf nodes (no outgoing edges) appear with empty inner Map", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.get("IN")?.size).toBe(0);
  });

  it("every leaf in a chain has empty inner Map", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("KOL")?.size).toBe(0);
  });

  it("includes nodes from both components in a disconnected graph", () => {
    const m = indirectOwnershipMatrix(DISCONNECTED);
    for (const node of ["GRP", "IN", "X", "Y"]) {
      expect(m.has(node)).toBe(true);
    }
  });

  it("a node that is only ever a child still gets an entry (with empty Map)", () => {
    const m = indirectOwnershipMatrix([{ parentId: "A", childId: "B", pct: 50 }]);
    expect(m.has("B")).toBe(true);
    expect(m.get("B")?.size).toBe(0);
  });

  it("size of outer Map = unique node count", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.size).toBe(5);   // GRP, IN, DEL, MUM, KOL
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Single-edge math
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — single edge", () => {
  it("100% direct → 1.0 (pct stored 0..1, not 0..100)", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.get("GRP")?.get("IN")).toBe(1);
  });

  it("50% direct → 0.5", () => {
    const m = indirectOwnershipMatrix([{ parentId: "GRP", childId: "IN", pct: 50 }]);
    expect(m.get("GRP")?.get("IN")).toBe(0.5);
  });

  it("0% edge → 0 in matrix", () => {
    const m = indirectOwnershipMatrix([{ parentId: "GRP", childId: "IN", pct: 0 }]);
    expect(m.get("GRP")?.get("IN")).toBe(0);
  });

  it("33.33% direct → 0.3333", () => {
    const m = indirectOwnershipMatrix([{ parentId: "GRP", childId: "IN", pct: 33.33 }]);
    expect(m.get("GRP")?.get("IN")).toBeCloseTo(0.3333, 5);
  });

  it("66.67% direct → 0.6667", () => {
    const m = indirectOwnershipMatrix([{ parentId: "GRP", childId: "IN", pct: 66.67 }]);
    expect(m.get("GRP")?.get("IN")).toBeCloseTo(0.6667, 5);
  });

  it("child has empty inner Map (only parents accumulate)", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.get("IN")?.has("GRP")).toBe(false);
  });

  it("parent does NOT own itself in its own inner Map by default", () => {
    // The solver does NOT add (parent → parent: 1) — apply.ts handles self
    // via the makeOwnershipLookup self-check. Pinning this avoids a subtle
    // double-counting bug if a future contributor adds an implicit identity.
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.get("GRP")?.has("GRP")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Multi-hop chain math
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — multi-hop chains", () => {
  it("2-hop: GRP → IN(100) → DEL(80) = 80% indirect", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("GRP")?.get("DEL")).toBeCloseTo(0.8, 5);
  });

  it("3-hop: GRP → IN(100) → DEL(80) → MUM(50) = 40% indirect", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("GRP")?.get("MUM")).toBeCloseTo(0.4, 5);
  });

  it("4-hop: GRP → IN(100) → DEL(80) → MUM(50) → KOL(40) = 16% indirect", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("GRP")?.get("KOL")).toBeCloseTo(0.16, 5);
  });

  it("intermediate ancestor sees its own descendants (IN → DEL = 0.8)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("IN")?.get("DEL")).toBeCloseTo(0.8, 5);
  });

  it("intermediate ancestor sees deeper descendant (IN → KOL = 0.16)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("IN")?.get("KOL")).toBeCloseTo(0.16, 5);
  });

  it("intermediate ancestor sees grandchild (DEL → MUM = 0.5)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("DEL")?.get("MUM")).toBeCloseTo(0.5, 5);
  });

  it("intermediate ancestor sees great-grandchild (DEL → KOL = 0.5 × 0.4 = 0.2)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("DEL")?.get("KOL")).toBeCloseTo(0.2, 5);
  });

  it("MUM → KOL is 0.4 (the direct edge, 1 hop)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("MUM")?.get("KOL")).toBeCloseTo(0.4, 5);
  });

  it("KOL → anything is empty (it's a leaf)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("KOL")?.size).toBe(0);
  });

  it("descendant does NOT see ancestor (DEL → GRP undefined)", () => {
    const m = indirectOwnershipMatrix(CHAIN);
    expect(m.get("DEL")?.get("GRP")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Converging-path math (multiple routes to same descendant)
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — converging paths", () => {
  it("GRP → A(50), GRP → B(50), A → C(50), B → C(50) ⇒ GRP→C = 25% + 25% = 50%", () => {
    const m = indirectOwnershipMatrix(BRANCH);
    expect(m.get("GRP")?.get("C")).toBeCloseTo(0.5, 5);
  });

  it("direct paths still pinned in the same matrix (GRP → A = 0.5)", () => {
    const m = indirectOwnershipMatrix(BRANCH);
    expect(m.get("GRP")?.get("A")).toBe(0.5);
    expect(m.get("GRP")?.get("B")).toBe(0.5);
  });

  it("A → C = 0.5 (A's view, not double-counted)", () => {
    const m = indirectOwnershipMatrix(BRANCH);
    expect(m.get("A")?.get("C")).toBe(0.5);
  });

  it("B → C = 0.5 (B's view, independent of A)", () => {
    const m = indirectOwnershipMatrix(BRANCH);
    expect(m.get("B")?.get("C")).toBe(0.5);
  });

  it("3-way convergence sums correctly", () => {
    // GRP owns A, B, X at 30% each; each owns C at 100%
    // GRP → C should be 30% + 30% + 30% = 90%
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "A", pct: 30 },
      { parentId: "GRP", childId: "B", pct: 30 },
      { parentId: "GRP", childId: "X", pct: 30 },
      { parentId: "A",   childId: "C", pct: 100 },
      { parentId: "B",   childId: "C", pct: 100 },
      { parentId: "X",   childId: "C", pct: 100 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("C")).toBeCloseTo(0.9, 5);
  });

  it("convergence with asymmetric pcts: 80%*50% + 20%*100% = 60%", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "A", pct: 80 },
      { parentId: "GRP", childId: "B", pct: 20 },
      { parentId: "A",   childId: "C", pct: 50 },
      { parentId: "B",   childId: "C", pct: 100 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("C")).toBeCloseTo(0.6, 5);
  });

  it("convergence can exceed 100% if input pcts are inconsistent (algorithm sums)", () => {
    // Domain-level red flag: A and B each own C at 100%, GRP owns both
    // at 100%, so GRP → C sums to 200%. Algorithm does NOT clamp;
    // this is the caller's job. Pin the literal behavior so a future
    // clamp is a conscious choice.
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "A", pct: 100 },
      { parentId: "GRP", childId: "B", pct: 100 },
      { parentId: "A",   childId: "C", pct: 100 },
      { parentId: "B",   childId: "C", pct: 100 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("C")).toBeCloseTo(2, 5);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Branching subsidiaries (one parent, many children)
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — branching subsidiaries", () => {
  it("one parent, three independent children", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "A", pct: 100 },
      { parentId: "GRP", childId: "B", pct: 50 },
      { parentId: "GRP", childId: "C", pct: 25 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("A")).toBe(1);
    expect(m.get("GRP")?.get("B")).toBe(0.5);
    expect(m.get("GRP")?.get("C")).toBe(0.25);
    expect(m.get("GRP")?.size).toBe(3);
  });

  it("siblings do NOT see each other", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "A", pct: 100 },
      { parentId: "GRP", childId: "B", pct: 50 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("A")?.get("B")).toBeUndefined();
    expect(m.get("B")?.get("A")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Disconnected components
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — disconnected components", () => {
  it("GRP→IN and X→Y produce two independent ownership entries", () => {
    const m = indirectOwnershipMatrix(DISCONNECTED);
    expect(m.get("GRP")?.get("IN")).toBe(1);
    expect(m.get("X")?.get("Y")).toBe(1);
  });

  it("nodes from one component don't appear in the other", () => {
    const m = indirectOwnershipMatrix(DISCONNECTED);
    expect(m.get("GRP")?.get("X")).toBeUndefined();
    expect(m.get("GRP")?.get("Y")).toBeUndefined();
    expect(m.get("X")?.get("IN")).toBeUndefined();
    expect(m.get("X")?.get("GRP")).toBeUndefined();
  });

  it("each component's leaf has empty inner Map", () => {
    const m = indirectOwnershipMatrix(DISCONNECTED);
    expect(m.get("IN")?.size).toBe(0);
    expect(m.get("Y")?.size).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Boundary pct values
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — boundary pct values", () => {
  it("0% → 0 (descendant still recorded at 0)", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "GRP", childId: "IN", pct: 0 },
      { parentId: "IN",  childId: "DEL", pct: 50 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("IN")).toBe(0);
    expect(m.get("GRP")?.get("DEL")).toBe(0);
  });

  it("100% direct → 1 exact (not floating drift)", () => {
    const m = indirectOwnershipMatrix(SINGLE);
    expect(m.get("GRP")?.get("IN")).toBe(1);
  });

  it("very small pct (0.01%) is preserved", () => {
    const m = indirectOwnershipMatrix([
      { parentId: "GRP", childId: "IN", pct: 0.01 },
    ]);
    expect(m.get("GRP")?.get("IN")).toBeCloseTo(0.0001, 7);
  });

  it("pct >100 is NOT clamped — algorithm trusts caller (domain may flag)", () => {
    const m = indirectOwnershipMatrix([
      { parentId: "GRP", childId: "IN", pct: 150 },
    ]);
    expect(m.get("GRP")?.get("IN")).toBeCloseTo(1.5, 5);
  });

  it("negative pct is NOT clamped — algorithm trusts caller", () => {
    const m = indirectOwnershipMatrix([
      { parentId: "GRP", childId: "IN", pct: -50 },
    ]);
    expect(m.get("GRP")?.get("IN")).toBeCloseTo(-0.5, 5);
  });

  it("NaN pct propagates as NaN (no silent coercion)", () => {
    const m = indirectOwnershipMatrix([
      { parentId: "GRP", childId: "IN", pct: NaN },
    ]);
    expect(Number.isNaN(m.get("GRP")?.get("IN"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Floating-point precision at depth
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — floating-point precision at depth", () => {
  it("4-hop with 50%-each chain = 0.0625", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 50 },
      { parentId: "B", childId: "C", pct: 50 },
      { parentId: "C", childId: "D", pct: 50 },
      { parentId: "D", childId: "E", pct: 50 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("A")?.get("E")).toBeCloseTo(0.0625, 8);
  });

  it("6-hop with 75%-each chain ≈ 0.177978515625", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "n1", childId: "n2", pct: 75 },
      { parentId: "n2", childId: "n3", pct: 75 },
      { parentId: "n3", childId: "n4", pct: 75 },
      { parentId: "n4", childId: "n5", pct: 75 },
      { parentId: "n5", childId: "n6", pct: 75 },
      { parentId: "n6", childId: "n7", pct: 75 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("n1")?.get("n7")).toBeCloseTo(0.75 ** 6, 8);
  });

  it("descending pcts at depth (90 → 80 → 70 → 60 → 50) = 0.1512", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 90 },
      { parentId: "B", childId: "C", pct: 80 },
      { parentId: "C", childId: "D", pct: 70 },
      { parentId: "D", childId: "E", pct: 60 },
      { parentId: "E", childId: "F", pct: 50 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("A")?.get("F")).toBeCloseTo(0.9 * 0.8 * 0.7 * 0.6 * 0.5, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Cycle / self-loop termination
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — cycles & self-loops", () => {
  it("self-loop A → A terminates and includes A in own inner Map", () => {
    const edges: OwnershipEdge[] = [{ parentId: "A", childId: "A", pct: 100 }];
    // seenEdge dedupes when accumulated pct stays at the same toFixed(6),
    // so this terminates. Pin "terminates + A appears under A".
    const m = indirectOwnershipMatrix(edges);
    expect(m.has("A")).toBe(true);
    // After one expansion, A is recorded as a "descendant" of itself at 100%.
    expect(m.get("A")?.get("A")).toBe(1);
  });

  it("100%-cycle A → B → A terminates", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 100 },
      { parentId: "B", childId: "A", pct: 100 },
    ];
    // Should NOT hang.
    const m = indirectOwnershipMatrix(edges);
    expect(m.has("A")).toBe(true);
    expect(m.has("B")).toBe(true);
  });

  it("100%-cycle records A→B and B→A both at 100%", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 100 },
      { parentId: "B", childId: "A", pct: 100 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("A")?.get("B")).toBe(1);
    expect(m.get("B")?.get("A")).toBe(1);
  });

  it("50%-cycle A → B → A terminates (geometric series with toFixed(6) cutoff)", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 50 },
      { parentId: "B", childId: "A", pct: 50 },
    ];
    // The series A→B is 0.5 + 0.5*0.25 + 0.5*0.0625 + ... converges to ≈ 0.6667.
    // We pin only "terminates + produces a finite number > 0", because the
    // toFixed(6) cutoff means the algorithm under-shoots the true limit.
    const start = Date.now();
    const m = indirectOwnershipMatrix(edges);
    expect(Date.now() - start).toBeLessThan(2000);   // hang guard
    const aToB = m.get("A")?.get("B") ?? 0;
    expect(Number.isFinite(aToB)).toBe(true);
    expect(aToB).toBeGreaterThan(0);
    expect(aToB).toBeLessThan(1);
  });

  it("0% cycle terminates immediately (no accumulation)", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 0 },
      { parentId: "B", childId: "A", pct: 0 },
    ];
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("A")?.get("B")).toBe(0);
    expect(m.get("B")?.get("A")).toBe(0);
  });

  it("3-node cycle A → B → C → A terminates", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 100 },
      { parentId: "B", childId: "C", pct: 100 },
      { parentId: "C", childId: "A", pct: 100 },
    ];
    const start = Date.now();
    const m = indirectOwnershipMatrix(edges);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(m.size).toBe(3);
  });

  it("cycle output is deterministic across repeat calls", () => {
    const edges: OwnershipEdge[] = [
      { parentId: "A", childId: "B", pct: 60 },
      { parentId: "B", childId: "A", pct: 40 },
    ];
    const m1 = indirectOwnershipMatrix(edges);
    const m2 = indirectOwnershipMatrix(edges);
    expect(m1.get("A")?.get("B")).toBe(m2.get("A")?.get("B"));
    expect(m1.get("B")?.get("A")).toBe(m2.get("B")?.get("A"));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Purity — caller's edge array not mutated
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — purity", () => {
  it("does NOT mutate the caller's edges array (length)", () => {
    const edges: OwnershipEdge[] = [...CHAIN];
    const before = edges.length;
    indirectOwnershipMatrix(edges);
    expect(edges.length).toBe(before);
  });

  it("does NOT mutate the caller's edges array (contents)", () => {
    const edges: OwnershipEdge[] = JSON.parse(JSON.stringify(CHAIN));
    const snapshot = JSON.parse(JSON.stringify(edges));
    indirectOwnershipMatrix(edges);
    expect(edges).toEqual(snapshot);
  });

  it("does NOT mutate individual edge objects", () => {
    const e = { parentId: "GRP", childId: "IN", pct: 100 };
    indirectOwnershipMatrix([e]);
    expect(e).toEqual({ parentId: "GRP", childId: "IN", pct: 100 });
  });

  it("works with Object.frozen edge entries", () => {
    const edges = CHAIN.map(e => Object.freeze({ ...e }));
    expect(() => indirectOwnershipMatrix(edges)).not.toThrow();
  });

  it("works with Object.frozen edges array", () => {
    const edges = Object.freeze([...CHAIN]) as ReadonlyArray<OwnershipEdge>;
    // OwnershipEdge[] is the public signature, but algorithm reads only.
    expect(() => indirectOwnershipMatrix(edges as OwnershipEdge[])).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Determinism
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — determinism", () => {
  it("same input → same output across two calls (deep value equality)", () => {
    const m1 = indirectOwnershipMatrix(CHAIN);
    const m2 = indirectOwnershipMatrix(CHAIN);
    expect(Array.from(m1.keys()).sort()).toEqual(Array.from(m2.keys()).sort());
    for (const k of Array.from(m1.keys())) {
      const inner1 = m1.get(k)!;
      const inner2 = m2.get(k)!;
      expect(Array.from(inner1.entries()).sort()).toEqual(
        Array.from(inner2.entries()).sort(),
      );
    }
  });

  it("edge order independence for acyclic graphs (chain order doesn't change result)", () => {
    // Shuffle the chain edges and verify the same ownership matrix.
    const shuffled = [CHAIN[3], CHAIN[1], CHAIN[0], CHAIN[2]];
    const m1 = indirectOwnershipMatrix(CHAIN);
    const m2 = indirectOwnershipMatrix(shuffled);
    expect(m2.get("GRP")?.get("KOL")).toBeCloseTo(m1.get("GRP")?.get("KOL") ?? -1, 5);
    expect(m2.get("GRP")?.get("DEL")).toBeCloseTo(m1.get("GRP")?.get("DEL") ?? -1, 5);
  });

  it("returns a fresh Map per call (no shared mutable state)", () => {
    const m1 = indirectOwnershipMatrix(SINGLE);
    const m2 = indirectOwnershipMatrix(SINGLE);
    expect(m1).not.toBe(m2);
    expect(m1.get("GRP")).not.toBe(m2.get("GRP"));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Realistic CFO Pilot fixture (matches apply.test.ts) — sanity check
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — CFO Pilot fixture (parity with apply.test.ts)", () => {
  const edges: OwnershipEdge[] = [
    { parentId: "GRP", childId: "IN",  pct: 100 },
    { parentId: "IN",  childId: "DEL", pct: 80 },
    { parentId: "IN",  childId: "MUM", pct: 60 },
    { parentId: "GRP", childId: "US",  pct: 50 },
  ];

  it("GRP → IN = 1.0", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("IN")).toBe(1);
  });

  it("GRP → DEL = 0.8 (100% × 80%)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("DEL")).toBeCloseTo(0.8, 5);
  });

  it("GRP → MUM = 0.6 (100% × 60%)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("MUM")).toBeCloseTo(0.6, 5);
  });

  it("GRP → US = 0.5", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("GRP")?.get("US")).toBe(0.5);
  });

  it("US → DEL is undefined (separate branch)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("US")?.get("DEL")).toBeUndefined();
  });

  it("IN → DEL = 0.8 (direct, from intermediate's perspective)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("IN")?.get("DEL")).toBe(0.8);
  });

  it("DEL → anything is empty (leaf)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.get("DEL")?.size).toBe(0);
  });

  it("matrix size = unique node count (GRP, IN, DEL, MUM, US = 5)", () => {
    const m = indirectOwnershipMatrix(edges);
    expect(m.size).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Type exports — pin TypeScript surface so downstream callers don't drift
// ──────────────────────────────────────────────────────────────────────────

describe("indirectOwnershipMatrix — type surface", () => {
  it("OwnershipEdge accepts { parentId, childId, pct } object", () => {
    const e: OwnershipEdge = { parentId: "A", childId: "B", pct: 50 };
    expect(e.parentId).toBe("A");
    expect(e.childId).toBe("B");
    expect(e.pct).toBe(50);
  });

  it("function signature: (edges) => Map<string, Map<string, number>>", () => {
    const m: Map<string, Map<string, number>> = indirectOwnershipMatrix([]);
    expect(m).toBeInstanceOf(Map);
  });
});
