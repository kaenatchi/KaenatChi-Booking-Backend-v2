const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const source = fs.readFileSync("Code.gs", "utf8");

function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (escaped) { escaped = false; continue; }
    if (quote) { if (ch === "\\") { escaped = true; continue; } if (ch === quote) quote = ""; continue; }
    if (ch === "/" && next === "/") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const S = {
  PAYMENT_APPROVED: "تأیید شد",
  PAYMENT_REJECTED: "رد شد",
  BOOKING_CONFIRMED: "تأیید شده",
  BOOKING_REJECTED: "رد شده"
};
const booking = {
  "Booking ID": "B-ALREADY-CONFIRMED",
  "Tracking Code": "T-ALREADY-CONFIRMED",
  "Appointment Status": S.BOOKING_CONFIRMED,
  "Payment Status": S.PAYMENT_APPROVED,
  "Slot Key": "1405/07/21|11:00",
  _row: 2
};
let mutations = 0;
const sandbox = {
  CONFIG: {
    STATUSES: S,
    SHEETS: { BOOKINGS: "Bookings" },
    LOG_ACTIONS: { ADMIN_REJECTED: "ADMIN_REJECTED" }
  },
  withBookingLock_: fn => fn(),
  getBookingByIdObject_: () => booking,
  fail_: (error, message) => ({ ok: false, error, message }),
  updateRowFields_: () => { mutations++; throw new Error("confirmed booking must not be mutated"); },
  ensureBookingLogOnce_: () => { throw new Error("rejection audit must not be written"); },
  queueBookingTelegramNotification_: () => { throw new Error("rejection notification must not be queued"); },
  String, Date
};
vm.runInNewContext(extractFunction("rejectBooking_"), sandbox, { timeout: 1000 });

const result = sandbox.rejectBooking_({
  bookingId: booking["Booking ID"],
  adminId: "test-admin",
  note: "stale Telegram callback"
});
assert.equal(result.ok, false, "reject action must be refused for an already-confirmed booking");
assert.equal(result.error, "BOOKING_ALREADY_CONFIRMED");
assert.equal(booking["Appointment Status"], S.BOOKING_CONFIRMED);
assert.equal(booking["Payment Status"], S.PAYMENT_APPROVED);
assert.equal(mutations, 0, "no booking row mutation is allowed");
console.log("PASS stale rejection callback cannot reverse a confirmed booking or queue a false rejection");
