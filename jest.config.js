// Minimal Jest config — runs TypeScript via ts-jest for `*.test.ts` files
// under src/. No DOM, no Next.js — pure-math libs only for now.
//
// To add component tests later: switch to jest.config.next.js with jsdom.

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/dist/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  passWithNoTests: true,
  // Speed: skip type-checking inside tests (tsc handles that separately)
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
  },
};
