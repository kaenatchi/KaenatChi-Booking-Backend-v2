const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");

function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && quote) { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const routerStart = source.indexOf("function routeRequest_");
assert.notEqual(routerStart, -1, "public router must exist");
const nextFunction = source.indexOf("\nfunction ", routerStart + 10);
const routerText = source.slice(routerStart, nextFunction < 0 ? source.length : nextFunction);
assert.ok(!routerText.includes("getPaymentConsistencyDiagnosticReport_"),
  "diagnostic entry point must not be exposed through public action router");

const functions = [
  "normalizePaymentConsistencyStatusPure_",
  "classifyPaymentSubmissionConsistencyPure_",
  "buildPaymentConsistencyRecoveryPlanPure_",
  "buildPaymentConsistencyDiagnosticReportPure_",
  "getPaymentConsistencyDiagnosticReport_"
].map(extractFunction).join("\n");

const bookingRows = [
  {"Booking ID":"B-ORPHAN","Tracking Code":"T-ORPHAN","Payment Status":"در انتظار پرداخت","Appointment Status":"REQUEST_APPROVED"},
  {"Booking ID":"B-MISSING","Payment Status":"فیش دریافت شد"},
  {"Booking ID":"B-ALIGNED","Payment Status":"فیش دریافت شد"}
];
const paymentRows = [
  {"Booking ID":"B-ORPHAN","Payment ID":"P-ORPHAN","Payment Status":"فیش دریافت شد","Receipt URL":"PRIVATE-RECEIPT-URL"},
  {"Booking ID":"B-ALIGNED","Payment ID":"P-ALIGNED","Payment Status":"فیش دریافت شد"}
];
const reads = [];
let writes = 0;
let telegramSends = 0;
const sandbox = {
  CONFIG: {SHEETS:{BOOKINGS:"Bookings",PAYMENTS:"Payments"}},
  getSheetObjects_(name) {
    reads.push(name);
    if (name === "Bookings") return bookingRows;
    if (name === "Payments") return paymentRows;
    throw new Error("unexpected sheet read: " + name);
  },
  updateRowFields_(){writes++;},
  appendObjectRow_(){writes++;},
  appendBookingLog_(){writes++;},
  sendTelegramMessage_(){telegramSends++;},
  queueBookingTelegramNotificationWithAudit_(){telegramSends++;}
};

vm.runInNewContext(functions, sandbox, {timeout:1000});
const report = sandbox.getPaymentConsistencyDiagnosticReport_();

assert.deepEqual(reads, ["Bookings","Payments"], "report may read only booking and payment tables");
assert.equal(report.report, "PAYMENT_CONSISTENCY_READ_ONLY");
assert.equal(report.caseCount, 2, "only inconsistent cases should be listed");
assert.equal(report.cases[0].state, "BOOKING_PAYMENT_WITHOUT_PAYMENT_ROW");
assert.equal(report.cases[1].state, "PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED");
assert.equal(report.safeToAutoRepair, false);
assert.equal(report.noWrites, true);
assert.equal(report.noTelegramSent, true);
assert.equal(report.noReceiptLinksExposed, true);
assert.equal(JSON.stringify(report).includes("PRIVATE-RECEIPT-URL"), false);
assert.equal(writes, 0, "report must not write any records");
assert.equal(telegramSends, 0, "report must not send or queue Telegram notifications");

console.log("PASS real report entry point invokes actual classifier and recovery planner");
console.log("PASS both opposite mismatch states are reported; aligned record is omitted");
console.log("PASS receipt URL is not exposed");
console.log("PASS no writes or Telegram calls");
console.log("PASS diagnostic remains outside public action router");
console.log("PASS total: 5/5");
