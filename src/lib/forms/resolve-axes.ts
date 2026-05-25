/*
 * Resolves a DataForm axis selection into a concrete member id list.
 * Supported selection kinds (JSON):
 *   { kind: 'all_leaves' }
 *   { kind: 'children_of', parentMemberId: '<uuid>' }
 *   { kind: 'manual',      memberIds:      ['<uuid>', ...] }
 *   { kind: 'dsl',         expression:     'Children(Apollo_Group), IN_OPS' }   <-- NEW
 *
 * The 'dsl' kind is the Wk1 Sprint W1.2 addition. Parser + evaluator
 * live in src/lib/forms/member-dsl.ts. Plain-ID selections keep working.
 */
import { resolveDsl, type DslContext } from "./member-dsl";

export type AxisSelection =
  | { kind: "all_leaves" }
  | { kind: "children_of"; parentMemberId: string }
  | { kind: "manual";      memberIds: string[] }
  | { kind: "dsl";         expression: string };

export type AxisResolveCtx = {
  dimensionCode: string;
  members:       Array<{ id: string; code: string }>;       // all active members for the dim
  edges:         Array<{ parentMemberId: string; childMemberId: string }>;
};

/** Returns `string[]` of member IDs for the supplied axis selection. */
export function resolveAxisSelection(sel: AxisSelection, ctx: AxisResolveCtx): string[] {
  const memberByCode = (code: string) => {
    const m = ctx.members.find(x => x.code === code);
    return m ? { id: m.id, code: m.code } : undefined;
  };
  const memberById = (id: string) => ctx.members.find(x => x.id === id);
  const childrenOf = (memberId: string) =>
    ctx.edges.filter(e => e.parentMemberId === memberId).map(e => e.childMemberId);
  const parentsOf  = (memberId: string) =>
    ctx.edges.filter(e => e.childMemberId === memberId).map(e => e.parentMemberId);
  const parents = new Set(ctx.edges.map(e => e.parentMemberId));
  const allLeafIds = (_: string) => ctx.members.filter(m => !parents.has(m.id)).map(m => m.id);

  switch (sel.kind) {
    case "all_leaves": return allLeafIds(ctx.dimensionCode);
    case "manual":     return sel.memberIds.filter(id => !!memberById(id));
    case "children_of":
      return childrenOf(sel.parentMemberId);
    case "dsl": {
      const dslCtx: DslContext = {
        dimensionCode: ctx.dimensionCode,
        memberByCode, childrenOf, parentsOf, allLeafIds,
      };
      return resolveDsl(sel.expression, dslCtx);
    }
    default: return [];
  }
}
