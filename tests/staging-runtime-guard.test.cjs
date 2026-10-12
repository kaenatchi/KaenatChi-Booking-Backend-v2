const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = "function assertStagingSpreadsheetIsolation_() {\n  const bookingSpreadsheetId = String(CONFIG.SPREADSHEET_ID || '').trim();\n  const vipSpreadsheetId = String(\n    CONFIG.VIP && CONFIG.VIP.SPREADSHEET_ID || ''\n  ).trim();\n\n  if (\n    CONFIG.STAGING_MODE === true &&\n    bookingSpreadsheetId &&\n    vipSpreadsheetId &&\n    bookingSpreadsheetId === vipSpreadsheetId\n  ) {\n    throw new Error(\n      'STAGING SAFETY BLOCK: Booking staging points to the CMS/VIP spreadsheet. ' +\n      'Configure a dedicated staging spreadsheet before any sheet access.'\n    );\n  }\n\n  return true;\n}\n\n\nfunction getSpreadsheet_() {\n\n  // This must run before openById so a misconfigured staging branch fails closed.\n  assertStagingSpreadsheetIsolation_();\n\n  const spreadsheet = SpreadsheetApp.openById(\n    CONFIG.SPREADSHEET_ID\n  );\n\n  if (!spreadsheet) {\n    throw new Error('اتصال به KaenatChi CMS برقرار نشد.');\n  }\n\n  return spreadsheet;\n}\n\n\n";
const sandbox = {
  CONFIG: {
    STAGING_MODE: true,
    SPREADSHEET_ID: "shared-id",
    VIP: { SPREADSHEET_ID: "shared-id" }
  }
};
vm.runInNewContext(source, sandbox, {timeout:1000});
assert.throws(
  () => sandbox.assertStagingSpreadsheetIsolation_(),
  /STAGING SAFETY BLOCK/,
  "shared CMS/VIP spreadsheet must be blocked before access"
);
sandbox.CONFIG.SPREADSHEET_ID = "staging-id";
assert.equal(sandbox.assertStagingSpreadsheetIsolation_(), true);
sandbox.CONFIG.STAGING_MODE = false;
sandbox.CONFIG.SPREADSHEET_ID = "shared-id";
assert.equal(sandbox.assertStagingSpreadsheetIsolation_(), true);
console.log("PASS shared staging/CMS/VIP ID is blocked");
console.log("PASS separate staging ID is allowed");
console.log("PASS guard does not alter non-staging configuration");
console.log("PASS total: 3/3");
