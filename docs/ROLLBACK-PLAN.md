# Rollback Plan — Finance OS expansion

**Trigger:** Any of the conditions in `docs/DEPLOYMENT-PLAN.md` §6.
**Owner:** Faizan (primary), AI on standby for execution support.
**Worst-case rollback time:** 30 minutes (Vercel revert + Neon PITR).
**Typical rollback time:** 5 minutes (Vercel revert only).

---

## 1. Decision tree

```
Problem detected
   │
   ├─ Is it a UI bug only?  ─────────────► REVERT (Vercel)
   │
   ├─ Is it a new endpoint failing?  ───► REVERT (Vercel)
   │     (existing endpoints still work because schema was additive)
   │
   ├─ Is it an existing endpoint broken? ► REVERT (Vercel) + investigate
   │
   ├─ Is it a data integrity problem?  ─► REVERT (Vercel) + FREEZE writes +
   │                                       Neon PITR to pre-promotion snapshot
   │
   └─ Catastrophic (all tenants down)? ─► REVERT (Vercel) + page Faizan
```

The schema changes shipped in Wk3 are **additive only** (new nullable columns + new tables). A Vercel-only revert leaves the prod DB with extra tables/columns that the old code ignores. Safe.

## 2. Step-by-step — Vercel revert (5 min)

```bash
# From your Mac
cd cfo-pilot-metadata
git checkout master

# Find the last known-good prod commit (b550bd3 is the pre-promotion sha)
LAST_GOOD=b550bd3
git revert HEAD --no-edit         # creates a revert commit, faster than reset --hard
git push origin master
```
Vercel auto-deploys the revert in ~60s. Production URL goes back to the pre-promotion state.

**Alternative — Vercel one-click rollback:**
1. Vercel dashboard → `metadata-module` → Deployments
2. Find the last deployment before promotion (commit `b550bd3`)
3. Click `…` → "Promote to Production"
4. Confirms in ~10s, no git work needed

## 3. Step-by-step — DB rollback (only if needed)

The additive schema is safe to leave in place. Only restore DB if there's actual data corruption:

```bash
# Neon dashboard → cfo-pilot-metadata project → Backups
# Find a PITR snapshot from before the promotion timestamp
# Click Restore → creates a NEW branch (e.g. "main-restored-2026-05-25")
# Verify on the new branch, then swap the prod DATABASE_URL in Vercel env to point at it.
```

**Important:** Never `prisma db push` a schema revert. Drop tables only if you've confirmed no tenant wrote to them since promotion.

## 4. Communications

**Within 5 min of incident:**
Post in #cfo-pilot:
> 🚨 P1 incident — reverting Finance OS expansion. Cause: <one-liner>. ETA back to last-known-good: 5 min. Watch #ops for updates.

**Within 30 min:**
Send to tenant admins:
> We rolled back the new Finance OS modules due to <one-liner>. Existing functionality (dashboard, reports, monthly close) is unaffected. New modules (Ad Hoc, Visual Analytics, Allocations Library, Cmd-K) will return after a fix. Sorry for the disruption.

**Within 24 hr:**
Post-mortem doc in /docs/postmortem/ following the engineering:incident-response skill template.

## 5. Post-rollback steps

- [ ] Open a `STATUS-ROLLBACK-2026-MM-DD.md` in `.cowork-runner/results/` with the root cause hypothesis
- [ ] Add a Playwright test that would have caught the bug
- [ ] Hold any dev → master merges until the test is in CI + green
- [ ] Schedule a post-mortem with Faizan within 48 hrs

## 6. What's *not* in scope of rollback

The following stay live on dev preview regardless of prod rollback:
- All shipped pages (`metadata-module-git-dev-...vercel.app` keeps working)
- All shipped APIs on dev
- The Modal forecasting service (deployed independently)
- The dev Neon branch (per-branch DB clone)

So a prod rollback doesn't kill the development environment. Iteration can continue.

## 7. The five fastest rollback levers

| # | Lever | Time | Reversibility |
|---|---|---|---|
| 1 | Vercel one-click "Promote to Production" | 10s | Trivial |
| 2 | `git revert HEAD && git push` | 60s | Trivial |
| 3 | Toggle Vercel env var off (e.g. unset `ANTHROPIC_API_KEY` → Storyteller falls back) | instant | Trivial |
| 4 | Disable a single API route via a feature flag in `tenant_features` | 1 min | Trivial |
| 5 | Neon PITR to pre-promotion snapshot | 5–10 min | Data-loss for anything written after snapshot |

Always exhaust 1–4 before considering 5.

---

End — ROLLBACK-PLAN.md
