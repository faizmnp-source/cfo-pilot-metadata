/*
 * Unit tests for the Smart Mapping Engine (Phase 2).
 * Covers the three pure ranking primitives:
 *   - similarity      (Levenshtein-normalised, case-insensitive)
 *   - tokenSetSimilarity (token-set overlap on max set size)
 *   - score           (composite hits/tokenSim/leven blend, 0..100)
 *
 * No DB, no I/O. These functions back /api/v2/mappings/suggest, so any
 * regression here flips the confidence numbers the UI shows.
 */

import { similarity, tokenSetSimilarity, score } from "./engine";

describe("similarity (Levenshtein-normalised)", () => {
  test("identical strings score 1", () => {
    expect(similarity("Cash", "Cash")).toBe(1);
  });

  test("identical strings differing only in case score 1", () => {
    expect(similarity("CASH", "cash")).toBe(1);
  });

  test("identical strings with leading/trailing whitespace score 1", () => {
    expect(similarity("  Cash  ", "Cash")).toBe(1);
  });

  test("completely disjoint short strings score 0", () => {
    // 'abc' -> 'xyz' is 3 edits over max-length 3
    expect(similarity("abc", "xyz")).toBe(0);
  });

  test("empty input on either side returns 0", () => {
    expect(similarity("", "Cash")).toBe(0);
    expect(similarity("Cash", "")).toBe(0);
    expect(similarity("", "")).toBe(0);
  });

  test("single-edit distance scores high but below 1", () => {
    // 'cash' vs 'cash!' = 1 insertion over max-length 5 = 1 - 0.2 = 0.8
    const s = similarity("cash", "cash!");
    expect(s).toBeCloseTo(0.8, 6);
  });

  test("close finance terms (Salary vs Salaries) score >= 0.7", () => {
    expect(similarity("Salary Expense", "Salaries Expense")).toBeGreaterThanOrEqual(0.7);
  });

  test("similarity is symmetric", () => {
    const a = similarity("Operating Expenses", "Opex");
    const b = similarity("Opex", "Operating Expenses");
    expect(a).toBeCloseTo(b, 10);
  });

  test("output is always between 0 and 1 inclusive", () => {
    const samples = [
      ["", ""], ["a", "b"], ["abc", "abcd"], ["abc", "xyz"],
      ["AccountsReceivable", "AcctsReceivable"], ["Revenue", "rev"],
    ];
    for (const [a, b] of samples) {
      const s = similarity(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("tokenSetSimilarity (overlap over max set size)", () => {
  test("identical token sets score 1", () => {
    expect(tokenSetSimilarity("Cash and Equivalents", "Cash and Equivalents")).toBe(1);
  });

  test("token-set reorders score 1 (set semantics)", () => {
    expect(tokenSetSimilarity("Cash Equivalents", "Equivalents Cash")).toBe(1);
  });

  test("plural / case differences are NOT normalised (literal token overlap)", () => {
    // 'Salary' vs 'Salaries' are different tokens — overlap is just "Expense"
    // A={'salary','expense'}, B={'salaries','expense'} -> 1/2 = 0.5
    const s = tokenSetSimilarity("Salary Expense", "Salaries Expense");
    expect(s).toBeCloseTo(0.5, 6);
  });

  test("punctuation is stripped before tokenisation", () => {
    // "Cash, & Equivalents." → tokens: cash, equivalents
    // "cash equivalents"     → tokens: cash, equivalents
    expect(tokenSetSimilarity("Cash, & Equivalents.", "cash equivalents")).toBe(1);
  });

  test("uses max set size as denominator (asymmetric size penalty)", () => {
    // A={'cash'}, B={'cash','and','equivalents'} -> 1/3
    const s = tokenSetSimilarity("Cash", "Cash and Equivalents");
    expect(s).toBeCloseTo(1 / 3, 6);
  });

  test("empty input on either side returns 0", () => {
    expect(tokenSetSimilarity("", "Cash")).toBe(0);
    expect(tokenSetSimilarity("Cash", "")).toBe(0);
    expect(tokenSetSimilarity("   ", "Cash")).toBe(0);
  });

  test("zero overlap returns 0", () => {
    expect(tokenSetSimilarity("Revenue", "Cash")).toBe(0);
  });

  test("tokenSetSimilarity is symmetric", () => {
    const a = tokenSetSimilarity("Operating Expenses Other", "Other Operating");
    const b = tokenSetSimilarity("Other Operating", "Operating Expenses Other");
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("score (composite hits/tokenSim/leven, 0..100)", () => {
  test("perfect name match with no history still scores well", () => {
    // hits=0, tokenSim=1, leven=1 -> 0*0.55 + 1*0.30 + 1*0.15 = 0.45 -> 45
    const s = score("Cash", { name: "Cash" }, 0);
    expect(s).toBe(45);
  });

  test("perfect match WITH 10+ historical hits saturates near 100", () => {
    // hits=min(1,10/10)=1 -> 1*0.55 + 1*0.30 + 1*0.15 = 1.0 -> 100
    expect(score("Cash", { name: "Cash" }, 10)).toBe(100);
    expect(score("Cash", { name: "Cash" }, 99)).toBe(100); // hits clamped at 1
  });

  test("history hits cap at 10 — 20 hits = 10 hits", () => {
    expect(score("Cash", { name: "Cash" }, 20)).toBe(score("Cash", { name: "Cash" }, 10));
  });

  test("matching against target.code is considered when name misses", () => {
    // name='Cash' vs sourceKey='10100' should score low.
    // BUT code='10100' should bring tokenSim=1 and leven=1 -> 45 (no history)
    const s = score("10100", { name: "Cash", code: "10100" }, 0);
    expect(s).toBe(45);
  });

  test("better of name-match or code-match is used (Math.max semantics)", () => {
    const nameOnly = score("Cash", { name: "Cash", code: "99999" }, 0);
    const codeOnly = score("99999", { name: "Cash", code: "99999" }, 0);
    expect(nameOnly).toBe(45);
    expect(codeOnly).toBe(45);
  });

  test("totally unrelated target scores low", () => {
    const s = score("Revenue", { name: "Cash" }, 0);
    expect(s).toBeLessThan(15);
  });

  test("output is an integer in [0,100]", () => {
    const samples: Array<[string, { name: string; code?: string }, number]> = [
      ["Cash", { name: "Cash" }, 5],
      ["Salary", { name: "Salaries Expense", code: "60100" }, 2],
      ["abc", { name: "xyz" }, 0],
      ["FX Gain", { name: "Foreign Exchange Gain" }, 12],
      ["", { name: "Cash" }, 0],
    ];
    for (const [src, target, hits] of samples) {
      const s = score(src, target, hits);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  test("history hits move the needle ~55 points at max", () => {
    const noHistory = score("Foo", { name: "Bar" }, 0);
    const fullHistory = score("Foo", { name: "Bar" }, 10);
    // hits component contributes 0.55 * 100 = 55 max
    expect(fullHistory - noHistory).toBeGreaterThanOrEqual(50);
    expect(fullHistory - noHistory).toBeLessThanOrEqual(60);
  });

  test("ranking sanity — better text match outranks worse one at equal history", () => {
    const better = score("Salary Expense", { name: "Salaries Expense" }, 0);
    const worse = score("Salary Expense", { name: "Cash" }, 0);
    expect(better).toBeGreaterThan(worse);
  });
});
