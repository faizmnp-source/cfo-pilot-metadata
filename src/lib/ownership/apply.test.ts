import { applyOwnership, rollupWithOwnership, makeOwnershipLookup } from "./apply";

const edges = [
  // GRP owns IN 100% directly
  { parentId: "GRP", childId: "IN", pct: 100 },
  // IN owns DEL 80% — so GRP indirectly owns 80% of DEL
  { parentId: "IN",  childId: "DEL", pct: 80 },
  // IN owns MUM 60%
  { parentId: "IN",  childId: "MUM", pct: 60 },
  // Separate branch: GRP owns US 50%
  { parentId: "GRP", childId: "US", pct: 50 },
];

describe("applyOwnership", () => {
  it("returns 100% for self", () => {
    const r = applyOwnership("IN", [{ subsidiaryId: "IN", value: 100 }], edges);
    expect(r[0].pctOwned).toBe(1);
    expect(r[0].adjustedValue).toBe(100);
  });

  it("applies direct ownership", () => {
    const r = applyOwnership("GRP", [{ subsidiaryId: "IN", value: 1000 }], edges);
    expect(r[0].pctOwned).toBe(1);
    expect(r[0].adjustedValue).toBe(1000);
  });

  it("applies indirect ownership (GRP → IN → DEL = 100% × 80% = 80%)", () => {
    const r = applyOwnership("GRP", [{ subsidiaryId: "DEL", value: 100 }], edges);
    expect(r[0].pctOwned).toBeCloseTo(0.8, 5);
    expect(r[0].adjustedValue).toBeCloseTo(80, 5);
  });

  it("applies partial direct ownership (GRP → US 50%)", () => {
    const r = applyOwnership("GRP", [{ subsidiaryId: "US", value: 200 }], edges);
    expect(r[0].pctOwned).toBe(0.5);
    expect(r[0].adjustedValue).toBe(100);
  });

  it("returns 0% when no path exists", () => {
    const r = applyOwnership("DEL", [{ subsidiaryId: "US", value: 100 }], edges);
    expect(r[0].pctOwned).toBe(0);
    expect(r[0].adjustedValue).toBe(0);
    expect(r[0].ownershipNote).toBe("no ownership");
  });
});

describe("rollupWithOwnership", () => {
  it("sums DEL + MUM + IN ownership-adjusted into GRP", () => {
    const r = rollupWithOwnership("GRP", [
      { subsidiaryId: "IN",  value: 1000 },   // 100% → 1000
      { subsidiaryId: "DEL", value: 500 },    //  80% → 400
      { subsidiaryId: "MUM", value: 200 },    //  60% → 120
      { subsidiaryId: "US",  value: 1000 },   //  50% → 500
    ], edges);
    expect(r.total).toBeCloseTo(2020, 5);
    expect(r.lines).toHaveLength(4);
  });

  it("excludes subsidiaries the parent doesn't own", () => {
    const r = rollupWithOwnership("DEL", [
      { subsidiaryId: "US",  value: 5000 },   // no path
      { subsidiaryId: "MUM", value: 5000 },   // no path (sibling, not descendant)
    ], edges);
    expect(r.total).toBe(0);
  });
});

describe("makeOwnershipLookup", () => {
  it("returns a reusable lookup", () => {
    const lk = makeOwnershipLookup(edges);
    expect(lk("GRP", "IN")).toBe(1);
    expect(lk("GRP", "DEL")).toBeCloseTo(0.8, 5);
    expect(lk("GRP", "US")).toBe(0.5);
    expect(lk("US",  "DEL")).toBe(0);
  });
});
