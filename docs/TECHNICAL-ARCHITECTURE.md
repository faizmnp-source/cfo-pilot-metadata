# Technical Architecture — CFO Pilot

**Last updated:** 2026-05-25 (post Wk3 autonomous build)
**Branch:** dev (preview: `metadata-module-git-dev-faizmnp-sources-projects.vercel.app`)
**Production:** master at commit `b550bd3` (untouched during Wk1–Wk3 expansion)

---

## 1. Top-level shape

```
┌─────────────────────────── Client (browser) ────────────────────────────┐
│  Next.js 14 App Router · React 18 · Atelier theme (Newsreader / Inter) │
│  UnifiedPovPicker · LineageDrawer · CommandPalette · charts (recharts) │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ fetch(credentials: "include")
┌────────────────────────────▼───────────────────────────────────────────┐
│  Next.js API routes · /api/v2/*                                        │
│  • requireAuth() — JWT cookie + role check                             │
│  • Prisma ORM → Neon Postgres (per-branch DB via Neon-Vercel integ.)   │
│  • LLM gateway → Anthropic Claude (Haiku 4.5 / Sonnet 4.6)             │
│  • Modal Python service → ARIMA/Prophet forecasting                    │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
┌────────────────────┐                ┌────────────────────────────────┐
│  Neon Postgres     │                │  Modal (Python · ARIMA/Prophet)│
│  per-branch DB     │                │  faiz-mnp--cfo-pilot-          │
│  (dev / master)    │                │  forecasting-forecast.modal.run│
└────────────────────┘                └────────────────────────────────┘
```

## 2. Runtime stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | Vercel | Per-branch preview URLs, edge functions, OIDC to Neon |
| DB | Neon Postgres (serverless) | Per-branch DB cloning; matches Vercel preview semantics |
| ORM | Prisma 6.19 | Strong typing, migrations, JSON columns |
| Web framework | Next.js 14 App Router | RSC + client islands, file-based API routes |
| Auth | JWT in HTTP-only cookie | Simple, works across server actions + API routes |
| AI gateway | Anthropic Messages API (Haiku 4.5 default, Sonnet 4.6 escalation) | Tool-use ready; storyteller + copilot tools |
| Forecasting | JS Holt-Winters / ensemble; Modal Python ARIMA/Prophet for higher fidelity | Scale-to-zero Python beats Vercel cold starts for stats libs |
| Charts | Recharts + custom SVG (heatmap) | Already in tree; tree-shakeable |
| Tests | Jest (unit) + Playwright (E2E) | Standard Next.js |

## 3. Module map (45% master spec covered after Wk3)

| Module | Page(s) | Schema | API surface |
|---|---|---|---|
| Dimension Library | `/metadata/library`, `/data/forms` | `Dimension`, `DimensionMember`, `Hierarchy`, `HierarchyEdge` | `/api/v2/members/*`, `/api/v2/hierarchy` |
| Forms + DSL | `/data/forms`, `/data/input` | `DataForm` + axis JSON | `/api/v2/forms/*` + `/preview-dsl`, `/[id]/resolve-axes` |
| Fact ingestion | `/data/load`, `/data/load/facts-import` | `FactRow`, `LoadBatch`, `FxRate` | `/api/v2/facts`, `/api/v2/data/import` |
| Mapping engine | `/mapping` | `MappingRule`, `MappingLearning` | `/api/v2/mappings/*` (CRUD, suggest, learn, approve, seed-demo) |
| Reports | `/reports/*` | (computed) | `/api/v2/reports/{trial-balance,income-statement,balance-sheet,cash-flow}` |
| Dashboard | `/dashboard`, `/explore` | (computed) | `/api/v2/dashboard/summary`, `/insights` |
| Ad Hoc | `/analyze`, `/analytics` | `AdHocView` | `/api/v2/analyze/pivot`, `/views/*` |
| Drill | (mounted on every page) | (computed) | `/api/v2/intelligence/top-contributors`, `/facts/by-intersection` |
| Lineage | (drawer) | `LineageNote` | `/api/v2/lineage/fact`, `/lineage/member` |
| Audit | `/audit` | `AuditLog` | `/api/v2/audit` |
| Close Mgmt | `/monthly-close` | `CloseRun`, `CloseTask` (with `screenTarget`) | `/api/v2/close-runs/*` |
| Workforce | `/workforce` | `DimensionMember.properties` for positions | `/api/v2/workforce/headcount`, `/forecast` |
| Forecasting | `/forecasting` | (computed) | `/api/v2/forecast/v2` (JS+Modal hybrid), `/save` |
| Allocations | `/allocations/library` | (uses `CalcRule` if persisted) | `/api/v2/allocations/{from-nl,run}` |
| Ownership | `/consolidation/ownership` | `EntityOwnership` | `/api/v2/ownership/*` + `/indirect` |
| Consolidation | `/process/consolidation` | `ProcessRun` | `/api/v2/processes/consolidation`, `/api/v2/consolidation/preview` |
| Calc Rules | `/rules` | `CalcRule`, `CalcRuleRun` | `/api/v2/calc-rules/*` |
| Automation | `/automation`, `/automation/monitor` | `AutomationJob`, `JobRun`, `JobDependency` | `/api/v2/jobs/*` (copy, clear, runs, retry) |
| AI Copilot | `/copilot` (sidebar + dashboard panel) | `CopilotConversation`, `CopilotMessage`, `AiCache`, `AiCallLog` | `/api/v2/copilot/chat`, `/copilot-actions/{request,approve,reject}` |
| Intelligence | (panels across pages) | (computed) | `/api/v2/intelligence/{kpis,explain,top-contributors}` |
| Discoverability | (Cmd-K palette) | `UserPreference` (cmdk_favourite, cmdk_recent) | `/api/v2/search/global`, `/recents`, `/favourites` |
| Packaging | `/select-package` (pre-login) | (none — static tier table) | (none) |

