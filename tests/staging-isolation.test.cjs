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

assert.ok(stagingMode, "staging branch must keep STAGING_MODE enabled");
assert.ok(bookingSheetId, "booking spreadsheet ID must be explicit");
assert.ok(vipSheetId, "VIP spreadsheet ID must be explicit");
assert.notEqual(
  bookingSheetId,
  vipSheetId,
  "SAFETY BLOCK: staging booking data must not share the CMS/VIP spreadsheet"
);

console.log("PASS staging mode enabled");
console.log("PASS booking spreadsheet is configured");
console.log("PASS staging booking spreadsheet is separate from CMS/VIP");
