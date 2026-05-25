/*
 * CopilotAction registry — KNOWN_ACTIONS lists every write the Copilot
 * is allowed to propose. Each has a describe() (human one-liner shown
 * in the approval dialog) and an execute() (runs after human approves).
 *
 * Adding a new action: add to KNOWN_ACTIONS + add a describe/execute branch.
 */

import { prisma } from "@/lib/prisma";

export const KNOWN_ACTIONS = [
  "CREATE_ENTITY",
  "CREATE_ACCOUNT",
  "LOCK_PERIOD",
  "UNLOCK_PERIOD",
  "RUN_CONSOLIDATION",
  "RUN_TRANSLATION",
  "RUN_CALC_RULE",
  "SEED_DEMO_MAPPINGS",
] as const;
export type ActionKind = (typeof KNOWN_ACTIONS)[number];

export function isKnownAction(k: string): k is ActionKind {
  return (KNOWN_ACTIONS as readonly string[]).includes(k);
}

export function describeAction(kind: string, args: any): string {
  switch (kind) {
    case "CREATE_ENTITY":      return `Create new entity "${args?.code}" — ${args?.name}`;
    case "CREATE_ACCOUNT":     return `Create new account "${args?.code}" — ${args?.name} (type: ${args?.type})`;
    case "LOCK_PERIOD":        return `Lock period ${args?.periodCode} — no further postings allowed`;
    case "UNLOCK_PERIOD":      return `Unlock period ${args?.periodCode}`;
    case "RUN_CONSOLIDATION":  return `Run consolidation for ${args?.scenarioCode}/${args?.periodCode}`;
    case "RUN_TRANSLATION":    return `Run FX translation for ${args?.scenarioCode}/${args?.periodCode}`;
    case "RUN_CALC_RULE":      return `Run calc rule ${args?.ruleCode}`;
    case "SEED_DEMO_MAPPINGS": return `Seed sample MappingRules for the tenant`;
    default:                   return `${kind} with args ${JSON.stringify(args)}`;
  }
}

export type ExecCtx = { tenantId: string; userId: string };

export async function executeAction(kind: string, args: any, ctx: ExecCtx): Promise<any> {
  switch (kind) {
    case "CREATE_ENTITY": {
      if (!args?.code || !args?.name) throw new Error("code + name required");
      const dim = await prisma.dimension.findFirst({ where: { tenantId: ctx.tenantId, code: "entity" }});
      if (!dim) throw new Error("Entity dimension not configured");
      const m = await prisma.dimensionMember.create({
        data: { tenantId: ctx.tenantId, dimensionId: dim.id, memberCode: args.code, memberName: args.name, isActive: true, createdBy: ctx.userId },
      });
      return { entityId: m.id, code: m.memberCode };
    }
    case "CREATE_ACCOUNT": {
      if (!args?.code || !args?.name) throw new Error("code + name required");
      const dim = await prisma.dimension.findFirst({ where: { tenantId: ctx.tenantId, code: "account" }});
      if (!dim) throw new Error("Account dimension not configured");
      const m = await prisma.dimensionMember.create({
        data: { tenantId: ctx.tenantId, dimensionId: dim.id, memberCode: args.code, memberName: args.name, isActive: true, properties: { accountType: args.type ?? "EXPENSE" } as any, createdBy: ctx.userId },
      });
      return { accountId: m.id, code: m.memberCode };
    }
    case "LOCK_PERIOD": {
      if (!args?.periodCode) throw new Error("periodCode required");
      const run = await prisma.closeRun.updateMany({
        where: { tenantId: ctx.tenantId, periodCode: args.periodCode, status: "OPEN" },
        data:  { status: "LOCKED", closedAt: new Date(), closedBy: ctx.userId },
      });
      return { closeRunsUpdated: run.count };
    }
    case "UNLOCK_PERIOD": {
      if (!args?.periodCode) throw new Error("periodCode required");
      const run = await prisma.closeRun.updateMany({
        where: { tenantId: ctx.tenantId, periodCode: args.periodCode, status: "LOCKED" },
        data:  { status: "REOPENED" },
      });
      return { closeRunsUpdated: run.count };
    }
    case "RUN_CONSOLIDATION":
    case "RUN_TRANSLATION":
    case "RUN_CALC_RULE": {
      // These delegate to existing internal endpoints — defer to those.
      return { delegated: true, note: `${kind} should be wired to its dedicated /api/v2/processes/* endpoint in Phase 6.1` };
    }
    case "SEED_DEMO_MAPPINGS": {
      // No-op stub; the real seed endpoint already exists at /api/v2/mappings/seed-demo
      return { delegated: true, note: "Call POST /api/v2/mappings/seed-demo directly" };
    }
    default: throw new Error(`No executor for kind: ${kind}`);
  }
}
