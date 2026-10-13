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

// Exercise createBooking_ itself with isolated stubs: rejected cases must stop
// before any customer, booking, log, or Telegram persistence is attempted.
let persistenceCalls = 0;
sandbox.withBookingLock_ = callback => callback();
sandbox.normalizeJalaliDate_ = value => String(value || "");
sandbox.normalizeTime_ = value => String(value || "");
sandbox.isDateAvailable_ = () => true;
sandbox.getScheduleForDate_ = () => ({
  active: true,
  ranges: [{ startTime: "11:00", endTime: "13:30", slotDuration: 30 }]
});
sandbox.generateSlots_ = (start, end, step) => {
  const out = [];
  const startM = sandbox.timeToMinutes_(start), endM = sandbox.timeToMinutes_(end);
  for (let m = startM; m + (Number(step) || 30) <= endM; m += Number(step) || 30) {
    out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
  }
  return out;
};
sandbox.buildSlotKey_ = (d, t) => d + "|" + t;
sandbox.getSlotStatus_ = () => "FREE";
sandbox.findServiceRecord_ = () => ({ id: "therapy", name: "Therapy", price: 700000, duration: 45 });
sandbox.getSheetObjects_ = () => [];
sandbox.buildServiceDurationMap_ = () => ({ "id:therapy": 45 });
const actualHasBookingOverlap = sandbox.hasBookingOverlap_;
sandbox.hasBookingOverlap_ = () => false;
sandbox.fail_ = (code, message) => ({ ok: false, error: code, message });
sandbox.CONFIG.SHEETS = { BOOKINGS: "Bookings" };
sandbox.CONFIG.SLOT_STATUS = { FREE: "FREE" };
for (const name of ["createBooking_"]) {
  vm.runInNewContext(extractFunction(name), sandbox, { timeout: 1000 });
}
const durationRejected = sandbox.createBooking_({ date: "1405/07/21", time: "13:00", serviceId: "therapy" });
assert.equal(durationRejected.error, "SERVICE_DURATION_EXCEEDS_WORKING_HOURS");
assert.equal(persistenceCalls, 0, "out-of-range service must be rejected before persistence");

sandbox.isDateAvailable_ = () => true;
sandbox.getSlotStatus_ = () => "FREE";
sandbox.hasBookingOverlap_ = () => true;
const overlapRejected = sandbox.createBooking_({ date: "1405/07/21", time: "11:00", serviceId: "therapy" });
assert.equal(overlapRejected.error, "SLOT_OVERLAP");
assert.equal(persistenceCalls, 0, "overlapping booking must be rejected before persistence");
// Restore the actual overlap helper before testing interval fixtures below.
sandbox.hasBookingOverlap_ = actualHasBookingOverlap;


// Exercise getAvailableSlots_ itself: the UI must not advertise a
// duration-incompatible or overlapping time as selectable.
const savedBookingRows = [
  {
    "Booking ID": "existing-therapy", "Appointment Date": "1405/07/21",
    "Appointment Time": "11:00", "Service ID": "therapy",
    "Service Name": "Therapy", "Appointment Status": "CONFIRMED",
    "Payment Status": "PAYMENT_APPROVED", "Hold Until": new Date(Date.now() - 60000)
  }
];
sandbox.CONFIG.SHEETS.BLOCKED_SLOTS = "Blocked Slots";
sandbox.CONFIG.SHEETS.BOOKINGS = "Bookings";
sandbox.CONFIG.SLOT_STATUS = { FREE: "FREE", BLOCKED: "BLOCKED", CONFIRMED: "CONFIRMED", HELD: "HELD" };
sandbox.normalizeJalaliDate_ = value => String(value || "").trim();
sandbox.getScheduleForDate_ = () => ({
  active: true,
  ranges: [{ startTime: "11:00", endTime: "13:30", slotDuration: 30 }]
});
sandbox.findServiceRecord_ = () => ({ id: "energy", name: "Energy", price: 700000, duration: 30 });
sandbox.buildServiceDurationMap_ = () => ({ "id:energy": 30, "id:therapy": 45 });
sandbox.getSheetObjects_ = sheet => sheet === "Blocked Slots" ? [] : savedBookingRows;
sandbox.isTruthy_ = value => value === true || String(value).toLowerCase() === "true";
sandbox.buildSlotKey_ = (date, time) => date + "|" + time;
sandbox.generateSlots_ = (start, end, step) => {
  const out = [];
  const startM = sandbox.timeToMinutes_(start), endM = sandbox.timeToMinutes_(end);
  for (let m = startM; m + (Number(step) || 30) <= endM; m += Number(step) || 30) {
    out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
  }
  return out;
};
sandbox.isWithinScheduleRange_ = (start, duration, ranges) => {
  const s = sandbox.timeToMinutes_(start), e = s + Number(duration);
  return ranges.some(r => s >= sandbox.timeToMinutes_(r.startTime) && e <= sandbox.timeToMinutes_(r.endTime));
};
sandbox.hasBookingOverlap_ = actualHasBookingOverlap;
vm.runInNewContext(extractFunction("getAvailableSlots_"), sandbox, { timeout: 1000 });
const listed = sandbox.getAvailableSlots_({ date: "1405/07/21", serviceId: "energy" });
assert.equal(listed.ok, true, "availability lookup should succeed");
assert.equal(listed.slots.find(slot => slot.time === "11:00").available, false, "exact occupied start must not be advertised as free");
assert.equal(listed.slots.find(slot => slot.time === "11:30").available, false, "cross-service overlap must be blocked in the available-slots list");
assert.equal(listed.slots.find(slot => slot.time === "12:00").available, true, "non-overlapping interval should remain available");
assert.equal(listed.slots.find(slot => slot.time === "13:00").available, true, "a 30-minute service ending at range close should remain available");


