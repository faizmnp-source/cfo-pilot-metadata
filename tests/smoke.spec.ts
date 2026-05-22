// Smoke suite — must pass before any merge to main.
// Runs against the deployed Vercel preview (configurable via BASE_URL).
//
// Maps to QA's smoke-tagged cases in the test plan artifact. Each test name
// carries the QA test id in brackets so failures are traceable end-to-end.
//
// Strategy: pure HTTP via the Playwright `request` fixture — no browser
// needed for the API surface. Full suite target: < 4 minutes.
//
// Run locally:   npx playwright test
// Run only smoke: npx playwright test smoke
// Run one case:   npx playwright test -g "REG-001"

import { test, expect, request as pwRequest } from "@playwright/test";

const DEMO_ADMIN = { email: "admin@demo.com", password: "admin123" };

// Shared authenticated request context so we don't re-login on every test.
let api: Awaited<ReturnType<typeof pwRequest.newContext>>;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  const r = await api.post("/api/auth/login", { data: DEMO_ADMIN });
  expect(r.ok(), `login failed: ${r.status()}`).toBeTruthy();
});

test.afterAll(async () => { await api.dispose(); });

const stamp = () => Date.now().toString(36).slice(-5);

test("[REG-001] demo admin POST /api/v2/members/account returns 201 (FK fix holds)", async () => {
  const code = "SMK_R001_" + stamp();
  const r = await api.post("/api/v2/members/account", {
    data: { memberCode: code, memberName: "smoke", properties: { account_type: "ASSET", time_balance: "LAST" } },
  });
  expect(r.status()).toBe(201);
  const body = await r.json();
  expect(body.data.id).toBeTruthy();
  // cleanup
  await api.delete(`/api/v2/members/account/${body.data.id}`);
});

test("[REG-005] legacy /api/metadata/accounts returns 410 with v2 pointer", async () => {
  const r = await api.get("/api/metadata/accounts");
  expect(r.status()).toBe(410);
  const body = await r.json();
  expect(body.replacement).toContain("/api/v2/members/account");
});

test("[V2A-001] create happy path returns 201 with full row", async () => {
  const code = "SMK_V001_" + stamp();
  const r = await api.post("/api/v2/members/account", {
    data: { memberCode: code, memberName: "happy", properties: { account_type: "ASSET", time_balance: "LAST" } },
  });
  expect(r.status()).toBe(201);
  const body = await r.json();
  expect(body.data.tenantId).toBe("demo-tenant");
  expect(body.data.properties.account_type).toBe("ASSET");
  await api.delete(`/api/v2/members/account/${body.data.id}`);
});

test("[V2A-002] duplicate memberCode returns 409", async () => {
  const code = "SMK_V002_" + stamp();
  const payload = { memberCode: code, memberName: "dup", properties: { account_type: "ASSET", time_balance: "LAST" } };
  const first = await api.post("/api/v2/members/account", { data: payload });
  expect(first.status()).toBe(201);
  const id = (await first.json()).data.id;
  const second = await api.post("/api/v2/members/account", { data: payload });
  expect(second.status()).toBe(409);
  await api.delete(`/api/v2/members/account/${id}`);
});

test("[V2A-003] invalid enum returns 422 with ALL Zod issues", async () => {
  const r = await api.post("/api/v2/members/account", {
    data: { memberCode: "SMK_V003_" + stamp(), memberName: "bad", properties: { account_type: "BANANA", time_balance: "BANANA2" } },
  });
  expect(r.status()).toBe(422);
  const body = await r.json();
  expect(body.details.issues.length).toBeGreaterThanOrEqual(2);
});

