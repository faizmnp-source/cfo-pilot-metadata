/*
 * Forms member-selection DSL.
 *
 * Tenants write things like:
 *   Children(Apollo_Group)
 *   Descendants(US_HQ)
 *   Ancestors(IN_OPS)
 *   Parents(IN_OPS)
 *   Level0(entity)
 *   Level1(entity)
 *   Self(IN_OPS)
 *   Relative(IN_OPS, -1)              -- one level up
 *   IN_OPS                             -- bare member codes still work
 *
 * Expressions can be composed with comma at the top level:
 *   Children(Apollo_Group), IN_OPS, Descendants(US_HQ)
 *
 * The parser only validates the AST. The evaluator (`resolveDsl`) walks
 * the hierarchy edge graph supplied by the caller — no DB inside this file.
 */

export type DslFnName =
  | "Children" | "Descendants" | "Ancestors" | "Parents"
  | "Self"     | "Relative"
  | "Level0"   | "Level1";

export type DslNode =
  | { kind: "MEMBER";   code: string }
  | { kind: "FN";       fn: DslFnName; args: string[] };

export class DslParseError extends Error {}

/* ─── Tokenizer ────────────────────────────────────────────────── */
type Token =
  | { type: "IDENT"; v: string }
  | { type: "NUM"; v: number }
  | { type: "LP" } | { type: "RP" } | { type: "COMMA" }
  | { type: "EOF" };

function tokenize(input: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { toks.push({ type: "LP" }); i++; continue; }
    if (c === ")") { toks.push({ type: "RP" }); i++; continue; }
    if (c === ",") { toks.push({ type: "COMMA" }); i++; continue; }
    // number (allow negative)
    if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i + 1;
      while (j < input.length && input[j] >= "0" && input[j] <= "9") j++;
      const s = input.slice(i, j);
      if (s !== "-") { toks.push({ type: "NUM", v: Number(s) }); i = j; continue; }
      // bare minus — fall through to ident path
    }
    // ident: letters / digits / _ / .
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.\-]/.test(input[j])) j++;
      toks.push({ type: "IDENT", v: input.slice(i, j) }); i = j; continue;
    }
    throw new DslParseError(`Unexpected character '${c}' at ${i}`);
  }
  toks.push({ type: "EOF" });
  return toks;
}

/* ─── Parser ───────────────────────────────────────────────────── */
const KNOWN_FNS = new Set<DslFnName>([
  "Children","Descendants","Ancestors","Parents","Self","Relative","Level0","Level1",
]);

export function parseDsl(input: string): DslNode[] {
  const toks = tokenize(input);
  let p = 0;
  const peek = () => toks[p];
  const eat  = (type: Token["type"]) => {
    const t = toks[p];
    if (t.type !== type) throw new DslParseError(`Expected ${type}, got ${t.type}`);
    p++; return t as any;
  };

  const parseNode = (): DslNode => {
    const id = eat("IDENT") as { type: "IDENT"; v: string };
    // Function call?
    if (peek().type === "LP") {
      eat("LP");
      if (!KNOWN_FNS.has(id.v as DslFnName)) {
        throw new DslParseError(`Unknown function "${id.v}". Allowed: ${Array.from(KNOWN_FNS).join(", ")}`);
      }
      const args: string[] = [];
      while (peek().type !== "RP") {
        const a = peek();
        if (a.type === "IDENT") { args.push(a.v); p++; }
        else if (a.type === "NUM") { args.push(String(a.v)); p++; }
        else throw new DslParseError(`Expected IDENT or NUM in args, got ${a.type}`);
        if (peek().type === "COMMA") p++;
      }
      eat("RP");
      return { kind: "FN", fn: id.v as DslFnName, args };
    }
    // Bare member code
    return { kind: "MEMBER", code: id.v };
  };

  const nodes: DslNode[] = [];
  if (peek().type !== "EOF") nodes.push(parseNode());
  while (peek().type === "COMMA") {
    p++;
    nodes.push(parseNode());
  }
  if (peek().type !== "EOF") {
    throw new DslParseError(`Unexpected ${peek().type} after expression`);
  }
  return nodes;
}

/* ─── Evaluator ────────────────────────────────────────────────── */
/**
 * The evaluator needs three lookups from the caller:
 *   - memberByCode(code)        → { id, code }
 *   - childrenOf(memberId)      → child ids
 *   - parentsOf(memberId)       → parent ids
 *   - allLeafIds(dimensionCode) → leaf ids of the dim (no children)
 *
 * This separation means /api/v2/forms can hand in prebuilt lookup
 * maps fetched once from prisma — no per-node DB hits.
 */
