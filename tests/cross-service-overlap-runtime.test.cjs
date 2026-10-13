const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync("Code.gs", "utf8");

function extractFunction(name) {
  const marker = "function " + name + "(";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "missing function " + name);
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
    if (ch === "'" || ch === '"' || ch === "\`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const sandbox = {
  CONFIG: { STATUSES: {
    BOOKING_PENDING: "PENDING",
    BOOKING_CONFIRMED: "CONFIRMED",
    BOOKING_REJECTED: "REJECTED",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
    PAYMENT_APPROVED: "PAYMENT_APPROVED"
  }},
  timeToMinutes_: value => {
    const p = String(value).split(":").map(Number);
    return p[0] * 60 + p[1];
  },
  normalizeTime_: value => String(value || "").trim(),
  normalizeJalaliDate_: value => String(value || "").trim(),
  parseDateValue_: value => {
    if (value instanceof Date) return value;
    if (value === null || value === undefined || value === "") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  },
  Date,
  Math,
  Number,
  String
};
for (const name of [
  "normalizeServiceNameForOverlap_",
  "getServiceDurationMinutes_",
  "isWithinScheduleRange_",
  "isBlockingBookingRow_",
  "intervalsOverlap_",
  "hasBookingOverlap_"
]) vm.runInNewContext(extractFunction(name), sandbox, { timeout: 1000 });

// Exercise the real service lookup to ensure duration reaches booking guards.
const serviceRow = {
  "Service ID": "therapy",
  "Service Name": "Therapy",
  "Price": "700000",
  "Duration": "45"
};
sandbox.getSpreadsheet_ = () => ({ getSheetByName: () => ({}) });
sandbox.getSheetObjects_ = () => [serviceRow];
sandbox.firstField_ = (row, fields) => {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") return row[field];
  }
  return "";
};
sandbox.toNumber_ = value => Number(value) || 0;
vm.runInNewContext(extractFunction("findServiceRecord_"), sandbox, { timeout: 1000 });
const lookedUpService = sandbox.findServiceRecord_("therapy", "");
assert.equal(lookedUpService.duration, 45, "service lookup must return the configured service duration");
assert.equal(lookedUpService.price, 700000, "service lookup must preserve the configured price");

const now = Date.now();
const date = "1405/07/21";
const durations = { "id:energy": 30, "id:candle": 20, "id:therapy": 45 };
function booking(id, time, serviceId, duration, status, payment, holdUntil) {
  return {
    "Booking ID": id, "Appointment Date": date, "Appointment Time": time,
    "Service ID": serviceId, "Service Name": serviceId, "Duration": duration,
    "Appointment Status": status, "Payment Status": payment,
    "Hold Until": holdUntil
  };
}
const rows = [
  booking("confirmed-energy", "11:00", "energy", 30, "CONFIRMED", "PAYMENT_APPROVED", new Date(now - 999999)),
  booking("receipt-therapy", "12:00", "therapy", 45, "PENDING", "PAYMENT_RECEIVED", new Date(now - 999999)),
  booking("expired-unpaid", "14:00", "energy", 30, "PENDING", "PAYMENT_PENDING", new Date(now - 999999)),
  booking("rejected", "15:00", "energy", 30, "REJECTED", "PAYMENT_RECEIVED", new Date(now + 999999))
];

function overlaps(time, duration, excludeId) {
  return sandbox.hasBookingOverlap_(rows, date, time, duration, excludeId || "", durations);
}
assert.equal(overlaps("11:20", 20), true, "cross-service overlap must block a conflicting interval");
assert.equal(overlaps("12:40", 20), true, "receipt-backed appointment must remain blocking after hold expiry");
assert.equal(overlaps("14:15", 15), false, "expired unpaid request must not block");
assert.equal(overlaps("15:10", 15), false, "rejected request must not block");
assert.equal(overlaps("11:30", 20), false, "interval starting exactly at prior appointment end is allowed");
assert.equal(overlaps("11:10", 20, "confirmed-energy"), false, "excludeBookingId must exclude the matching booking");
assert.equal(
  sandbox.isWithinScheduleRange_("13:00", 45, [{startTime:"11:00",endTime:"13:30"}]),
  false,
  "service duration that crosses the working-range end must be rejected"
);
assert.equal(
  sandbox.isWithinScheduleRange_("12:45", 45, [{startTime:"11:00",endTime:"13:30"}]),
  true,
  "service ending exactly at working-range end must be allowed"
);
assert.match(
  source.slice(source.indexOf("function createBooking_(request){"), source.indexOf("function hasRequiredReceiptImage_")),
  /return withBookingLock_\(function\(\)/,
  "booking overlap validation must remain inside the shared booking lock"
);
assert.match(
  source.slice(source.indexOf("function createBooking_(request){"), source.indexOf("function hasRequiredReceiptImage_")),
  /hasBookingOverlap_\(activeBookings,date,time,serviceDuration/,
  "booking creation must enforce the overlap guard"
);
assert.match(
  source.slice(source.indexOf("function getAvailableSlots_(request)"), source.indexOf("function buildServiceDurationMap_")),
  /hasBookingOverlap_\(bookingRows, date, time, serviceDuration/,
  "availability must hide slots that overlap existing appointments"
);
assert.match(
  source.slice(source.indexOf("function getAvailableSlots_(request)"), source.indexOf("function buildServiceDurationMap_")),
  /PAYMENT_RECEIVED/,
  "slot availability must preserve the receipt-backed hold"
);
console.log("PASS service lookup returns configured duration and price");
console.log("PASS cross-service interval overlap");
console.log("PASS receipt remains blocking after hold expiry");
console.log("PASS expired unpaid and rejected requests do not block");
console.log("PASS exact end-to-start boundary is allowed");
console.log("PASS exclusion and working-range duration checks");
console.log("PASS total: 8/8");