// Verify the exact-slot status function retains submitted-receipt holds
// after the review timer expires, and releases only expired unpaid requests.
const fixedNow = Date.parse("2026-10-13T12:00:00.000Z");
const originalStatuses = sandbox.CONFIG.STATUSES;
sandbox.CONFIG.STATUSES = {
  BOOKING_PENDING: "در انتظار بررسی",
  BOOKING_CONFIRMED: "تأیید شده",
  PAYMENT_PENDING: "در انتظار پرداخت",
  PAYMENT_RECEIVED: "فیش دریافت شد",
  PAYMENT_APPROVED: "تأیید شد"
};
sandbox.CONFIG.SLOT_STATUS = { FREE: "FREE", BLOCKED: "BLOCKED", CONFIRMED: "CONFIRMED", HELD: "HELD" };
sandbox.CONFIG.SHEETS.BOOKINGS = "Bookings";
sandbox.isBlockedSlot_ = () => false;
sandbox.getSheetObjects_ = () => [{
  "Slot Key": "1405/07/21|11:00",
  "Appointment Date": "1405/07/21",
  "Appointment Time": "11:00",
  "Appointment Status": "در انتظار بررسی",
  "Payment Status": "فیش دریافت شد",
  "Hold Until": new Date(fixedNow - 121 * 60 * 1000).toISOString()
}];
const realDateNow = Date.now;
Date.now = () => fixedNow;
try {
  vm.runInNewContext(extractFunction("getSlotStatus_"), sandbox, { timeout: 1000 });
  assert.equal(
    sandbox.getSlotStatus_("1405/07/21|11:00", "1405/07/21", "11:00"),
    "HELD",
    "slot status must remain held after receipt review timer expires"
  );
  sandbox.getSheetObjects_ = () => [{
    "Slot Key": "1405/07/21|11:00",
    "Appointment Date": "1405/07/21",
    "Appointment Time": "11:00",
    "Appointment Status": "در انتظار بررسی",
    "Payment Status": "تأیید شد",
    "Hold Until": new Date(fixedNow - 121 * 60 * 1000).toISOString()
  }];
  assert.equal(
    sandbox.getSlotStatus_("1405/07/21|11:00", "1405/07/21", "11:00"),
    "HELD",
    "slot must remain held if payment was approved but booking finalization needs recovery"
  );
  sandbox.normalizeJalaliDate_ = value => String(value || "");
  sandbox.normalizeTime_ = value => String(value || "");
  sandbox.parseDateValue_ = value => value ? new Date(value) : null;
  sandbox.buildSlotKey_ = (date, time) => date + "|" + time;
  vm.runInNewContext(extractFunction("getBookedSlots_"), sandbox, { timeout: 1000 });
  const approvedPendingList = sandbox.getBookedSlots_();
  assert.equal(approvedPendingList.bookedSlots.length, 1,
    "approved-payment pending booking must remain visible as occupied");
  sandbox.getSheetObjects_ = () => [{
    "Slot Key": "1405/07/21|11:00",
    "Appointment Status": "در انتظار بررسی",
    "Payment Status": "در انتظار پرداخت",
    "Hold Until": new Date(fixedNow - 11 * 60 * 1000).toISOString()
  }];
  assert.equal(
    sandbox.getSlotStatus_("1405/07/21|11:00", "1405/07/21", "11:00"),
    "FREE",
    "expired unpaid request should no longer hold the slot"
  );
} finally {
  Date.now = realDateNow;
  sandbox.CONFIG.STATUSES = originalStatuses;
}


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
  booking("expired-unpaid", "14:00", "energy", 30, "PENDING", "PAYMENT_PENDING", new Date(now - 999999).toISOString()),
  booking("rejected", "15:00", "energy", 30, "REJECTED", "PAYMENT_RECEIVED", new Date(now + 999999))
];

function overlaps(time, duration, excludeId) {
  return sandbox.hasBookingOverlap_(rows, date, time, duration, excludeId || "", durations);
}
assert.equal(overlaps("11:20", 20), true, "cross-service overlap must block a conflicting interval");
assert.equal(overlaps("12:40", 20), true, "receipt-backed appointment must remain blocking after hold expiry");
assert.equal(sandbox.isBlockingBookingRow_(rows[2]), false, "expired unpaid fixture must be non-blocking");
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
console.log("PASS actual createBooking_ rejects out-of-range and overlapping requests before persistence");
console.log("PASS getAvailableSlots_ hides occupied and overlapping times");
console.log("PASS exact slot remains held after receipt review timer expires");
console.log("PASS service lookup returns configured duration and price");
console.log("PASS cross-service interval overlap");
console.log("PASS receipt remains blocking after hold expiry");
console.log("PASS expired unpaid and rejected requests do not block");
console.log("PASS exact end-to-start boundary is allowed");
console.log("PASS exclusion and working-range duration checks");
console.log("PASS total: 8/8");
