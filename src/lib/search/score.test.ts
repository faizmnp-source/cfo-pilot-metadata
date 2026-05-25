/**
 * src/lib/search/score.test.ts
 *
 * Comprehensive jest pin for `score()` — the ranking primitive behind
 * the global Cmd-K palette search at /api/v2/search/global.
 *
 * Pinned contract (in priority order, FIRST-MATCH semantics):
 *   1. empty / whitespace q                            → 0
 *   2. exact title match (case-insensitive)            → 100
 *   3. title.startsWith(q) (case-insensitive)          → 90
 *   4. title.includes(q) (case-insensitive, mid-substr)→ 70
 *   5. else: 40 + 10 × #tokens-in-common, 0 hits → 0
 *
 *   • Inputs are NOT mutated.
 *   • Function is deterministic + side-effect-free.
 */

import { score } from "./score";

describe("score(q, title)", () => {
  describe("empty / whitespace query → 0", () => {
    test("empty string returns 0", () => {
      expect(score("", "Anything")).toBe(0);
    });
    test("single space returns 0", () => {
      expect(score(" ", "Anything")).toBe(0);
    });
    test("multiple spaces returns 0", () => {
      expect(score("   ", "Anything")).toBe(0);
    });
    test("tab character returns 0", () => {
      expect(score("\t", "Anything")).toBe(0);
    });
    test("newline returns 0", () => {
      expect(score("\n", "Anything")).toBe(0);
    });
    test("mixed whitespace returns 0", () => {
      expect(score(" \t\n ", "Anything")).toBe(0);
    });
    test("empty query against empty title returns 0", () => {
      expect(score("", "")).toBe(0);
    });
  });

  describe("exact match → 100", () => {
    test("identical strings score 100", () => {
      expect(score("explorer", "explorer")).toBe(100);
    });
    test("case-insensitive equality scores 100", () => {
      expect(score("EXPLORER", "explorer")).toBe(100);
    });
    test("lower vs upper title scores 100", () => {
      expect(score("explorer", "EXPLORER")).toBe(100);
    });
    test("mixed case scores 100", () => {
      expect(score("ExPlOrEr", "EXPLORER")).toBe(100);
    });
    test("query with surrounding whitespace still scores 100", () => {
      expect(score("  explorer  ", "explorer")).toBe(100);
    });
    test("multi-word exact match scores 100", () => {
      expect(score("income statement", "Income Statement")).toBe(100);
    });
  });

  describe("prefix match → 90", () => {
    test("3-char prefix of single word title scores 90", () => {
      expect(score("inc", "income")).toBe(90);
    });
    test("1-char prefix scores 90", () => {
      expect(score("e", "explorer")).toBe(90);
    });
    test("prefix of multi-word title scores 90", () => {
      expect(score("inc", "Income Statement")).toBe(90);
    });
    test("case-insensitive prefix scores 90", () => {
      expect(score("FORE", "forecasting")).toBe(90);
    });
    test("prefix where query equals title minus one char scores 90", () => {
      expect(score("explore", "explorer")).toBe(90);
    });
    test("longer prefix of long word scores 90", () => {
      expect(score("forecast", "forecasting")).toBe(90);
    });
  });

  describe("substring (mid-string) → 70", () => {
    test("middle substring scores 70", () => {
      expect(score("plo", "explorer")).toBe(70);
    });
    test("trailing substring scores 70", () => {
      expect(score("er", "explorer")).toBe(70);
    });
    test("mid substring of second word scores 70", () => {
      expect(score("tate", "Income Statement")).toBe(70);
    });
    test("case-insensitive substring scores 70", () => {
      expect(score("PLO", "explorer")).toBe(70);
    });
    test("substring including space scores 70", () => {
      expect(score("ome stat", "Income Statement")).toBe(70);
    });
  });

  describe("token-overlap fallback (40 + 10×hits)", () => {
    test("0 token overlap returns 0", () => {
      expect(score("xyz qqq", "alpha beta")).toBe(0);
    });
    test("1 token hit returns 50", () => {
      expect(score("alpha xyz", "alpha beta")).toBe(50);
    });
    test("2 token hits return 60 (tokens reordered so substring path can't fire)", () => {
      // q="alpha beta", title reordered → no startsWith/includes match.
      // qt={alpha,beta}, tt={gamma,beta,alpha} → 2 hits → 40+20=60.
      expect(score("alpha beta", "gamma beta alpha")).toBe(60);
    });
    test("3 token hits return 70 (token path, not substr)", () => {
      expect(score("alpha beta gamma extra", "alpha beta gamma")).toBe(70);
    });
    test("4 token hits return 80", () => {
      expect(score("a b c d zz", "a b c d")).toBe(80);
    });
    test("duplicate query tokens collapsed by Set → 1 hit", () => {
      expect(score("alpha alpha alpha", "alpha beta")).toBe(50);
    });
    test("case-insensitive token comparison hits (no consecutive match)", () => {
      // Title separates the two query tokens so includes('alpha beta')=false.
      expect(score("ALPHA BETA", "gamma alpha delta beta")).toBe(60);
    });
    test("substring tier (70) wins over token path when both could match", () => {
      // "lpha bet" is a mid-substring of "alpha beta" (and NOT a prefix),
      // so tier 4 fires at 70 before token path can run.
      expect(score("lpha bet", "alpha beta")).toBe(70);
    });
    test("typing 'analyze hoc' on Analyze (Ad Hoc) → 50 (1 token hit)", () => {
      expect(score("analyze hoc", "Analyze (Ad Hoc)")).toBe(50);
    });
  });

  describe("tier ordering — stronger always wins", () => {
    test("exact (100) beats prefix (90)", () => {
      expect(score("a", "a")).toBe(100);
    });
    test("prefix (90) beats substring (70)", () => {
      expect(score("in", "income")).toBe(90);
    });
    test("substring (70) beats token overlap (50) on mid-string", () => {
      // "cas" is mid in "forecasting" (NOT a prefix) → 70 not 90/50.
      expect(score("cas", "Forecasting")).toBe(70);
    });
    test("token overlap never fires when substring exists (mid-string)", () => {
      // "cde" is mid in "abcdef" → 70.
      expect(score("cde", "abcdef")).toBe(70);
    });
  });

  describe("purity / determinism", () => {
    test("identical inputs return identical outputs (run 1)", () => {
      const a = score("inc", "Income Statement");
      const b = score("inc", "Income Statement");
      expect(a).toBe(b);
    });
    test("query argument string is not mutated", () => {
      const q = "  EXPLORER  ";
      score(q, "explorer");
      expect(q).toBe("  EXPLORER  ");
    });
    test("title argument string is not mutated", () => {
      const t = "Income Statement";
      score("inc", t);
      expect(t).toBe("Income Statement");
    });
    test("function is referentially transparent across 100 calls", () => {
      // Use token-path inputs: title reorders tokens so substring path
      // can't fire → tokens={alpha,beta} ∩ {gamma,beta,alpha} → 60.
      const results = Array.from({ length: 100 }, () =>
        score("alpha beta", "gamma beta alpha"),
      );
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe(60);
    });
  });

  describe("edge cases", () => {
    test("very long query that exactly matches → 100", () => {
      const long = "a".repeat(500);
      expect(score(long, long)).toBe(100);
    });
    test("very long title with short query prefix → 90", () => {
      expect(score("a", "a" + "b".repeat(500))).toBe(90);
    });
    test("query longer than title → fall through to tokens", () => {
      expect(score("abcdefgh", "abc")).toBe(0);
    });
    test("numeric tokens score via overlap", () => {
      expect(score("2026 fy", "FY 2026 budget")).toBe(60);
    });
    test("punctuation-bearing query is matched at substring tier", () => {
      // "(ad" exists as a mid-substring in "Analyze (Ad Hoc)" — substring
      // tier (70) fires before token path can. (Token path WOULD see
      // qt={(ad}, tt={analyze,(ad,hoc)} → 1 hit → 50, but substring wins.)
      expect(score("(ad", "Analyze (Ad Hoc)")).toBe(70);
    });
    test("single-character query that matches exactly → 100", () => {
      expect(score("x", "x")).toBe(100);
    });
    test("unicode characters in exact match", () => {
      expect(score("café", "café")).toBe(100);
    });
    test("query equals empty token after trim → 0", () => {
      expect(score("   ", "anything")).toBe(0);
    });
  });

  describe("realistic Cmd-K palette routes", () => {
    test("typing 'inc' on Income Statement → 90", () => {
      expect(score("inc", "Income Statement")).toBe(90);
    });
    test("typing 'statement' on Income Statement → 70 (mid)", () => {
      expect(score("statement", "Income Statement")).toBe(70);
    });
    test("typing 'income statement' on Income Statement → 100", () => {
      expect(score("income statement", "Income Statement")).toBe(100);
    });
    test("typing 'forecast' on Forecasting → 90", () => {
      expect(score("forecast", "Forecasting")).toBe(90);
    });
    test("typing 'jobs' on Jobs Library → 90 (prefix)", () => {
      expect(score("jobs", "Jobs Library")).toBe(90);
    });
    test("typing 'library' on Jobs Library → 70 (mid)", () => {
      expect(score("library", "Jobs Library")).toBe(70);
    });
    test("typing 'cash flow' on Cash Flow → 100", () => {
      expect(score("cash flow", "Cash Flow")).toBe(100);
    });
    test("typing 'pivot' on Analyze (Ad Hoc) → 0", () => {
      expect(score("pivot", "Analyze (Ad Hoc)")).toBe(0);
    });
    test("typing 'analyze hoc' on Analyze (Ad Hoc) → 50 (1 token hit; 'hoc)' tokenises with trailing paren)", () => {
      expect(score("analyze hoc", "Analyze (Ad Hoc)")).toBe(50);
    });
  });
});