## 4. Cross-cutting concerns

**Multi-tenancy.** Every model carries `tenantId` and every query starts with `tenantId: auth.tid`. Cookie-based JWT scopes the tenant. Row-level security policies are deferred to a separate Postgres migration.

**Versioning + lineage.** Every `FactRow` write marks prior `isCurrent=true` rows as superseded and writes a new row with `version+1`. New `calcRunId`, `processRunId`, `prevVersionId` columns (W3 Phase 1) capture which calc or process produced the value. `LineageNote` lets humans annotate intersections.

**Origin tracking.** Every fact carries an `originId` pointing into the ORIGIN dimension (Import / Form / Calc / Consol / Translation / Elimination / Forecast / Copy / AI / Allocation). All UIs filter and label by origin.

**Intersection intelligence.** `src/lib/pov/types.ts` defines the canonical `PovSpec` shape. `<UnifiedPovPicker>` is mounted on /explore, /analyze, /analytics. `/api/v2/pov/resolve` translates codes → IDs in one bulk query with caching.

**Drill framework.** Three levels:
1. **Drill down** — `/api/v2/intelligence/top-contributors` aggregates by entity × account for a KPI.
2. **Drill through** — `/api/v2/facts/by-intersection` returns the actual `FactRow` rows for a (scenario, time-leaves, entity, account).
3. **Lineage** — `<LineageDrawer/>` shows version chain + origin chip + LoadBatch/CalcRun/ProcessRun for any fact.
Mounted on /explore tiles and all 4 reports' line items.

**AI surface.** Three usage tiers:
- **Read-only narrative** — `/api/v2/intelligence/explain` (Haiku) wraps any KPI with what/why/impact/action.
- **Tool-use Copilot** — `/api/v2/copilot/chat` (Haiku with finance-skill tool defs) answers natural-language questions, calls server tools.
- **Write actions** — `/api/v2/copilot-actions/request` queues an action as `PENDING_APPROVAL`; user must Approve before it executes (per the locked decision).

## 5. Build + deploy

**Vercel:** `npm run vercel-build` (see `scripts/vercel-build.js`):
- Preview branches (not master): runs `prisma db push --skip-generate` against the per-branch Neon DB before building.
- Master: skips schema push entirely. Schema changes to prod require a manual `prisma db push` run.

**Neon-Vercel integration:** auto-clones the main Neon DB to a fresh branch DB on first push of a new Vercel preview branch.

**Modal:** `modal deploy modal-services/forecasting/app.py` — pushes the ARIMA/Prophet service. Endpoint URL goes into Vercel env as `MODAL_ENDPOINT_URL` (Preview scope only on `dev`).

**Cowork-runner:** local Mac watchdog that picks up `.command` files dropped in `.cowork-runner/queue/`, executes shell scripts (typecheck → commit → push), logs results to `.cowork-runner/results/`. All Wk1–Wk3 work shipped via this pattern, never direct.

## 6. Environment variables

| Name | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | per-branch (Neon integ) | Prisma connection |
| `ANTHROPIC_API_KEY` | tenant-wide | Storyteller, Copilot |
| `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` | Preview/dev | Modal auth |
| `MODAL_ENDPOINT_URL` | Preview/dev | ARIMA/Prophet endpoint |
| `CRON_SECRET` | Production | AutomationJob cron auth (still needed in prod env) |
| `VERCEL_TOKEN` | (Faizan's dev box) | Used by runner for env mgmt |

## 7. Production-readiness gates (Phase 6 / Wk12 closeout)

Before `dev → master`:

1. `prisma db push` on master Neon (manual, with Faizan's eyes on the migration plan)
2. All Vercel env vars copied from Preview/dev to Production scope
3. Modal service confirmed reachable from production env
4. Smoke test against staging (= dev with master-shape DB)
5. Promote master branch on Vercel
6. Rotate the three pending tokens (Anthropic, Modal, Vercel) — see `docs/SECURITY-MODEL.md`
7. Tag release `v2.0.0-finance-os`

---

End — TECHNICAL-ARCHITECTURE.md
