import { resolveAxisSelection, type AxisResolveCtx } from "./resolve-axes";

function ctx(): AxisResolveCtx {
  return {
    dimensionCode: "entity",
    members: [
      { id: "grp",   code: "Apollo_Group" },
      { id: "in",    code: "IN_OPS" },
      { id: "us",    code: "US_HQ" },
      { id: "uk",    code: "UK_OPS" },
      { id: "del",   code: "DEL" },
      { id: "mum",   code: "MUM" },
      { id: "del1",  code: "DEL1" },
    ],
    edges: [
      { parentMemberId: "grp", childMemberId: "in" },
      { parentMemberId: "grp", childMemberId: "us" },
      { parentMemberId: "grp", childMemberId: "uk" },
      { parentMemberId: "in",  childMemberId: "del" },
      { parentMemberId: "in",  childMemberId: "mum" },
      { parentMemberId: "del", childMemberId: "del1" },
    ],
  };
}

describe("resolveAxisSelection", () => {
  it("all_leaves returns leaves only", () => {
    const r = resolveAxisSelection({ kind: "all_leaves" }, ctx()).sort();
    expect(r).toEqual(["del1","mum","uk"]);
  });
  it("manual keeps only ids that exist", () => {
    const r = resolveAxisSelection({ kind: "manual", memberIds: ["in","us","does_not_exist"] }, ctx()).sort();
    expect(r).toEqual(["in","us"]);
  });
  it("children_of returns direct children", () => {
    const r = resolveAxisSelection({ kind: "children_of", parentMemberId: "grp" }, ctx()).sort();
    expect(r).toEqual(["in","uk","us"]);
  });
  it("dsl(Children(Apollo_Group)) matches children_of", () => {
    const r = resolveAxisSelection({ kind: "dsl", expression: "Children(Apollo_Group)" }, ctx()).sort();
    expect(r).toEqual(["in","uk","us"]);
  });
  it("dsl mixed list dedups", () => {
    const r = resolveAxisSelection({ kind: "dsl", expression: "IN_OPS, Children(Apollo_Group), Self(IN_OPS)" }, ctx()).sort();
    expect(r).toEqual(["in","uk","us"]);
  });
  it("dsl Descendants(IN_OPS) walks subtree", () => {
    const r = resolveAxisSelection({ kind: "dsl", expression: "Descendants(IN_OPS)" }, ctx()).sort();
    expect(r).toEqual(["del","del1","mum"]);
  });
});
