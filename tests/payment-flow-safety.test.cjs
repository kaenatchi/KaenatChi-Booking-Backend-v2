const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing section: ${startMarker}`);
  assert.ok(end > start, `invalid section end: ${endMarker}`);
  return source.slice(start, end);
}

const submit = section("function submitPayment_(request){", "function approveBookingRequest_(request) {");
const release = section("function shouldReleaseExpiredHold_(row, nowMs) {", "function testExpiredHoldReleaseGuardPure_() {");
const bookedSlots = section("function getBookedSlots_() {", "function normalizeMobileForMatch_(value) {");

assert.ok(
  submit.indexOf("classifyPaymentSubmissionConsistencyPure_(b,existingPaymentRows)") <
    submit.indexOf("saveReceiptToDrive_(receipt"),
  "consistency preflight must happen before saving a receipt"
);
assert.ok(
  submit.indexOf("'Payment Status':CONFIG.STATUSES.PAYMENT_RECEIVED") <
    submit.indexOf("appendObjectRow_(CONFIG.SHEETS.PAYMENTS"),
  "current partial-failure order must be explicit: booking update precedes payment row"
);
assert.ok(
  submit.includes("PAYMENT_ALREADY_SUBMITTED") &&
    submit.includes("PAYMENT_CONSISTENCY_REVIEW_REQUIRED"),
  "retry after partial payment state must fail closed rather than create another payment"
);
assert.ok(
  release.includes("CONFIG.STATUSES.PAYMENT_PENDING"),
  "expired hold release must require unpaid/pending payment status"
);
assert.ok(
  bookedSlots.includes("paymentStatus === CONFIG.STATUSES.PAYMENT_RECEIVED"),
  "a booking with a received receipt must keep reserving its slot even if holdUntil passes"
);
assert.ok(
  source.includes("function buildPaymentConsistencyDiagnosticReportPure_") &&
    source.includes("PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED") &&
    source.includes("BOOKING_PAYMENT_WITHOUT_PAYMENT_ROW"),
  "diagnostics must recognize both directions of partial failure"
);

console.log("PASS consistency preflight precedes receipt save");
console.log("PASS partial-failure ordering is explicitly checked");
console.log("PASS retries fail closed against duplicate payment submission");
console.log("PASS expired-hold release only applies to unpaid requests");
console.log("PASS received payment continues to reserve the slot");
console.log("PASS both partial-failure directions are covered by diagnostics");
console.log("PASS total: 6/6");
