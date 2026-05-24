/*
 * Unit tests for the ISO 4217 currency catalog used by Settings → App
 * Identity (base currency dropdown) and the Currency dimension setup.
 *
 * Covers:
 *   - ISO_4217 catalog shape (every entry has required keys, no duplicates,
 *     well-formed codes/decimals/regions)
 *   - ISO_CODES parallel array
 *   - ISO_BY_CODE lookup map
 *   - ISO_TOP "common currencies" list (membership, order, no duplicates)
 *   - Spot checks for currencies the app cares about (USD, EUR, INR, JPY,
 *     BHD, VND)
 *
 * No DB, no I/O. Pure data + lookup helpers. Pinned because the dropdown
 * order, the lookup-by-code hot path, and the decimals invariant (used to
 * format money throughout the app) all depend on this file.
 */

import {
  ISO_4217,
  ISO_CODES,
  ISO_BY_CODE,
  ISO_TOP,
  type IsoCurrency,
} from "./iso4217";

// ---------------------------------------------------------------------------
// Catalog shape
// ---------------------------------------------------------------------------

describe("ISO_4217 catalog", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(ISO_4217)).toBe(true);
    expect(ISO_4217.length).toBeGreaterThan(100);
  });

  it("every entry has the four required keys (code, name, symbol, decimals)", () => {
    for (const c of ISO_4217) {
      expect(typeof c.code).toBe("string");
      expect(typeof c.name).toBe("string");
      expect(typeof c.symbol).toBe("string");
      expect(typeof c.decimals).toBe("number");
    }
  });

  it("every code is exactly 3 uppercase A–Z letters", () => {
    const re = /^[A-Z]{3}$/;
    for (const c of ISO_4217) {
      expect(c.code).toMatch(re);
    }
  });

  it("every name and symbol is a non-empty trimmed string", () => {
    for (const c of ISO_4217) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.name.trim()).toBe(c.name);
      expect(c.symbol.length).toBeGreaterThan(0);
    }
  });

  it("every decimals value is 0, 2, or 3 (no fractional decimals, no other ISO values used)", () => {
    const allowed = new Set([0, 2, 3]);
    for (const c of ISO_4217) {
      expect(Number.isInteger(c.decimals)).toBe(true);
      expect(allowed.has(c.decimals)).toBe(true);
    }
  });

  it("region (when present) is one of the 6 known buckets", () => {
    const allowed = new Set([
      "Africa",
      "Americas",
      "Asia",
      "Europe",
      "Middle East",
      "Oceania",
    ]);
    for (const c of ISO_4217) {
      if (c.region !== undefined) {
        expect(allowed.has(c.region)).toBe(true);
      }
    }
  });

  it("contains no duplicate codes", () => {
    const codes = ISO_4217.map((c) => c.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("covers all 6 regions (every region bucket has at least one currency)", () => {
    const regions = new Set(
      ISO_4217.map((c) => c.region).filter((r): r is string => !!r)
    );
    expect(regions.size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// ISO_CODES parallel array
// ---------------------------------------------------------------------------

describe("ISO_CODES", () => {
  it("has the same length as ISO_4217", () => {
    expect(ISO_CODES.length).toBe(ISO_4217.length);
  });

  it("preserves the same order as ISO_4217", () => {
    for (let i = 0; i < ISO_4217.length; i++) {
      expect(ISO_CODES[i]).toBe(ISO_4217[i].code);
    }
  });

  it("contains only 3-letter uppercase strings", () => {
    const re = /^[A-Z]{3}$/;
    for (const code of ISO_CODES) {
      expect(code).toMatch(re);
    }
  });

  it("contains no duplicates", () => {
    expect(new Set(ISO_CODES).size).toBe(ISO_CODES.length);
  });
});

// ---------------------------------------------------------------------------
// ISO_BY_CODE lookup
// ---------------------------------------------------------------------------

describe("ISO_BY_CODE", () => {
  it("has one entry per ISO_4217 currency", () => {
    expect(Object.keys(ISO_BY_CODE).length).toBe(ISO_4217.length);
  });

  it("every key matches the .code of the value it points to", () => {
    for (const [key, val] of Object.entries(ISO_BY_CODE)) {
      expect(val.code).toBe(key);
    }
  });

  it("looks up USD → '$' symbol, 2 decimals", () => {
    const usd = ISO_BY_CODE["USD"];
    expect(usd).toBeDefined();
    expect(usd.symbol).toBe("$");
    expect(usd.decimals).toBe(2);
  });

  it("looks up INR → '₹' symbol, 2 decimals, name 'Indian Rupee'", () => {
    const inr = ISO_BY_CODE["INR"];
    expect(inr.symbol).toBe("₹");
    expect(inr.decimals).toBe(2);
    expect(inr.name).toBe("Indian Rupee");
  });

  it("returns undefined for an unknown code", () => {
    expect(ISO_BY_CODE["ZZZ"]).toBeUndefined();
    expect(ISO_BY_CODE["usd"]).toBeUndefined(); // case-sensitive
  });

  it("returns the same reference as the catalog entry (no clone)", () => {
    const usdFromMap = ISO_BY_CODE["USD"];
    const usdFromCatalog = ISO_4217.find((c) => c.code === "USD");
    expect(usdFromMap).toBe(usdFromCatalog);
  });
});

// ---------------------------------------------------------------------------
// Decimals invariants — the field used to format money throughout the app
// ---------------------------------------------------------------------------

describe("decimals invariants", () => {
  it("JPY uses 0 decimals (yen has no sub-unit)", () => {
    expect(ISO_BY_CODE["JPY"].decimals).toBe(0);
  });

  it("VND uses 0 decimals (đồng has no sub-unit in practice)", () => {
    expect(ISO_BY_CODE["VND"].decimals).toBe(0);
  });

  it("KRW uses 0 decimals", () => {
    expect(ISO_BY_CODE["KRW"].decimals).toBe(0);
  });

  it("BHD uses 3 decimals (Bahraini dinar = 1000 fils)", () => {
    expect(ISO_BY_CODE["BHD"].decimals).toBe(3);
  });

  it("KWD uses 3 decimals (Kuwaiti dinar = 1000 fils)", () => {
    expect(ISO_BY_CODE["KWD"].decimals).toBe(3);
  });

  it("most G10 currencies use 2 decimals", () => {
    for (const code of ["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "SGD", "CNY", "INR"]) {
      expect(ISO_BY_CODE[code].decimals).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// ISO_TOP — the 10 codes pinned to the top of the dropdown
// ---------------------------------------------------------------------------

describe("ISO_TOP", () => {
  it("contains exactly 10 codes", () => {
    expect(ISO_TOP.length).toBe(10);
  });

  it("contains no duplicates", () => {
    expect(new Set(ISO_TOP).size).toBe(ISO_TOP.length);
  });

  it("every entry is a 3-letter uppercase code", () => {
    const re = /^[A-Z]{3}$/;
    for (const code of ISO_TOP) {
      expect(code).toMatch(re);
    }
  });

  it("every entry exists in the ISO_4217 catalog", () => {
    for (const code of ISO_TOP) {
      expect(ISO_BY_CODE[code]).toBeDefined();
    }
  });

  it("USD is the first entry (the implicit base for dashboards)", () => {
    expect(ISO_TOP[0]).toBe("USD");
  });

  it("contains EUR, GBP, INR, JPY (the four most-asked-about non-USD)", () => {
    for (const code of ["EUR", "GBP", "INR", "JPY"]) {
      expect(ISO_TOP).toContain(code);
    }
  });

  it("preserves the documented ordering (USD/EUR/GBP/INR/JPY/CNY/AUD/CAD/CHF/SGD)", () => {
    expect(ISO_TOP).toEqual([
      "USD",
      "EUR",
      "GBP",
      "INR",
      "JPY",
      "CNY",
      "AUD",
      "CAD",
      "CHF",
      "SGD",
    ]);
  });
});

// ---------------------------------------------------------------------------
// IsoCurrency type sanity (compile-time + runtime)
// ---------------------------------------------------------------------------

describe("IsoCurrency type", () => {
  it("ISO_4217 entries are assignable to IsoCurrency", () => {
    // Compile-time check via explicit annotation; runtime check just asserts
    // the shape stayed compatible. If a new required field were added to the
    // type without backfilling the catalog, this would fail tsc, not jest.
    const sample: IsoCurrency = ISO_4217[0];
    expect(sample.code).toBeDefined();
  });
});
