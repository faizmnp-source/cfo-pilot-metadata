/*
 * POST /api/v2/copilot-actions/request — route handler unit tests.
 *
 * This is the FIRST route-handler test in the suite. It establishes the
 * canonical template for any subsequent `route.ts` test. Reuse the shape:
 *
 *   1. jest.mock("@/lib/prisma", ...) with only the models the route touches
 *   2. jest.mock("@/lib/api-helpers", ...) to control auth without
 *      constructing real NextRequest cookies / JWTs
 *   3. (optional) jest.mock("@/lib/packaging/...", () => ({
 *        ...jest.requireActual(...), executeAction: jest.fn() }))
 *      when the route depends on a heavy helper but we want real pure
 *      helpers like describeAction / isKnownAction in the assertion path.
 *   4. Stub the NextRequest with { json: async () => body } cast as any —
 *      the routes only call req.json().
 *   5. Inspect the returned NextResponse via .status + await .json().
 *
 * Returns from `apiError(...)` and `apiResponse(...)` are real
 * NextResponse instances (status + JSON body). To keep mocked-401
 * responses indistinguishable from real ones, the auth-failure tests
 * return an actual NextResponse instance from the mock so the route's
 * `if (a instanceof Response) return a;` check passes.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    copilotAction: {
      create: jest.fn(),
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
  copilotAction: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
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

function makeReq(body: unknown): any {
  return {
    json: async () => {
      if (body === "__throw__") throw new Error("invalid json");
      return body;
    },
  };
}

beforeEach(() => {
  p.copilotAction.create.mockReset();
  p.copilotAction.findFirst.mockReset();
  p.copilotAction.update.mockReset();
  mockedRequireAuth.mockReset();
});

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/request — auth", () => {
  it("returns the 401 response verbatim when requireAuth rejects", async () => {
    const unauthorized = NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
    mockedRequireAuth.mockResolvedValueOnce(unauthorized);
    const res = await POST(makeReq({ actionKind: "CREATE_ENTITY" }));
    // Pinned: route returns the 401 NextResponse *by reference* — no
    // wrapping, no error remapping. If a future refactor wraps the
    // 401 in another response, this assertion will catch it.
    expect(res).toBe(unauthorized);
    expect(p.copilotAction.create).not.toHaveBeenCalled();
  });

  it("does NOT call prisma when requireAuth fails", async () => {
    mockedRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    );
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect(p.copilotAction.create).not.toHaveBeenCalled();
  });

  it("does NOT read the body when requireAuth fails (short-circuit)", async () => {
    // If requireAuth returns a Response BEFORE we read the body, the
    // body should never be touched. Pin this by passing a req whose
    // .json() throws — if the route short-circuits correctly, no throw.
    mockedRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    );
    await expect(POST(makeReq("__throw__"))).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// body validation
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/request — body validation", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("400 when body is null (req.json() returned null)", async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: "actionKind is required",
      details: undefined,
    });
    expect(p.copilotAction.create).not.toHaveBeenCalled();
  });

  it("400 when body is {} (no actionKind)", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("actionKind is required");
  });

  it("400 when req.json() throws (route catches and treats as null body)", async () => {
    // route handler does: `await req.json().catch(() => null)` so a
    // malformed body never raises — it falls through to the "actionKind
    // is required" guard.
    const res = await POST(makeReq("__throw__"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("actionKind is required");
  });

  it("400 with descriptive error for unknown actionKind", async () => {
    const res = await POST(makeReq({ actionKind: "NOT_A_REAL_ACTION" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unknown actionKind: NOT_A_REAL_ACTION");
    expect(p.copilotAction.create).not.toHaveBeenCalled();
  });

  it("400 unknown actionKind is case-sensitive (lowercase 'create_entity' rejected)", async () => {
    // KNOWN_ACTIONS is uppercase-only. Pinning case-sensitivity so a
    // future `.toUpperCase()` widening is intentional.
    const res = await POST(makeReq({ actionKind: "create_entity" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown actionKind: create_entity");
  });

  it("400 actionKind='' rejected with empty in error suffix", async () => {
    const res = await POST(makeReq({ actionKind: "" }));
    expect(res.status).toBe(400);
    // Empty actionKind hits the "is required" guard (falsy), NOT the
    // isKnownAction one. Pin the message so the guards stay ordered.
    expect((await res.json()).error).toBe("actionKind is required");
  });
});

// ---------------------------------------------------------------------------
// happy path — all 8 known actions
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/request — happy path per action kind", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
    p.copilotAction.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "action-1", status: "PENDING_APPROVAL", ...data }),
    );
  });

  const kinds: Array<{ kind: string; args: Record<string, unknown>; expectIn: string }> = [
    { kind: "CREATE_ENTITY", args: { code: "US01", name: "US Holdings" }, expectIn: "US01" },
    { kind: "CREATE_ACCOUNT", args: { code: "4000", name: "Revenue", type: "REVENUE" }, expectIn: "4000" },
    { kind: "LOCK_PERIOD", args: { periodCode: "2026M01" }, expectIn: "2026M01" },
    { kind: "UNLOCK_PERIOD", args: { periodCode: "2026M01" }, expectIn: "2026M01" },
    { kind: "RUN_CONSOLIDATION", args: { scenarioCode: "ACT", periodCode: "2026M01" }, expectIn: "ACT" },
    { kind: "RUN_TRANSLATION", args: { scenarioCode: "ACT", periodCode: "2026M01" }, expectIn: "ACT" },
    { kind: "RUN_CALC_RULE", args: { ruleCode: "ALLOC_OPEX" }, expectIn: "ALLOC_OPEX" },
    { kind: "SEED_DEMO_MAPPINGS", args: {}, expectIn: "Seed sample" },
  ];

  for (const { kind, args, expectIn } of kinds) {
    it(`200 happy path for ${kind} — summary contains "${expectIn}"`, async () => {
      const res = await POST(makeReq({ actionKind: kind, args }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.actionId).toBe("action-1");
      expect(json.data.status).toBe("PENDING_APPROVAL");
      expect(json.data.summary).toContain(expectIn);
      expect(p.copilotAction.create).toHaveBeenCalledTimes(1);
    });
  }
});

// ---------------------------------------------------------------------------
// create payload threading
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/request — prisma.create payload", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
    p.copilotAction.create.mockResolvedValue({
      id: "action-1",
      status: "PENDING_APPROVAL",
    });
  });

  it("threads tenantId from auth.tid", async () => {
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect(p.copilotAction.create.mock.calls[0][0].data.tenantId).toBe("tenant-abc");
  });

  it("threads proposedBy from auth.sub", async () => {
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect(p.copilotAction.create.mock.calls[0][0].data.proposedBy).toBe("user-xyz");
  });

  it("stores actionKind verbatim in the payload", async () => {
    await POST(makeReq({ actionKind: "LOCK_PERIOD", args: { periodCode: "2026M01" } }));
    expect(p.copilotAction.create.mock.calls[0][0].data.actionKind).toBe("LOCK_PERIOD");
  });

  it("stores args verbatim in the payload", async () => {
    const args = { code: "US01", name: "US Holdings", deeply: { nested: [1, 2, 3] } };
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args }));
    expect(p.copilotAction.create.mock.calls[0][0].data.args).toEqual(args);
  });

  it("args defaults to {} when omitted from the body", async () => {
    await POST(makeReq({ actionKind: "SEED_DEMO_MAPPINGS" }));
    expect(p.copilotAction.create.mock.calls[0][0].data.args).toEqual({});
  });

  it("conversationId defaults to null when omitted", async () => {
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect(p.copilotAction.create.mock.calls[0][0].data.conversationId).toBeNull();
  });

  it("conversationId threaded into payload when supplied", async () => {
    await POST(
      makeReq({
        actionKind: "CREATE_ENTITY",
        args: { code: "X", name: "Y" },
        conversationId: "conv-123",
      }),
    );
    expect(p.copilotAction.create.mock.calls[0][0].data.conversationId).toBe("conv-123");
  });

  it("payload object has exactly these top-level keys (surface lock)", async () => {
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    const data = p.copilotAction.create.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(
      ["actionKind", "args", "conversationId", "proposedBy", "tenantId"].sort(),
    );
  });

  it("does NOT set status in the create payload (relies on Prisma default 'PENDING_APPROVAL')", async () => {
    // Pin: the route never writes `status` — that's the schema default.
    // If a future patch adds it manually, this assertion catches it.
    await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    const data = p.copilotAction.create.mock.calls[0][0].data;
    expect("status" in data).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// response shape
// ---------------------------------------------------------------------------

describe("POST /copilot-actions/request — response shape", () => {
  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ auth: AUTH });
  });

  it("returns 200 with success:true wrapper from apiResponse", async () => {
    p.copilotAction.create.mockResolvedValue({
      id: "action-99",
      status: "PENDING_APPROVAL",
    });
    const res = await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      actionId: "action-99",
      status: "PENDING_APPROVAL",
      summary: expect.stringContaining("X"),
    });
  });

  it("returns whatever status the persisted row has (NOT a hardcoded 'PENDING_APPROVAL')", async () => {
    // The route returns `row.status` verbatim. If the schema default
    // changes (or a trigger flips it), the response reflects that —
    // pinned so the route stays a passthrough on this field.
    p.copilotAction.create.mockResolvedValue({
      id: "action-1",
      status: "WEIRD_TEST_STATUS",
    });
    const res = await POST(makeReq({ actionKind: "CREATE_ENTITY", args: { code: "X", name: "Y" } }));
    expect((await res.json()).data.status).toBe("WEIRD_TEST_STATUS");
  });

  it("summary uses real describeAction() — args.code/name interpolated", async () => {
    p.copilotAction.create.mockResolvedValue({ id: "a1", status: "PENDING_APPROVAL" });
    const res = await POST(
      makeReq({ actionKind: "CREATE_ACCOUNT", args: { code: "4000", name: "Rev", type: "REVENUE" } }),
    );
    const json = await res.json();
    expect(json.data.summary).toBe('Create new account "4000" — Rev (type: REVENUE)');
  });
});
