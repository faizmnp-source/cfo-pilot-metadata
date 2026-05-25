/*
 * POST /api/v2/copilot-actions/approve — route handler unit tests.
 *
 * Uses the route-handler test template established in
 * `src/app/api/v2/copilot-actions/request/route.test.ts`. The novelty
 * here is that this route depends on `executeAction()` (from
 * `@/lib/packaging/copilot-actions`), so we mock that one export but
 * keep the real pure helpers via jest.requireActual.
 *
 * Coverage:
 *  - Auth (401)
 *  - Body validation (missing actionId / malformed json)
 *  - 404 when action row not found (or wrong tenant — same filter)
 *  - 409 on every non-PENDING_APPROVAL status (APPROVED, EXECUTED,
 *    REJECTED, FAILED, custom strings)
 *  - Happy path: marks APPROVED, calls executeAction with the right
 *    ctx, marks EXECUTED, returns result
 *  - executeAction throws → marks FAILED, returns 500 with message
 *  - Tenant scoping in findFirst (auth.tid)
 *  - executionResult shape matches what executeAction returned
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    copilotAction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/api-helpers", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/packaging/copilot-actions", () => {
  const actual = jest.requireActual("@/lib/packaging/copilot-actions");
  return {
    ...actual,
    executeAction: jest.fn(),
  };
});

import { NextResponse } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { executeAction } from "@/lib/packaging/copilot-actions";

type MockedPrisma = {
  copilotAction: { findFirst: jest.Mock; update: jest.Mock };
};
const p = prisma as unknown as MockedPrisma;
const mockedRequireAuth = requireAuth as unknown as jest.Mock;
const mockedExecuteAction = executeAction as unknown as jest.Mock;

const AUTH = {
  sub: "user-xyz",
  tid: "tenant-abc",
  email: "u@x.com",
  name: "U",
  role: "ADMIN",
  iat: 0,
  exp: 0,
};

const PENDING_ROW = {
  id: "action-1",
  tenantId: "tenant-abc",
  actionKind: "CREATE_ENTITY",
  args: { code: "US01", name: "US Holdings" },
  status: "PENDING_APPROVAL",
};

function makeReq(body: unknown): any {
  return {
    json: async () => {
      if (body === "__throw__") throw new Error("invalid json");
      return body;
    },
  };
}

beforeEach(() => {
  p.copilotAction.findFirst.mockReset();
  p.copilotAction.update.mockReset();
  mockedRequireAuth.mockReset();
  mockedExecuteAction.mockReset();
});

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/approve — auth", () => {
  it("returns the 401 verbatim when requireAuth rejects", async () => {
    const unauthorized = NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
    mockedRequireAuth.mockResolvedValueOnce(unauthorized);
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res).toBe(unauthorized);
    expect(p.copilotAction.findFirst).not.toHaveBeenCalled();
    expect(p.copilotAction.update).not.toHaveBeenCalled();
    expect(mockedExecuteAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// body validation
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/approve — body validation", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("400 when body is null", async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });

  it("400 when actionId missing from the body", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
    expect(p.copilotAction.findFirst).not.toHaveBeenCalled();
  });

  it("400 when req.json() throws (caught → null body → 'actionId is required')", async () => {
    const res = await POST(makeReq("__throw__"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });

  it("400 when actionId is empty string (falsy check)", async () => {
    const res = await POST(makeReq({ actionId: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });
});

// ---------------------------------------------------------------------------
// 404 / 409 / tenant scoping
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/approve — row lookup", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("404 when copilotAction row not found", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ actionId: "missing-id" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Action not found");
    expect(p.copilotAction.update).not.toHaveBeenCalled();
    expect(mockedExecuteAction).not.toHaveBeenCalled();
  });

  it("findFirst filter is scoped to {id, tenantId} — cross-tenant lookups return null", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce(null);
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.findFirst.mock.calls[0][0]).toEqual({
      where: { id: "action-1", tenantId: "tenant-abc" },
    });
  });

  it("409 when row status is APPROVED (re-approve attempt)", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "APPROVED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is APPROVED, cannot approve");
    expect(mockedExecuteAction).not.toHaveBeenCalled();
  });

  it("409 when row status is EXECUTED", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "EXECUTED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is EXECUTED, cannot approve");
  });

  it("409 when row status is REJECTED", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "REJECTED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is REJECTED, cannot approve");
  });

  it("409 when row status is FAILED (cannot re-approve a failed action)", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "FAILED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is FAILED, cannot approve");
  });

  it("409 interpolates the verbatim status string (case-sensitive)", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "weird_lowercase" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is weird_lowercase, cannot approve");
  });
});

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/approve — happy path execution", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
    p.copilotAction.findFirst.mockResolvedValue(PENDING_ROW);
    p.copilotAction.update.mockResolvedValue({});
  });

  it("200 with EXECUTED status and executeAction's result", async () => {
    mockedExecuteAction.mockResolvedValueOnce({ entityId: "mem-1", code: "US01" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: {
        actionId: "action-1",
        status: "EXECUTED",
        result: { entityId: "mem-1", code: "US01" },
      },
    });
  });

  it("first update marks APPROVED with approvedBy + approvedAt(Date)", async () => {
    mockedExecuteAction.mockResolvedValueOnce({ ok: true });
    await POST(makeReq({ actionId: "action-1" }));
    const firstCall = p.copilotAction.update.mock.calls[0][0];
    expect(firstCall.where).toEqual({ id: "action-1" });
    expect(firstCall.data.status).toBe("APPROVED");
    expect(firstCall.data.approvedBy).toBe("user-xyz");
    expect(firstCall.data.approvedAt).toBeInstanceOf(Date);
  });

  it("calls executeAction with (actionKind, args, ctx) from the row + auth", async () => {
    mockedExecuteAction.mockResolvedValueOnce({ ok: true });
    await POST(makeReq({ actionId: "action-1" }));
    expect(mockedExecuteAction).toHaveBeenCalledTimes(1);
    expect(mockedExecuteAction).toHaveBeenCalledWith(
      "CREATE_ENTITY",
      { code: "US01", name: "US Holdings" },
      { tenantId: "tenant-abc", userId: "user-xyz" },
    );
  });

  it("second update marks EXECUTED with executedAt(Date) + executionResult", async () => {
    mockedExecuteAction.mockResolvedValueOnce({ entityId: "mem-1" });
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.update).toHaveBeenCalledTimes(2);
    const secondCall = p.copilotAction.update.mock.calls[1][0];
    expect(secondCall.where).toEqual({ id: "action-1" });
    expect(secondCall.data.status).toBe("EXECUTED");
    expect(secondCall.data.executedAt).toBeInstanceOf(Date);
    expect(secondCall.data.executionResult).toEqual({ entityId: "mem-1" });
  });

  it("update order: APPROVED first, then EXECUTED (audit trail order matters)", async () => {
    mockedExecuteAction.mockResolvedValueOnce({ ok: true });
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.update.mock.calls[0][0].data.status).toBe("APPROVED");
    expect(p.copilotAction.update.mock.calls[1][0].data.status).toBe("EXECUTED");
  });

  it("executeAction returning null/undefined is still treated as success", async () => {
    // Some actions (notably the delegated stubs) return non-null but
    // simple values. Pin that the happy path doesn't choke on a falsy
    // return — only thrown errors mark FAILED.
    mockedExecuteAction.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("EXECUTED");
  });
});

// ---------------------------------------------------------------------------
// execute failure
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/approve — execute failure", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
    p.copilotAction.findFirst.mockResolvedValue(PENDING_ROW);
    p.copilotAction.update.mockResolvedValue({});
  });

  it("500 when executeAction throws — wraps message", async () => {
    mockedExecuteAction.mockRejectedValueOnce(new Error("Entity dimension not configured"));
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(
      "Execution failed: Entity dimension not configured",
    );
  });

  it("marks FAILED with executionError (NOT EXECUTED) when executeAction throws", async () => {
    mockedExecuteAction.mockRejectedValueOnce(new Error("boom"));
    await POST(makeReq({ actionId: "action-1" }));
    // First update marks APPROVED (executor about to run); second marks FAILED.
    const failedCall = p.copilotAction.update.mock.calls[1][0];
    expect(failedCall.where).toEqual({ id: "action-1" });
    expect(failedCall.data.status).toBe("FAILED");
    expect(failedCall.data.executionError).toBe("boom");
    // Does NOT set executedAt on failure.
    expect("executedAt" in failedCall.data).toBe(false);
  });

  it("stringifies non-Error throws (e.g. throw 'literal') via String(e)", async () => {
    mockedExecuteAction.mockImplementationOnce(() => Promise.reject("literal-string"));
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Execution failed: literal-string");
    expect(p.copilotAction.update.mock.calls[1][0].data.executionError).toBe(
      "literal-string",
    );
  });

  it("APPROVED update still happens before the failure (audit-preserving)", async () => {
    // The route marks APPROVED first, THEN executes. So even if execution
    // fails, the audit trail records that approval happened.
    mockedExecuteAction.mockRejectedValueOnce(new Error("nope"));
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.update.mock.calls[0][0].data.status).toBe("APPROVED");
    expect(p.copilotAction.update.mock.calls[1][0].data.status).toBe("FAILED");
  });
});
