/*
 * executeAction() unit tests — Phase 6 follow-up to commit b92b06c.
 *
 * This is the FIRST test in the suite that mocks `@/lib/prisma`. The
 * template below is the canonical pattern for any subsequent
 * prisma-touching surface (calc-rule executor, automation runner,
 * copilot-actions routes, etc.). Reuse the shape verbatim:
 *
 *   jest.mock("@/lib/prisma", () => ({ prisma: { ...named models } }));
 *   import { prisma } from "@/lib/prisma";
 *   const p = prisma as unknown as { dimension: { findFirst: jest.Mock }; ... };
 *
 * Why a separate file (not appended to copilot-actions.test.ts):
 *  - That file is intentionally pure-function (no prisma) and its
 *    header documents that contract. Keeping the prisma-mock variant
 *    in its own file preserves that boundary and makes the mock
 *    template easy to grep for.
 *
 * Coverage scope (executeAction only):
 *  - 8 action kinds × {happy / arg-guard / dimension-missing} branches
 *  - tenantId + userId context threading
 *  - Prisma call shape (exact where + data payloads)
 *  - Delegated-stub return shape (RUN_*, SEED_DEMO_MAPPINGS)
 *  - Unknown kind throw
 *
 * Pure-function tests (KNOWN_ACTIONS / isKnownAction / describeAction)
 * stay in copilot-actions.test.ts — don't add them here.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    dimension: { findFirst: jest.fn() },
    dimensionMember: { create: jest.fn() },
    closeRun: { updateMany: jest.fn() },
  },
}));

import { executeAction } from "./copilot-actions";
import { prisma } from "@/lib/prisma";

// Narrow the imported mock to a typed handle.
type MockedPrisma = {
  dimension: { findFirst: jest.Mock };
  dimensionMember: { create: jest.Mock };
  closeRun: { updateMany: jest.Mock };
};
const p = prisma as unknown as MockedPrisma;

const CTX = { tenantId: "tenant-abc", userId: "user-xyz" };

beforeEach(() => {
  p.dimension.findFirst.mockReset();
  p.dimensionMember.create.mockReset();
  p.closeRun.updateMany.mockReset();
});

describe("executeAction — CREATE_ENTITY", () => {
  it("throws when args.code is missing", async () => {
    await expect(executeAction("CREATE_ENTITY", { name: "X" }, CTX))
      .rejects.toThrow("code + name required");
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
  });

  it("throws when args.name is missing", async () => {
    await expect(executeAction("CREATE_ENTITY", { code: "E1" }, CTX))
      .rejects.toThrow("code + name required");
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
  });

  it("throws when args is null (entire object missing)", async () => {
    await expect(executeAction("CREATE_ENTITY", null, CTX))
      .rejects.toThrow("code + name required");
  });

  it("throws when args is undefined", async () => {
    await expect(executeAction("CREATE_ENTITY", undefined, CTX))
      .rejects.toThrow("code + name required");
  });

  it("throws 'Entity dimension not configured' when dimension lookup is null", async () => {
    p.dimension.findFirst.mockResolvedValueOnce(null);
    await expect(executeAction("CREATE_ENTITY", { code: "E1", name: "First" }, CTX))
      .rejects.toThrow("Entity dimension not configured");
    expect(p.dimension.findFirst).toHaveBeenCalledTimes(1);
    expect(p.dimensionMember.create).not.toHaveBeenCalled();
  });

  it("scopes dimension lookup by tenantId + code 'entity'", async () => {
    p.dimension.findFirst.mockResolvedValueOnce(null);
    await executeAction("CREATE_ENTITY", { code: "E1", name: "First" }, CTX).catch(() => {});
    expect(p.dimension.findFirst).toHaveBeenCalledWith({
      where: { tenantId: CTX.tenantId, code: "entity" },
    });
  });

  it("creates a DimensionMember and returns { entityId, code }", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-ent-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "mem-77", memberCode: "E1" });
    const out = await executeAction("CREATE_ENTITY", { code: "E1", name: "First" }, CTX);
    expect(out).toEqual({ entityId: "mem-77", code: "E1" });
  });

  it("threads tenantId + userId through to dimensionMember.create", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-ent-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "mem-99", memberCode: "X" });
    await executeAction("CREATE_ENTITY", { code: "X", name: "Y" }, CTX);
    expect(p.dimensionMember.create).toHaveBeenCalledTimes(1);
    const arg = p.dimensionMember.create.mock.calls[0][0];
    expect(arg.data.tenantId).toBe(CTX.tenantId);
    expect(arg.data.createdBy).toBe(CTX.userId);
    expect(arg.data.dimensionId).toBe("dim-ent-1");
    expect(arg.data.memberCode).toBe("X");
    expect(arg.data.memberName).toBe("Y");
    expect(arg.data.isActive).toBe(true);
  });
});

describe("executeAction — CREATE_ACCOUNT", () => {
  it("throws when args.code is missing", async () => {
    await expect(executeAction("CREATE_ACCOUNT", { name: "Cash" }, CTX))
      .rejects.toThrow("code + name required");
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
  });

  it("throws when args.name is missing", async () => {
    await expect(executeAction("CREATE_ACCOUNT", { code: "1010" }, CTX))
      .rejects.toThrow("code + name required");
  });

  it("throws 'Account dimension not configured' when dimension lookup is null", async () => {
    p.dimension.findFirst.mockResolvedValueOnce(null);
    await expect(executeAction("CREATE_ACCOUNT", { code: "1010", name: "Cash" }, CTX))
      .rejects.toThrow("Account dimension not configured");
    expect(p.dimensionMember.create).not.toHaveBeenCalled();
  });

  it("scopes dimension lookup by tenantId + code 'account'", async () => {
    p.dimension.findFirst.mockResolvedValueOnce(null);
    await executeAction("CREATE_ACCOUNT", { code: "1010", name: "Cash" }, CTX).catch(() => {});
    expect(p.dimension.findFirst).toHaveBeenCalledWith({
      where: { tenantId: CTX.tenantId, code: "account" },
    });
  });

  it("creates a DimensionMember and returns { accountId, code }", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-acct-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "acct-1", memberCode: "4010" });
    const out = await executeAction(
      "CREATE_ACCOUNT",
      { code: "4010", name: "Revenue", type: "REVENUE" },
      CTX,
    );
    expect(out).toEqual({ accountId: "acct-1", code: "4010" });
  });

  it("stores accountType inside properties JSON column", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-acct-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "acct-1", memberCode: "4010" });
    await executeAction(
      "CREATE_ACCOUNT",
      { code: "4010", name: "Revenue", type: "REVENUE" },
      CTX,
    );
    const arg = p.dimensionMember.create.mock.calls[0][0];
    expect(arg.data.properties).toEqual({ accountType: "REVENUE" });
  });

  it("defaults accountType to 'EXPENSE' when args.type omitted", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-acct-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "acct-2", memberCode: "9999" });
    await executeAction("CREATE_ACCOUNT", { code: "9999", name: "Unknown" }, CTX);
    const arg = p.dimensionMember.create.mock.calls[0][0];
    expect(arg.data.properties).toEqual({ accountType: "EXPENSE" });
  });

  it("threads tenantId + userId + dimensionId into create payload", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-acct-77" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "x", memberCode: "Y" });
    await executeAction("CREATE_ACCOUNT", { code: "Y", name: "Z", type: "ASSET" }, CTX);
    const arg = p.dimensionMember.create.mock.calls[0][0];
    expect(arg.data.tenantId).toBe(CTX.tenantId);
    expect(arg.data.createdBy).toBe(CTX.userId);
    expect(arg.data.dimensionId).toBe("dim-acct-77");
    expect(arg.data.isActive).toBe(true);
  });
});

describe("executeAction — LOCK_PERIOD", () => {
  it("throws when periodCode is missing", async () => {
    await expect(executeAction("LOCK_PERIOD", {}, CTX))
      .rejects.toThrow("periodCode required");
    expect(p.closeRun.updateMany).not.toHaveBeenCalled();
  });

  it("throws when args is null", async () => {
    await expect(executeAction("LOCK_PERIOD", null, CTX))
      .rejects.toThrow("periodCode required");
  });

  it("calls closeRun.updateMany filtered to status OPEN within tenant", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    await executeAction("LOCK_PERIOD", { periodCode: "2026-03" }, CTX);
    const call = p.closeRun.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId: CTX.tenantId,
      periodCode: "2026-03",
      status: "OPEN",
    });
  });

  it("sets status LOCKED + closedBy + closedAt(date) in update payload", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 2 });
    await executeAction("LOCK_PERIOD", { periodCode: "2026-04" }, CTX);
    const call = p.closeRun.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe("LOCKED");
    expect(call.data.closedBy).toBe(CTX.userId);
    expect(call.data.closedAt).toBeInstanceOf(Date);
  });

  it("returns { closeRunsUpdated } from prisma count (single match)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    const out = await executeAction("LOCK_PERIOD", { periodCode: "2026-05" }, CTX);
    expect(out).toEqual({ closeRunsUpdated: 1 });
  });

  it("returns count: 0 when no open close runs match (no-op happy path)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await executeAction("LOCK_PERIOD", { periodCode: "1999-01" }, CTX);
    expect(out).toEqual({ closeRunsUpdated: 0 });
  });

  it("returns count > 1 when multiple OPEN runs are locked together", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 7 });
    const out = await executeAction("LOCK_PERIOD", { periodCode: "2026-06" }, CTX);
    expect(out).toEqual({ closeRunsUpdated: 7 });
  });
});

describe("executeAction — UNLOCK_PERIOD", () => {
  it("throws when periodCode is missing", async () => {
    await expect(executeAction("UNLOCK_PERIOD", {}, CTX))
      .rejects.toThrow("periodCode required");
    expect(p.closeRun.updateMany).not.toHaveBeenCalled();
  });

  it("calls closeRun.updateMany filtered to status LOCKED (asymmetric vs LOCK)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    await executeAction("UNLOCK_PERIOD", { periodCode: "2026-03" }, CTX);
    const call = p.closeRun.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe("LOCKED");
    expect(call.where.tenantId).toBe(CTX.tenantId);
    expect(call.where.periodCode).toBe("2026-03");
  });

  it("sets status to REOPENED (audit-preserving, not back to OPEN)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    await executeAction("UNLOCK_PERIOD", { periodCode: "2026-03" }, CTX);
    const call = p.closeRun.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe("REOPENED");
  });

  it("does NOT set closedAt or closedBy on unlock (only LOCK_PERIOD writes those)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    await executeAction("UNLOCK_PERIOD", { periodCode: "2026-03" }, CTX);
    const call = p.closeRun.updateMany.mock.calls[0][0];
    expect(call.data.closedAt).toBeUndefined();
    expect(call.data.closedBy).toBeUndefined();
  });

  it("returns { closeRunsUpdated } verbatim from prisma count", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 3 });
    const out = await executeAction("UNLOCK_PERIOD", { periodCode: "2026-03" }, CTX);
    expect(out).toEqual({ closeRunsUpdated: 3 });
  });

  it("returns count: 0 when no LOCKED runs match (idempotent unlock)", async () => {
    p.closeRun.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await executeAction("UNLOCK_PERIOD", { periodCode: "1999-12" }, CTX);
    expect(out).toEqual({ closeRunsUpdated: 0 });
  });
});

describe("executeAction — delegated kinds (no prisma writes in Phase 6 v1)", () => {
  it("RUN_CONSOLIDATION returns delegated stub", async () => {
    const out = await executeAction("RUN_CONSOLIDATION", { scenarioCode: "ACTUAL", periodCode: "2026-03" }, CTX);
    expect(out).toEqual({
      delegated: true,
      note: "RUN_CONSOLIDATION should be wired to its dedicated /api/v2/processes/* endpoint in Phase 6.1",
    });
  });

  it("RUN_TRANSLATION returns delegated stub with kind interpolation", async () => {
    const out = await executeAction("RUN_TRANSLATION", { scenarioCode: "ACTUAL", periodCode: "2026-03" }, CTX);
    expect(out.delegated).toBe(true);
    expect(out.note).toContain("RUN_TRANSLATION");
    expect(out.note).toContain("Phase 6.1");
  });

  it("RUN_CALC_RULE returns delegated stub", async () => {
    const out = await executeAction("RUN_CALC_RULE", { ruleCode: "R1" }, CTX);
    expect(out.delegated).toBe(true);
    expect(out.note).toContain("RUN_CALC_RULE");
  });

  it("SEED_DEMO_MAPPINGS returns a static delegated note", async () => {
    const out = await executeAction("SEED_DEMO_MAPPINGS", {}, CTX);
    expect(out).toEqual({
      delegated: true,
      note: "Call POST /api/v2/mappings/seed-demo directly",
    });
  });

  it("delegated branches do NOT touch prisma", async () => {
    await executeAction("RUN_CONSOLIDATION", { scenarioCode: "X", periodCode: "Y" }, CTX);
    await executeAction("RUN_TRANSLATION", { scenarioCode: "X", periodCode: "Y" }, CTX);
    await executeAction("RUN_CALC_RULE", { ruleCode: "Z" }, CTX);
    await executeAction("SEED_DEMO_MAPPINGS", {}, CTX);
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
    expect(p.dimensionMember.create).not.toHaveBeenCalled();
    expect(p.closeRun.updateMany).not.toHaveBeenCalled();
  });

  it("delegated branches ignore args (no arg-validation throws)", async () => {
    await expect(executeAction("RUN_CONSOLIDATION", null, CTX)).resolves.toBeDefined();
    await expect(executeAction("RUN_TRANSLATION", undefined, CTX)).resolves.toBeDefined();
    await expect(executeAction("RUN_CALC_RULE", {}, CTX)).resolves.toBeDefined();
    await expect(executeAction("SEED_DEMO_MAPPINGS", null, CTX)).resolves.toBeDefined();
  });
});

describe("executeAction — unknown kind", () => {
  it("throws 'No executor for kind: X' for an unknown kind", async () => {
    await expect(executeAction("DELETE_PRODUCTION", {}, CTX))
      .rejects.toThrow("No executor for kind: DELETE_PRODUCTION");
  });

  it("throws for an empty-string kind (does not silently no-op)", async () => {
    await expect(executeAction("", {}, CTX))
      .rejects.toThrow("No executor for kind: ");
  });

  it("throws for a lowercased known kind (dispatch is case-sensitive)", async () => {
    await expect(executeAction("create_entity", { code: "X", name: "Y" }, CTX))
      .rejects.toThrow("No executor for kind: create_entity");
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
  });

  it("does NOT touch prisma when kind is unknown", async () => {
    await executeAction("HACK", {}, CTX).catch(() => {});
    expect(p.dimension.findFirst).not.toHaveBeenCalled();
    expect(p.dimensionMember.create).not.toHaveBeenCalled();
    expect(p.closeRun.updateMany).not.toHaveBeenCalled();
  });
});

describe("executeAction — context isolation", () => {
  it("uses CTX.tenantId verbatim — does not leak across tenants", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "m1", memberCode: "C" });
    await executeAction("CREATE_ENTITY", { code: "C", name: "C" }, { tenantId: "T-A", userId: "u" });
    expect(p.dimension.findFirst.mock.calls[0][0].where.tenantId).toBe("T-A");
    expect(p.dimensionMember.create.mock.calls[0][0].data.tenantId).toBe("T-A");
  });

  it("uses CTX.userId verbatim in createdBy / closedBy", async () => {
    p.dimension.findFirst.mockResolvedValueOnce({ id: "dim-1" });
    p.dimensionMember.create.mockResolvedValueOnce({ id: "m1", memberCode: "C" });
    await executeAction("CREATE_ENTITY", { code: "C", name: "C" }, { tenantId: "T", userId: "alice" });
    expect(p.dimensionMember.create.mock.calls[0][0].data.createdBy).toBe("alice");

    p.closeRun.updateMany.mockResolvedValueOnce({ count: 1 });
    await executeAction("LOCK_PERIOD", { periodCode: "P" }, { tenantId: "T", userId: "bob" });
    expect(p.closeRun.updateMany.mock.calls[0][0].data.closedBy).toBe("bob");
  });
});
