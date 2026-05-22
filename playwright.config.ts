import { defineConfig } from "@playwright/test";

// Run smoke against the deployed preview URL by default. Override with
// BASE_URL=http://localhost:3000 to run against a local dev server.
const BASE_URL = process.env.BASE_URL
  ?? "https://metadata-module-git-metadata-v2-afc7b6-faizmnp-sources-projects.vercel.app";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,                    // per-test budget; smoke cases should be fast
  expect:  { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,        // catch leftover .only()s in CI
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",        // a trace.zip on every fail
    extraHTTPHeaders: {
      // Sent by Vercel to bypass deployment protection on preview URLs.
      // Configure VERCEL_AUTOMATION_BYPASS_SECRET in CI if your project
      // has deployment protection turned on.
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {}),
    },
  },
  projects: [
    { name: "api-smoke",     testMatch: /smoke\.spec\.ts$/ },
    { name: "coverage-full", testMatch: /coverage\.spec\.ts$/ },
    { name: "coverage-v2",   testMatch: /coverage2\.spec\.ts$/ },
  ],
});
