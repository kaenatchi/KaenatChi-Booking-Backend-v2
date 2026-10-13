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

const writes = [];
const booking = {
  "Booking ID": "B-1", "Payment Status": "فیش دریافت شد",
  "Appointment Status": "لغو شده", "Appointment Date": "1405/07/21",
  "Appointment Time": "11:00", "Slot Key": "1405/07/21|11:00"
};
const sandbox = {
  CONFIG: {STATUSES: {
    PAYMENT_RECEIVED: "فیش دریافت شد", PAYMENT_APPROVED: "تأیید شد",
    BOOKING_PENDING: "در انتظار بررسی", BOOKING_CONFIRMED: "تأیید شده",
    BOOKING_CANCELLED: "لغو شده", BOOKING_REJECTED: "رد شده"
  }, SLOT_STATUS: {CONFIRMED:"confirmed", BLOCKED:"blocked"}, SHEETS:{PAYMENTS:"Payments",BOOKINGS:"Bookings"}},
  withBookingLock_: fn => fn(),
  getBookingByIdObject_: () => ({...booking}),
  fail_: (error, message) => ({ok:false,error,message}),
  normalizeJalaliDate_: x => x,
  normalizeTime_: x => x,
  buildSlotKey_: (d,t) => d+"|"+t,
  getSlotStatus_: () => "blocked",
  getSheetObjects_: () => [{ "Booking ID":"B-1", "Payment Status":"فیش دریافت شد", _row:2 }],
  updateRowFields_: (...args) => writes.push(args),
  Date,
  String
};
vm.runInNewContext(extractFunction("approveBooking_"), sandbox, {timeout:1000});

for (const status of ["لغو شده", "رد شده"]) {
  booking["Appointment Status"] = status;
  const result = sandbox.approveBooking_({bookingId:"B-1"});
  assert.equal(result.ok, false, status + " booking must not be approved");
  assert.equal(result.error, "BOOKING_NOT_APPROVABLE");
  assert.equal(writes.length, 0, "no writes for " + status + " booking");
}
booking["Appointment Status"] = "در انتظار بررسی";
const pendingResult = sandbox.approveBooking_({bookingId:"B-1"});
assert.equal(pendingResult.error, "SLOT_BLOCKED", "pending booking must pass status guard and reach slot checks");
assert.equal(writes.length, 0, "blocked slot must not be mutated");

console.log("PASS cancelled booking cannot be finally approved");
console.log("PASS rejected booking cannot be finally approved");
console.log("PASS pending booking passes state guard and continues to slot validation");
console.log("PASS no writes occur in all guard fixtures");
console.log("PASS total: 4/4");
