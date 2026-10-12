const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(new URL("../Code.gs", import.meta.url), "utf8");
const startMarker = "function normalizePaymentConsistencyStatusPure_(value) {";
const endMarker = "function validatePaymentSubmissionPreflightPure_(rows, bookingId) {";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert.notEqual(start, -1, "payment consistency pure functions must exist");
assert.ok(end > start, "pure function section must have a valid end marker");

const sandbox = {};
vm.runInNewContext(source.slice(start, end), sandbox, { timeout: 1000 });

const tests = [
  ["classification", sandbox.testPaymentSubmissionConsistencyClassificationPure_],
  ["recovery plan", sandbox.testPaymentConsistencyRecoveryPlanPure_],
  ["read-only diagnostic report", sandbox.testPaymentConsistencyDiagnosticReportPure_],
];

let totalPassed = 0;
for (const [name, testFn] of tests) {
  assert.equal(typeof testFn, "function", `${name}: test function must exist`);
  const result = testFn();
  assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.failed)}`);
  assert.equal(result.noSheetRead, true, `${name}: must not read sheets`);
  assert.equal(result.noSheetWrite, true, `${name}: must not write sheets`);
  assert.equal(result.noExternalCalls, true, `${name}: must not call external services`);
  totalPassed += result.passed;
  console.log(`PASS ${name}: ${result.passed}/${result.total}`);
}
console.log(`PASS total: ${totalPassed}/${totalPassed}`);
