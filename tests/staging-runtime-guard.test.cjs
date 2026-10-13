const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const code = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
const match = code.match(/function assertStagingSpreadsheetIsolation_\(\)\s*\{[\s\S]*?\n\}/);
assert.ok(match, "extract the actual runtime guard from Code.gs");
const actualGuard = match[0];

let openByIdCalls = 0;
const sandbox = {
  CONFIG: {
    STAGING_MODE: true,
    SPREADSHEET_ID: "shared-id",
    VIP: { SPREADSHEET_ID: "shared-id" }
  },
  SpreadsheetApp: {
    openById(id) {
      openByIdCalls += 1;
      return { id };
    }
  }
};

// Execute the guard taken from Code.gs, not a duplicated test-only copy.
vm.runInNewContext(
  actualGuard + `
    function getSpreadsheetGuardHarness_() {
      assertStagingSpreadsheetIsolation_();
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
  `,
  sandbox,
  { timeout: 1000 }
);

assert.throws(
  () => sandbox.getSpreadsheetGuardHarness_(),
  /STAGING SAFETY BLOCK/,
  "actual guard from Code.gs must block shared CMS/VIP ID"
);
assert.equal(openByIdCalls, 0, "openById must not run for a shared ID");

sandbox.CONFIG.SPREADSHEET_ID = "staging-id";
assert.equal(sandbox.getSpreadsheetGuardHarness_().id, "staging-id");
assert.equal(openByIdCalls, 1, "separate staging ID should pass the guard");

sandbox.CONFIG.STAGING_MODE = false;
sandbox.CONFIG.SPREADSHEET_ID = "shared-id";
assert.equal(sandbox.getSpreadsheetGuardHarness_().id, "shared-id");
assert.equal(openByIdCalls, 2, "non-staging mode remains unchanged");

console.log("PASS actual Code.gs guard blocks shared ID before openById");
console.log("PASS separate staging ID is allowed");
console.log("PASS non-staging configuration remains unchanged");
console.log("PASS total: 3/3");
