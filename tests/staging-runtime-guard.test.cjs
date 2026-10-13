const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const code = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
const guardMatch = code.match(/function assertStagingSpreadsheetIsolation_\(\)\s*\{[\s\S]*?\n\}/);
const accessorMatch = code.match(/function getSpreadsheet_\(\)\s*\{[\s\S]*?\n\}/);
assert.ok(guardMatch, "extract actual runtime guard from Code.gs");
assert.ok(accessorMatch, "extract actual spreadsheet accessor from Code.gs");

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

// Run the actual guard and actual getSpreadsheet_ implementation from Code.gs.
vm.runInNewContext(
  guardMatch[0] + "\n" + accessorMatch[0],
  sandbox,
  { timeout: 1000 }
);

assert.throws(
  () => sandbox.getSpreadsheet_(),
  /STAGING SAFETY BLOCK/,
  "actual accessor must block shared CMS/VIP ID"
);
assert.equal(openByIdCalls, 0, "openById must not run for a shared ID");

sandbox.CONFIG.SPREADSHEET_ID = "staging-id";
assert.equal(sandbox.getSpreadsheet_().id, "staging-id");
assert.equal(openByIdCalls, 1, "separate staging ID should pass");

sandbox.CONFIG.STAGING_MODE = false;
sandbox.CONFIG.SPREADSHEET_ID = "shared-id";
assert.equal(sandbox.getSpreadsheet_().id, "shared-id");
assert.equal(openByIdCalls, 2, "non-staging mode remains unchanged");

console.log("PASS actual Code.gs accessor blocks shared ID before openById");
console.log("PASS separate staging ID is allowed");
console.log("PASS non-staging configuration remains unchanged");
console.log("PASS total: 3/3");
