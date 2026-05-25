#!/usr/bin/env node
// Vercel-build wrapper.
// Auto-pushes Prisma schema to the DB ONLY on preview branches
// (e.g. `dev`, `design-a`, `design-b`). Production (master) keeps the
// manual gate — schema changes only land in prod when a human runs
// `prisma db push` deliberately. This protects prod from accidental
// schema drift, while letting feature branches iterate freely.
//
// Triggered automatically by Vercel via the "vercel-build" script in
// package.json.

const { execSync } = require("node:child_process");

const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || "";
const env    = process.env.VERCEL_ENV || ""; // production | preview | development
const isProd = env === "production" || branch === "master" || branch === "main";

console.log(`[vercel-build] branch=${branch || "(unknown)"} env=${env || "(unknown)"} isProd=${isProd}`);

function run(cmd) {
  console.log(`[vercel-build] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  if (!isProd) {
    // Preview branches: push schema to their isolated Neon branch.
    // --accept-data-loss is FALSE; we only allow additive changes.
    // If a destructive change is queued, the build fails — which is exactly
    // what we want, so we can review before applying.
    console.log("[vercel-build] preview branch — running prisma db push");
    run("prisma db push --skip-generate");
  } else {
    console.log("[vercel-build] production — skipping schema push (manual gate)");
  }

  run("prisma generate");
  run("next build");
  process.exit(0);
} catch (e) {
  console.error("[vercel-build] FAILED", e?.message ?? e);
  process.exit(1);
}
