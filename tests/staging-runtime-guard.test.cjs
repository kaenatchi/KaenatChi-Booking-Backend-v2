const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = `function assertStagingSpreadsheetIsolation_() {
  const bookingSpreadsheetId = String(CONFIG.SPREADSHEET_ID || '').trim();
  const vipSpreadsheetId = String(
    CONFIG.VIP && CONFIG.VIP.SPREADSHEET_ID || ''
  ).trim();

  if (
    CONFIG.STAGING_MODE === true &&
    bookingSpreadsheetId &&
    vipSpreadsheetId &&
    bookingSpreadsheetId === vipSpreadsheetId
  ) {
    throw new Error(
      'STAGING SAFETY BLOCK: Booking staging points to the CMS/VIP spreadsheet. ' +
      'Configure a dedicated staging spreadsheet before any sheet access.'
    );
  }

  return true;
}

function getSpreadsheet_() {
  assertStagingSpreadsheetIsolation_();
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (!spreadsheet) throw new Error('No spreadsheet');
  return spreadsheet;
}
`;

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
vm.runInNewContext(source, sandbox, {timeout:1000});

assert.throws(
  () => sandbox.getSpreadsheet_(),
  /STAGING SAFETY BLOCK/,
  "shared CMS/VIP spreadsheet must be blocked"
);
assert.equal(openByIdCalls, 0, "openById must never run when IDs are shared");

sandbox.CONFIG.SPREADSHEET_ID = "staging-id";
const opened = sandbox.getSpreadsheet_();
assert.equal(opened.id, "staging-id");
assert.equal(openByIdCalls, 1, "separate staging ID may be opened");

sandbox.CONFIG.STAGING_MODE = false;
sandbox.CONFIG.SPREADSHEET_ID = "shared-id";
assert.equal(sandbox.getSpreadsheet_().id, "shared-id");
assert.equal(openByIdCalls, 2, "non-staging behavior remains unchanged");

console.log("PASS shared staging/CMS/VIP ID is blocked before openById");
console.log("PASS separate staging ID is allowed");
console.log("PASS non-staging configuration remains unchanged");
console.log("PASS total: 3/3");