test("[FEAT-002] PATCH /api/v2/tenant-features toggles flag and returns full set", async () => {
  const r = await api.patch("/api/v2/tenant-features", { data: { intercompany_enabled: true } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.data.flags).toBeTruthy();
  expect(body.data.flags.intercompany_enabled).toBe(true);
});

test("[DIM-003] disabled dimension returns 409 on member route", async () => {
  // Disable ICP, expect 409, then restore.
  await api.patch("/api/v2/tenant-features", { data: { intercompany_enabled: false } });
  const blocked = await api.get("/api/v2/members/icp?pageSize=1");
  expect(blocked.status()).toBe(409);
  const body = await blocked.json();
  expect(body.error).toMatch(/disabled/i);
  // Restore
  await api.patch("/api/v2/tenant-features", { data: { intercompany_enabled: true } });
});

test("[HIER-001] create + child edge succeeds", async () => {
  const s = stamp();
  const p = await api.post("/api/v2/members/account", { data: { memberCode: "P_" + s, memberName: "P", properties: { account_type: "ASSET", time_balance: "LAST" } } });
  const c = await api.post("/api/v2/members/account", { data: { memberCode: "C_" + s, memberName: "C", properties: { account_type: "ASSET", time_balance: "LAST" } } });
  const pid = (await p.json()).data.id;
  const cid = (await c.json()).data.id;
  const e = await api.post("/api/v2/hierarchy/account", { data: { hierarchyCode: "default", parentMemberId: pid, childMemberId: cid, operator: "ADD", weight: 1 } });
  expect([200, 201]).toContain(e.status());
  await api.delete(`/api/v2/members/account/${pid}`);
  await api.delete(`/api/v2/members/account/${cid}`);
});

test("[HIER-003] direct cycle returns 409", async () => {
  const s = stamp();
  const a = await api.post("/api/v2/members/account", { data: { memberCode: "CY_A_" + s, memberName: "A", properties: { account_type: "ASSET", time_balance: "LAST" } } });
  const b = await api.post("/api/v2/members/account", { data: { memberCode: "CY_B_" + s, memberName: "B", properties: { account_type: "ASSET", time_balance: "LAST" } } });
  const aid = (await a.json()).data.id;
  const bid = (await b.json()).data.id;
  await api.post("/api/v2/hierarchy/account", { data: { hierarchyCode: "default", parentMemberId: aid, childMemberId: bid, operator: "ADD", weight: 1 } });
  const cyc = await api.post("/api/v2/hierarchy/account", { data: { hierarchyCode: "default", parentMemberId: bid, childMemberId: aid, operator: "ADD", weight: 1 } });
  expect(cyc.status()).toBe(409);
  await api.delete(`/api/v2/members/account/${aid}`);
  await api.delete(`/api/v2/members/account/${bid}`);
});

test("[DASH-002] dashboard stats endpoint returns numeric counts", async () => {
  const r = await api.get("/api/metadata/stats");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(typeof body.data.accounts).toBe("number");
  expect(typeof body.data.entities).toBe("number");
});

test("[XC-008] XSS payload in memberName stored raw (React escaping is UI-side)", async () => {
  const code = "SMK_XSS_" + stamp();
  const malicious = "<script>window.__pwned=true</script>HACKED";
  const r = await api.post("/api/v2/members/account", {
    data: { memberCode: code, memberName: malicious, properties: { account_type: "ASSET", time_balance: "LAST" } },
  });
  expect(r.status()).toBe(201);
  const body = await r.json();
  // Server stores the raw string — that's correct. UI-side escaping (LIB-012) verified separately.
  expect(body.data.memberName).toBe(malicious);
  await api.delete(`/api/v2/members/account/${body.data.id}`);
});

test("[V2A-013] soft-delete works", async () => {
  const code = "SMK_DEL_" + stamp();
  const created = await api.post("/api/v2/members/account", {
    data: { memberCode: code, memberName: "del", properties: { account_type: "ASSET", time_balance: "LAST" } },
  });
  const id = (await created.json()).data.id;
  const del = await api.delete(`/api/v2/members/account/${id}`);
  expect([200, 204]).toContain(del.status());
});

test("[V2A-017] soft-delete + restore round-trip", async () => {
  const code = "SMK_RST_" + stamp();
  const created = await api.post("/api/v2/members/account", {
    data: { memberCode: code, memberName: "restore", properties: { account_type: "ASSET", time_balance: "LAST" } },
  });
  const id = (await created.json()).data.id;
  await api.delete(`/api/v2/members/account/${id}`);
  const restored = await api.put(`/api/v2/members/account/${id}`, { data: { isActive: true } });
  expect([200, 204]).toContain(restored.status());
  await api.delete(`/api/v2/members/account/${id}`);
});
