/*
 * POST /api/v2/copilot-actions/reject — route handler unit tests.
 *
 * Uses the route-handler test template established in
 * `src/app/api/v2/copilot-actions/request/route.test.ts`. This route is
 * the simplest of the three — no executeAction call, single prisma
 * update — so the suite is narrower but covers the same defense layers.
 *
 * Coverage:
 *  - Auth (401)
 *  - Body validation (missing actionId / malformed json)
 *  - 404 when row not found (and tenant-scoping in findFirst)
 *  - 409 on every non-PENDING_APPROVAL status (APPROVED, EXECUTED,
 *    REJECTED, FAILED, weird strings)
 *  - Happy path: marks REJECTED with rejectedBy + rejectedAt(Date) +
 *    rejectionReason (null when reason omitted, verbatim when supplied)
 *  - Idempotency footgun: re-rejecting a REJECTED row → 409 (NOT silent
 *    no-op) — pinned because audit trail demands it.
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

import { NextResponse } from "next/server";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

type MockedPrisma = {
  copilotAction: { findFirst: jest.Mock; update: jest.Mock };
};
const p = prisma as unknown as MockedPrisma;
const mockedRequireAuth = requireAuth as unknown as jest.Mock;

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
});

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/reject — auth", () => {
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
  });
});

// ---------------------------------------------------------------------------
// body validation
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/reject — body validation", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("400 when body is null", async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });

  it("400 when actionId missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });

  it("400 when req.json() throws", async () => {
    const res = await POST(makeReq("__throw__"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });

  it("400 when actionId is empty string", async () => {
    const res = await POST(makeReq({ actionId: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionId is required");
  });
});

// ---------------------------------------------------------------------------
// 404 / 409 / tenant scoping
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/reject — row lookup", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("404 when copilotAction row not found", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ actionId: "missing" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Action not found");
    expect(p.copilotAction.update).not.toHaveBeenCalled();
  });

  it("findFirst scoped to {id, tenantId} (cross-tenant returns null)", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce(null);
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.findFirst.mock.calls[0][0]).toEqual({
      where: { id: "action-1", tenantId: "tenant-abc" },
    });
  });

  it("409 when row status is APPROVED", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "APPROVED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is APPROVED, cannot reject");
  });

  it("409 when row status is EXECUTED", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "EXECUTED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is EXECUTED, cannot reject");
  });

  it("409 when row status is REJECTED — re-reject is NOT a silent no-op", async () => {
    // Pinned: a second reject must surface as 409, not 200 — the audit
    // trail demands a single rejection event. If a future patch decides
    // to make this idempotent, this test will catch it and force an
    // intentional contract change.
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "REJECTED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is REJECTED, cannot reject");
    expect(p.copilotAction.update).not.toHaveBeenCalled();
  });

  it("409 when row status is FAILED", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "FAILED" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is FAILED, cannot reject");
  });

  it("409 interpolates the verbatim status (case-sensitive)", async () => {
    p.copilotAction.findFirst.mockResolvedValueOnce({ ...PENDING_ROW, status: "custom_state" });
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Action status is custom_state, cannot reject");
  });
});

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/reject — happy path", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
    p.copilotAction.findFirst.mockResolvedValue(PENDING_ROW);
    p.copilotAction.update.mockResolvedValue({});
  });

  it("200 with REJECTED status in response", async () => {
    const res = await POST(makeReq({ actionId: "action-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { actionId: "action-1", status: "REJECTED" },
    });
  });

  it("update marks status:REJECTED with rejectedBy + rejectedAt(Date)", async () => {
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.update).toHaveBeenCalledTimes(1);
    const call = p.copilotAction.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "action-1" });
    expect(call.data.status).toBe("REJECTED");
    expect(call.data.rejectedBy).toBe("user-xyz");
    expect(call.data.rejectedAt).toBeInstanceOf(Date);
  });

  it("rejectionReason defaults to null when body.reason omitted", async () => {
    await POST(makeReq({ actionId: "action-1" }));
    expect(p.copilotAction.update.mock.calls[0][0].data.rejectionReason).toBeNull();
  });

  it("rejectionReason stored verbatim when body.reason supplied", async () => {
    await POST(makeReq({ actionId: "action-1", reason: "Wrong entity hierarchy" }));
    expect(p.copilotAction.update.mock.calls[0][0].data.rejectionReason).toBe(
      "Wrong entity hierarchy",
    );
  });

  it("rejectionReason empty string passes through (NOT coerced to null)", async () => {
    // body.reason ?? null only fires on null/undefined. An empty string
    // is preserved. Pin so a future trim/coalesce is intentional.
    await POST(makeReq({ actionId: "action-1", reason: "" }));
    expect(p.copilotAction.update.mock.calls[0][0].data.rejectionReason).toBe("");
  });

  it("update payload has exactly these top-level keys (surface lock)", async () => {
    await POST(makeReq({ actionId: "action-1", reason: "ack" }));
    const data = p.copilotAction.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(
      ["rejectedAt", "rejectedBy", "rejectionReason", "status"].sort(),
    );
  });

  it("does NOT set approvedAt / executedAt / executionResult on reject", async () => {
    // Negative pin: REJECT is its own audit hop, must never write
    // approval / execution fields.
    await POST(makeReq({ actionId: "action-1" }));
    const data = p.copilotAction.update.mock.calls[0][0].data;
    expect("approvedAt" in data).toBe(false);
    expect("approvedBy" in data).toBe(false);
    expect("executedAt" in data).toBe(false);
    expect("executionResult" in data).toBe(false);
  });
});
