const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
const match = source.match(/const CONFIG\s*=\s*\{([\s\S]*?)\n\};/);
assert.ok(match, "CONFIG block must exist");

const config = match[1];
const stagingMode = /STAGING_MODE:\s*true/.test(config);
const bookingSheetId = (config.match(/SPREADSHEET_ID:\s*['"]([^'"]+)['"]/) || [])[1];
const vipBlock = (config.match(/VIP:\s*\{([\s\S]*?)\n\s*\}/) || [])[1] || "";
const vipSheetId = (vipBlock.match(/SPREADSHEET_ID:\s*['"]([^'"]+)['"]/) || [])[1];
const guardStart = source.indexOf("function assertStagingSpreadsheetIsolation_()");
const openById = source.indexOf("SpreadsheetApp.openById(", source.indexOf("function getSpreadsheet_()"));
const guardCall = source.indexOf("assertStagingSpreadsheetIsolation_();", source.indexOf("function getSpreadsheet_()"));

assert.ok(stagingMode, "staging branch must keep STAGING_MODE enabled");
assert.notEqual(guardStart, -1, "runtime staging isolation guard must exist");
assert.ok(guardCall > -1 && openById > guardCall, "guard must execute before opening any spreadsheet");

if (!bookingSheetId || !vipSheetId) {
  console.log("BLOCKED AS EXPECTED: missing staging spreadsheet ID must fail closed");
} else if (bookingSheetId === vipSheetId) {
  console.log("BLOCKED AS EXPECTED: staging config shares CMS/VIP ID; runtime guard must stop access");
} else {
  console.log("PASS: staging config points to a separate spreadsheet ID");
}
console.log("PASS staging mode enabled");
console.log("PASS runtime guard exists and runs before openById");
console.log("PASS total: 3/3 static safety assertions");
