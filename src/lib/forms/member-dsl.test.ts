import { parseDsl, resolveDsl, DslParseError, type DslContext } from "./member-dsl";

describe("parseDsl", () => {
  it("parses a bare member", () => {
    expect(parseDsl("IN_OPS")).toEqual([{ kind: "MEMBER", code: "IN_OPS" }]);
  });
  it("parses a function call", () => {
    expect(parseDsl("Children(Apollo_Group)")).toEqual([
      { kind: "FN", fn: "Children", args: ["Apollo_Group"] },
    ]);
  });
  it("parses Relative with a negative integer", () => {
    expect(parseDsl("Relative(IN_OPS, -1)")).toEqual([
      { kind: "FN", fn: "Relative", args: ["IN_OPS", "-1"] },
    ]);
  });
  it("parses multi-node comma list", () => {
    expect(parseDsl("Children(Apollo_Group), IN_OPS, Descendants(US_HQ)"))
      .toHaveLength(3);
  });
  it("rejects unknown functions", () => {
    expect(() => parseDsl("Bogus(X)")).toThrow(DslParseError);
  });
  it("Level0() with no arg parses", () => {
    expect(parseDsl("Level0()")).toEqual([{ kind: "FN", fn: "Level0", args: [] }]);
  });
});

/* ─── Tiny synthetic hierarchy for evaluator tests ────────────────
 *           Apollo_Group
 *           /     |     \
 *        IN_OPS  US_HQ  UK_OPS
 *        /  \      |
 *      DEL  MUM   NYC
 *      / \
 *    DEL1 DEL2
 */
function buildCtx(): DslContext {
  const tree: Record<string, string[]> = {
    "Apollo_Group": ["IN_OPS","US_HQ","UK_OPS"],
    "IN_OPS":       ["DEL","MUM"],
    "US_HQ":        ["NYC"],
    "UK_OPS":       [],
    "DEL":          ["DEL1","DEL2"],
    "MUM":          [],
    "NYC":          [],
    "DEL1":         [],
    "DEL2":         [],
  };
  // memberByCode just returns { id, code } where id == code for simplicity
  const memberByCode = (code: string) => (tree[code] !== undefined ? { id: code, code } : undefined);
  const childrenOf = (id: string) => tree[id] ?? [];
  const parents: Record<string, string[]> = {};
  for (const [parent, kids] of Object.entries(tree)) {
    for (const k of kids) { (parents[k] = parents[k] ?? []).push(parent); }
  }
  const parentsOf = (id: string) => parents[id] ?? [];
  const allLeafIds = (_: string) => Object.keys(tree).filter(k => tree[k].length === 0);
  return { dimensionCode: "entity", memberByCode, childrenOf, parentsOf, allLeafIds };
}

describe("resolveDsl on synthetic tree", () => {
  const ctx = buildCtx();
  it("Children(Apollo_Group) returns 3 direct children", () => {
    const r = resolveDsl("Children(Apollo_Group)", ctx);
    expect(r.sort()).toEqual(["IN_OPS","UK_OPS","US_HQ"]);
  });
  it("Descendants(IN_OPS) returns DEL,MUM,DEL1,DEL2 (any order)", () => {
    const r = resolveDsl("Descendants(IN_OPS)", ctx).sort();
    expect(r).toEqual(["DEL","DEL1","DEL2","MUM"]);
  });
  it("Ancestors(DEL1) returns DEL, IN_OPS, Apollo_Group", () => {
    const r = resolveDsl("Ancestors(DEL1)", ctx).sort();
    expect(r).toEqual(["Apollo_Group","DEL","IN_OPS"]);
  });
  it("Parents(DEL1) returns DEL", () => {
    expect(resolveDsl("Parents(DEL1)", ctx)).toEqual(["DEL"]);
  });
  it("Self(IN_OPS) returns IN_OPS", () => {
    expect(resolveDsl("Self(IN_OPS)", ctx)).toEqual(["IN_OPS"]);
  });
  it("Relative(IN_OPS, -1) walks one level up → Apollo_Group", () => {
    expect(resolveDsl("Relative(IN_OPS, -1)", ctx)).toEqual(["Apollo_Group"]);
  });
  it("Relative(Apollo_Group, 2) walks two levels down → leaves under children", () => {
    const r = resolveDsl("Relative(Apollo_Group, 2)", ctx).sort();
    // children of children: DEL, MUM, NYC
    expect(r).toEqual(["DEL","MUM","NYC"]);
  });
  it("Level0() returns all leaves of the synthetic tree", () => {
    const r = resolveDsl("Level0()", ctx).sort();
    expect(r).toEqual(["DEL1","DEL2","MUM","NYC","UK_OPS"]);
  });
  it("Level1() returns members whose children are all leaves", () => {
    const r = resolveDsl("Level1()", ctx).sort();
    // Parents of leaves: DEL, IN_OPS (parent of MUM leaf), US_HQ (parent of NYC), Apollo_Group (parent of UK_OPS leaf)
    expect(r).toContain("DEL");
    expect(r).toContain("US_HQ");
  });
  it("comma list deduplicates", () => {
    const r = resolveDsl("IN_OPS, Self(IN_OPS), Children(Apollo_Group)", ctx).sort();
    expect(r).toEqual(["IN_OPS","UK_OPS","US_HQ"]);
  });
  it("throws on unknown member", () => {
    expect(() => resolveDsl("Children(NO_SUCH_MEMBER)", ctx)).toThrow(DslParseError);
  });
});
