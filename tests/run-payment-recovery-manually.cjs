#!/usr/bin/env node
"use strict";

// Manual, isolated runner for the three payment partial-failure regression tests.
// This file intentionally has no CI/workflow trigger. Run from the repository root:
//   node tests/run-payment-recovery-manually.cjs

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const tests = [
  "payment-approval-discount-token-recovery.test.cjs",
  "payment-rejection-audit-recovery.test.cjs",
  "telegram-approval-queue-audit-recovery.test.cjs",
];

let failed = false;
for (const test of tests) {
  console.log("\n=== Manual recovery test: " + test + " ===");
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    console.error("Could not start test:", result.error.message);
    failed = true;
    break;
  }
  if (result.status !== 0) {
    console.error("FAILED:", test, "exit status", result.status);
    failed = true;
    break;
  }
}
if (failed) process.exitCode = 1;
else console.log("\nAll three isolated recovery checks completed.");
