# Security Model — CFO Pilot

**Last updated:** 2026-05-25
**Audience:** engineers, auditors, customers' security teams.

---

## 1. Identity + tenant scoping

**Authentication.** JWT in HTTP-only `Secure SameSite=Lax` cookie. Issued on `/api/auth/login`, rotated on activity. Claims: `{ sub: userId, tid: tenantId, role }`.

**Tenant isolation.** Every Prisma query is gated through `requireAuth(req)` which returns `{ auth }`. Every `where` clause in every API route starts with `tenantId: auth.tid`. No cross-tenant reads are possible from the API layer.

**Role-based access.** `UserRole` enum: `ADMIN | FINANCE_MANAGER | FINANCE_USER | VIEWER`. Permissions live in `src/lib/permissions.ts`; route helpers (`requireAuthAndPermission(req, resource, action)`) check `can(role, resource, action)` before proceeding.

## 2. Data sensitivity tiers

| Tier | Examples | Storage | Access |
|---|---|---|---|
| **Public** | Tier marketing copy, account-type enums | `src/lib/packaging/tiers.ts` (in code) | Open |
| **Tenant-internal** | All `FactRow` values, `AuditLog`, `LineageNote`, `EntityOwnership` | Postgres, tenantId-scoped | JWT-authenticated tenant users |
| **User-private** | `UserPreference` (Cmd-K favourites/recents), `CopilotConversation` | Postgres, userId-scoped within tenant | Owner + tenant admin |
| **Secrets** | Anthropic / Modal / Vercel API keys | Vercel env vars, encrypted at rest | Server-side only |
| **Passwords** | `User.passwordHash` | bcrypt (cost factor 12) | Never returned over API |

## 3. AI safety

**Storyteller fallback.** `/api/v2/intelligence/explain` returns a deterministic paragraph when `ANTHROPIC_API_KEY` is unset. UI never fails because AI is down.

**Tool-use sandbox.** `/api/v2/copilot/chat` uses Anthropic tool definitions defined server-side in `src/lib/copilot/finance-skills/`. The model can ONLY call tools that exist there. Each tool's executor is server-validated; the model can't smuggle SQL.

**Write actions explicit-approval.** `/api/v2/copilot-actions/request` writes a row with `status='PENDING_APPROVAL'`. Execution happens only via `/api/v2/copilot-actions/approve` triggered by a human click. Action types are an allow-list (`KNOWN_ACTIONS` in `src/lib/packaging/copilot-actions.ts`).

**Prompt injection defence.** AI inputs (account names, dim labels) are surfaced verbatim in prompts but the system prompt explicitly says "use only the numbers + names provided; do not fabricate". Server validates returned action `kind` against the registry.

## 4. Audit trail

Every dimension mutation, hierarchy edit, calc rule change, and Copilot write action is logged to `AuditLog { entityType, entityId, action, before, after, metadata, userId, ipAddress, userAgent, createdAt }`. `/audit` page exposes this with filters + before/after JSON diff. Per Phase 1 lineage work, every `FactRow` write keeps prior `isCurrent=true` versions superseded so a value's history is always reconstructable.

## 5. Secret rotation

**Pending rotations (memory-pinned):**
| Secret | Pasted | Reason |
|---|---|---|
| `ANTHROPIC_API_KEY` | 2026-05-24 in chat | Storyteller + Copilot |
| `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` | 2026-05-25 in chat | Phase 4 forecasting |
| `VERCEL_TOKEN` | earlier (used by runner) | Env management |

All three should be rotated post-promotion. Process:
1. Generate new token at the provider.
2. Update Vercel env via `vercel env add` or web UI.
3. Update tenant-distributed config (if any) via runbook.
4. Old token continues to work until the provider revokes — explicitly revoke it in the same session.

## 6. Database safety

**Schema gating.** Production schema changes (`master` branch builds) skip `prisma db push` in `scripts/vercel-build.js`. Schema changes to prod require a deliberate `prisma db push` against the prod Neon DB (with the migration plan reviewed first). Preview branches auto-push to their isolated Neon branches.

**Soft delete by default.** Almost no model has `DELETE` enabled at the API layer; we mark `isActive=false` or `isCurrent=false`. Audit trail is preserved.

**Backup.** Neon provides point-in-time restore (7 days on Hobby, 14 days on Pro). For longer retention, the `Snapshot` model + `EXPORT_FACTS` automation job dump fact rows to S3/storage.

## 7. Network + browser

**HTTPS only.** Vercel auto-enforces.
**Cookies:** `HttpOnly`, `Secure`, `SameSite=Lax`. No tokens in localStorage.
**CSP:** TODO — add a `next.config.js` headers block restricting `script-src` to self + cdn.jsdelivr.net (for fonts) and `connect-src` to self + Modal endpoint + Anthropic API.

## 8. Compliance (in-scope for V1)

| Standard | Status |
|---|---|
| **SOC 2** | Type 1 prep in roadmap. Audit trail, access controls, encrypted secrets, backup all in place. |
| **DPDP (India)** | Tenant-scoped data; export/delete endpoints needed for a customer DSR. Roadmap. |
| **GDPR** | Not in immediate scope (India-first). Same DSR endpoints would cover. |
| **HIPAA** | Not in scope (no PHI). |

## 9. Threat model summary

**In scope to mitigate (V1):**
- Cross-tenant data leak via API ✅ (every query tenantId-scoped, tested)
- JWT theft via XSS ✅ (HttpOnly cookies)
- Schema drift between dev → prod ✅ (manual gate on master builds)
- AI write actions without consent ✅ (explicit per-action approval)
- Replay of stolen Modal token ✅ (token scoped to dev preview, rotation pending)

**Out of scope V1 — flagged for V2:**
- Postgres RLS policies (defence in depth beyond ORM-level scoping)
- Field-level encryption for `FactRow.valueReporting` (most sensitive)
- IP allow-lists per tenant
- SSO / SAML integration

---

End — SECURITY-MODEL.md