export type DslContext = {
  dimensionCode:         string;
  memberByCode:          (code: string) => { id: string; code: string } | undefined;
  childrenOf:            (memberId: string) => string[];
  parentsOf:             (memberId: string) => string[];
  allLeafIds:            (dimCode: string) => string[];
  // Optional: pre-filter levels by counting depth from the root
  level0Ids?:            (dimCode: string) => string[];
  level1Ids?:            (dimCode: string) => string[];
};

export function resolveNode(node: DslNode, ctx: DslContext): string[] {
  if (node.kind === "MEMBER") {
    const m = ctx.memberByCode(node.code);
    if (!m) throw new DslParseError(`Member "${node.code}" not found in dim "${ctx.dimensionCode}"`);
    return [m.id];
  }

  // FN
  const argMembers = node.args.map(a => {
    // Numeric args (e.g. Relative(X, -1)) — keep as string for now, fns parse
    const m = ctx.memberByCode(a);
    return m ? m.id : null;
  });

  switch (node.fn) {
    case "Self": {
      if (!argMembers[0]) throw new DslParseError(`Self() needs a valid member`);
      return [argMembers[0]];
    }
    case "Children": {
      if (!argMembers[0]) throw new DslParseError(`Children() needs a valid member`);
      return ctx.childrenOf(argMembers[0]);
    }
    case "Parents": {
      if (!argMembers[0]) throw new DslParseError(`Parents() needs a valid member`);
      return ctx.parentsOf(argMembers[0]);
    }
    case "Descendants": {
      if (!argMembers[0]) throw new DslParseError(`Descendants() needs a valid member`);
      const out = new Set<string>();
      const stack = [argMembers[0]];
      while (stack.length) {
        const id = stack.pop()!;
        const kids = ctx.childrenOf(id);
        for (const k of kids) {
          if (!out.has(k)) { out.add(k); stack.push(k); }
        }
      }
      return Array.from(out);
    }
    case "Ancestors": {
      if (!argMembers[0]) throw new DslParseError(`Ancestors() needs a valid member`);
      const out = new Set<string>();
      const stack = [argMembers[0]];
      while (stack.length) {
        const id = stack.pop()!;
        const parents = ctx.parentsOf(id);
        for (const p of parents) {
          if (!out.has(p)) { out.add(p); stack.push(p); }
        }
      }
      return Array.from(out);
    }
    case "Relative": {
      // Relative(M, k)  k>0 walks k generations of descendants; k<0 walks k generations up
      if (!argMembers[0]) throw new DslParseError(`Relative() needs a valid member as 1st arg`);
      const k = Number(node.args[1]);
      if (!Number.isInteger(k)) throw new DslParseError(`Relative()'s 2nd arg must be an integer`);
      let frontier = [argMembers[0]];
      const step = k > 0 ? ctx.childrenOf : ctx.parentsOf;
      const passes = Math.abs(k);
      for (let i = 0; i < passes; i++) {
        const next: string[] = [];
        for (const id of frontier) next.push(...step(id));
        frontier = Array.from(new Set(next));
        if (frontier.length === 0) break;
      }
      return frontier;
    }
    case "Level0": {
      const arg = node.args[0] ?? ctx.dimensionCode;
      return ctx.level0Ids ? ctx.level0Ids(arg) : ctx.allLeafIds(arg);
    }
    case "Level1": {
      const arg = node.args[0] ?? ctx.dimensionCode;
      if (ctx.level1Ids) return ctx.level1Ids(arg);
      // Fallback: members whose children are all leaves
      const leaves = new Set(ctx.allLeafIds(arg));
      // Find every member that has at least one child AND all children are leaves
      // Without a global member list we approximate: parents of any leaf
      const out = new Set<string>();
      Array.from(leaves).forEach(leaf => { for (const p of ctx.parentsOf(leaf)) out.add(p); });
      return Array.from(out);
    }
  }
}

export function resolveDsl(input: string, ctx: DslContext): string[] {
  const nodes = parseDsl(input);
  const out = new Set<string>();
  for (const n of nodes) { const ids = resolveNode(n, ctx); for (const id of ids) out.add(id); }
  return Array.from(out);
}
