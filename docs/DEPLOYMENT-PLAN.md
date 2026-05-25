# Deployment Plan — dev → master promotion

**Last updated:** 2026-05-25
**Source:** dev branch at HEAD (currently `a583d1d` post-W3.16)
**Target:** master at `b550bd3` (last touched before Wk1 autonomous build)

---

## 1. Pre-flight checklist (do these BEFORE pressing Merge)

### A. Code state
- [ ] `git checkout dev && git pull && ./node_modules/.bin/tsc --noEmit` returns clean
- [ ] `npm test` runs (Jest unit tests) — aim 100% pass; 60%+ coverage on `src/lib/*`
- [ ] `npm run test:smoke` (Playwright) runs against dev preview URL — all green
- [ ] Inspect `git log master..dev --oneline` — confirm no surprise commits
- [ ] Check `.cowork-runner/results/STATUS-NEEDS-INPUT-*.md` — none should be unresolved

### B. Schema state
- [ ] On dev Neon branch: `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → empty
- [ ] Diff against production schema: should add (additive only) the W3 schema columns/tables:
  - `FactRow.calcRunId`, `processRunId`, `prevVersionId` (nullable)
  - 3 new fact_rows indexes
  - New tables: `lineage_notes`, `mapping_rules`, `mapping_learning`, `adhoc_views`, `copilot_actions`, `entity_ownership`, `job_dependencies`, `user_preferences`
  - `JobRun.retryCount`, `JobRun.retryBackoffMs` (defaults)

### C. Environment
- [ ] All Vercel env vars present in Production scope:
  - `DATABASE_URL` (production Neon main branch)
  - `ANTHROPIC_API_KEY`
  - `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `MODAL_ENDPOINT_URL`
  - `CRON_SECRET`
- [ ] Modal endpoint reachable from a production-scope build (test with `curl -X POST $MODAL_ENDPOINT_URL`)

### D. Data
- [ ] Backup taken of production Neon DB (Neon → PITR snapshot, manual checkpoint)
- [ ] Sample tenant's facts exported via `/api/v2/jobs/copy` dryRun=true — row counts sane

## 2. Promotion steps (in order)

### Step 1 — Push schema to production Neon (manual gate)
```bash
# From your Mac, with .env pointed at PRODUCTION Neon
cd cfo-pilot-metadata
git checkout master
git merge dev --no-ff -m "Promote Finance OS expansion (dev → master)"
git push origin master      # do NOT push yet — see step 2 first

# Apply schema additively
DATABASE_URL=$PROD_NEON_URL ./node_modules/.bin/prisma db push --skip-generate
```

**Stop and verify** — query `\dt` on prod Neon — confirm the 8 new tables exist and no rows yet.

### Step 2 — Push master
```bash
git push origin master
```
Vercel auto-deploys. `scripts/vercel-build.js` will detect `master` and skip the `prisma db push`, just regenerate the client.

### Step 3 — Smoke prod
Verify on production URL (`metadata-module.vercel.app`):
1. Existing `/dashboard` still loads with FY26 Apollo data (no regression).
2. `/audit` shows the audit log (new page, should be empty for prod tenants on first load).
3. `/mapping` loads empty state.
4. `/analyze` loads (pick Account × Time, click Run).
5. `/analytics` charts load.
6. `/explore` shows KPIs + Risks tile + Recommended Actions tile.
7. Cmd-K works.
8. `/select-package` is public.

### Step 4 — Cron + jobs
- [ ] `CRON_SECRET` set → enable AutomationJob cron in Vercel cron settings.
- [ ] Trigger one Modal forecast call to keep the service warm: `curl -X POST .../api/v2/forecast/v2 -d '{...}'` with a real session cookie.

### Step 5 — Tag + announce
```bash
git tag -a v2.0.0-finance-os -m "Finance OS expansion — 15 spec sections shipped"
git push --tags
```
Announce in Slack / email tenant admins about the new pages.

## 3. Post-deploy verification (24 hrs)

- [ ] No 5xx alerts in Vercel logs for `/api/v2/*`
- [ ] Anthropic cost dashboard within expected envelope (Storyteller fires ~1× per page open)
- [ ] Modal usage < 5% of free credit per day
- [ ] Neon connection pool not saturating (Neon dashboard → Connections)
- [ ] At least one tenant admin successfully completed: Cmd-K → /analyze → pivot → save view

## 4. Communications

**Internal:** Post in #cfo-pilot Slack with the dev → master commit range link and a 5-bullet summary of new pages.

**Tenants:** Send email to all admin users:
> Subject: New in CFO Pilot — Ad Hoc Analysis, Visual Analytics, AI Commentary
> 12 new modules went live today including Ad Hoc pivot tables, Visual Analytics charts, Smart Mapping, Allocations Library, and Cmd-K global search. Login at metadata-module.vercel.app. No action needed; everything is opt-in via the sidebar.

## 5. Bake time

Hold at master for at least 48 hours before queuing further dev branch changes. Watch error rates, Anthropic spend, and Modal invocations. Lift the freeze when:
- 0 P1 incidents
- Anthropic spend < ₹500/day
- Modal invocations < 1000/day

## 6. Rollback trigger

If any of these happen in the first 24 hrs:
- > 1% 5xx rate on `/api/v2/*`
- A schema migration error reported by tenant
- Data integrity issue in an existing tenant's facts
→ trigger ROLLBACK-PLAN.md

---

End — DEPLOYMENT-PLAN.md
