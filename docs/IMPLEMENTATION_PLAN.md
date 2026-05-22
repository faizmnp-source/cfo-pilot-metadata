# CFO Pilot — Metadata Engine Implementation Plan

**Status:** in progress · **Owner:** Faizan + agent team · **Updated:** 2026-05-21

Scope is intentionally limited to the **metadata engine**. No calculation, no
data loads, no consolidation in this plan. We make metadata work end-to-end
(load it, edit it, govern it) and then layer the rest on top.

## Slice 1 — Foundation

| # | Deliverable | Status |
|---|---|---|
| 1.1 | Generic `/api/v2/members/[dimension]` route (GET/POST/PUT/DELETE) with Zod-typed `properties` per dim | in progress |
| 1.2 | `/api/v2/hierarchy/[dimension]` route — add edge, remove edge, query tree, cycle detection | pending |
| 1.3 | `/api/v2/tenant-features` route — read/write feature flags; replaces localStorage | pending |
| 1.4 | App Settings lock — `isSetupComplete=true` → fields read-only with Admin "Unlock for editing" | pending |
| 1.5 | Drop `ignoreBuildErrors` in next.config — replace legacy routes with v2 calls or 410 stubs | pending |

**Ships:** schema is queryable end-to-end; settings can be locked; build is clean.

## Slice 2 — Manual Excel Upload

| # | Deliverable | Status |
|---|---|---|
| 2.1 | Per-dim Excel template generator (`/api/v2/template/[dimension]`) | pending |
| 2.2 | Upload UI (drag-drop) + xlsx parse | pending |
| 2.3 | Client-side parse + Zod validation (inline per-cell errors) | pending |
| 2.4 | Preview → Approve → bulk-write via `/api/v2/members/[dim]` | pending |

## Slice 3 — Member CRUD UI

| # | Deliverable | Status |
|---|---|---|
| 3.1 | Add Member form per dim — typed dropdowns for every enum | pending |
| 3.2 | Edit Member dialog with field-level diff before save | pending |
| 3.3 | Copy / Duplicate member | pending |
| 3.4 | Move member (reparent in hierarchy) | pending |
| 3.5 | Soft Delete with referential integrity check | pending |
| 3.6 | Multi-select bulk operations | pending |
| 3.7 | "Refresh app state" button (invalidate cache, re-fetch flags, re-render) | pending |

## Slice 4 — AI Upload

| # | Deliverable | Status | Depends |
|---|---|---|---|
| 4.1 | `/api/v2/ai/builder` — wires `metadata_builder.md` prompt to Claude SDK | pending | 1.1 |
| 4.2 | AI Upload UI — side-by-side source ↔ proposals with confidence badges | pending | 4.1 |
| 4.3 | Per-row approve + bulk-approve high-confidence (≥95%) | pending | 4.2 |
| 4.4 | Reject + teach loop (per-tenant memory) | pending | 4.2 |
| 4.5 | Conflict surfacing (both options, user picks) | pending | 4.2 |

## Slice 5 — Polish + Handoff

| # | Deliverable | Status |
|---|---|---|
| 5.1 | Excel round-trip (export + re-import with diff) | pending |
| 5.2 | Audit log on every CRUD + import + AI approval | pending |
| 5.3 | Hierarchy view with drag-drop reparenting | pending |
| 5.4 | Test suite — qa's 10 cases minimum | pending |
| 5.5 | Remove localStorage fallbacks on Time + Currency pages | pending |

## Sequencing

```
Slice 1  →  Slice 2  →  Slice 3
   ↓                       
   └────→  Slice 4  ─→  Slice 5
```

Slices 2 and 3 can run in parallel after Slice 1.
Slice 4 starts after Slice 1 only.
Slice 5 is polish after 2/3/4 land.

## Design principles (non-negotiable)

- **Member IDs are UUIDs, never source codes.** Source codes can be renamed; UUIDs cannot.
- **Hierarchies live in a separate table** with operator (+/-/~), weight, effective dates, cycle detection on write.
- **AI proposes, human approves.** AI routes return proposals; only the application writes after explicit approval.
- **Tenant isolation everywhere.** Every query carries `tenant_id`. No cross-tenant leaks.
- **Typed enums, never magic strings.** AccountType, TimeBalance, StorageType, AggregationOperator, VarianceType, CurrencyBehavior are all enums.
- **Money is `numeric`, never float.** Postgres `numeric` in DB, `decimal.js` in app. Lint-enforced.
