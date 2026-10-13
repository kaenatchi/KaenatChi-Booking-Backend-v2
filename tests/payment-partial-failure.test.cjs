const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");

function extractFunction(name) {
  const marker = "function " + name + "(";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let inSingle = false, inDouble = false, inTemplate = false, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && (inSingle || inDouble || inTemplate)) { escaped = true; continue; }
    if (!inDouble && !inTemplate && ch === "'" && !inSingle) { inSingle = true; continue; }
    if (inSingle && ch === "'") { inSingle = false; continue; }
    if (!inSingle && !inTemplate && ch === '"' && !inDouble) { inDouble = true; continue; }
    if (inDouble && ch === '"') { inDouble = false; continue; }
    if (!inSingle && !inDouble && ch === "`" ) { inTemplate = !inTemplate; continue; }
    if (inSingle || inDouble || inTemplate) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error("unterminated function " + name);
}

const functions = [
  extractFunction("normalizePaymentConsistencyStatusPure_"),
  extractFunction("classifyPaymentSubmissionConsistencyPure_"),
  extractFunction("submitPayment_")
].join("\n");

let savedReceipt = 0;
let bookingWrites = 0;
let paymentAppends = 0;
let telegramQueueCalls = 0;
const logEntries = [];
const booking = {
  "Booking ID": "B-ORPHAN-1",
  "Mobile": "5551234567",
  "Appointment Status": "BOOKING_PENDING",
  "Admin Note": "INITIAL_REQUEST_APPROVED",
  "Payment Status": "PAYMENT_PENDING",
  "Hold Until": new Date(Date.now() + 60 * 60 * 1000),
  "Slot Key": "2030-01-01|11:00"
};
const paymentRows = [{
  "Booking ID": "B-ORPHAN-1",
  "Payment ID": "P-EXISTING-1",
  "Payment Status": "PAYMENT_RECEIVED",
  "Receipt File ID": "FAKE-RECEIPT-ID"
}];

const sandbox = {
  Date,
  CONFIG: {
    STATUSES: {
      BOOKING_PENDING: "BOOKING_PENDING",
      PAYMENT_PENDING: "PAYMENT_PENDING",
      PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
      PAYMENT_APPROVED: "PAYMENT_APPROVED"
    },
    SHEETS: { PAYMENTS: "Payments" },
    LOG_ACTIONS: { PAYMENT_SUBMITTED: "PAYMENT_SUBMITTED" }
  },
  withBookingLock_: fn => fn(),
  getBookingByIdObject_: () => ({ ...booking }),
  normalizeMobileForMatch_: v => String(v || "").replace(/\D/g, ""),
  getSheetObjects_: () => paymentRows,
  appendBookingLog_: entry => logEntries.push(entry),
  fail_: (code, message) => ({ ok: false, code, message }),
  saveReceiptToDrive_: () => { savedReceipt++; return { id: "NEW", url: "NEW" }; },
  updateRowFields_: () => { bookingWrites++; },
  appendObjectRow_: () => { paymentAppends++; },
  queueBookingTelegramNotificationWithAudit_: () => { telegramQueueCalls++; }
};
vm.runInNewContext(functions, sandbox, { timeout: 1000 });

const result = sandbox.submitPayment_({
  bookingId: "B-ORPHAN-1",
  mobile: "5551234567",
  receiptData: "data:image/png;base64,AAAA"
});

assert.equal(result.ok, false, "orphan payment must fail closed");
assert.equal(result.code, "PAYMENT_CONSISTENCY_REVIEW_REQUIRED");
assert.equal(savedReceipt, 0, "no receipt upload should happen on consistency mismatch");
assert.equal(bookingWrites, 0, "booking status must not be auto-repaired");
assert.equal(paymentAppends, 0, "no duplicate payment row should be appended");
assert.equal(telegramQueueCalls, 0, "no Telegram notification should be queued");
assert.equal(logEntries.length, 1, "mismatch should be recorded for manual review");
assert.match(logEntries[0].details, /PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED/);

console.log("PASS actual submitPayment_ blocks orphan payment row");
console.log("PASS no Drive receipt upload, booking mutation, duplicate payment row, or Telegram queue");
console.log("PASS manual-review audit log is recorded");
console.log("PASS total: 3/3");
