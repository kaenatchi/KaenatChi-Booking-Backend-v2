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
  PAYMENT_AWAITING_ACCEPTANCE: "در انتظار پذیرش مایا",
  PAYMENT_PENDING: "در انتظار پرداخت",
  PAYMENT_RECEIVED: "فیش دریافت شد",
  PAYMENT_APPROVED: "تأیید شد",
  PAYMENT_REJECTED: "رد شد",
  BOOKING_PENDING: "در انتظار بررسی",
  BOOKING_CONFIRMED: "تأیید شده",
  BOOKING_REJECTED: "رد شده",
  BOOKING_CANCELLED: "لغو شده"
};
const booking = {
  "Booking ID":"BK-STAGING-1", "Request ID":"REQ-STAGING-1",
  "Appointment Status":S.BOOKING_PENDING,
  "Payment Status":S.PAYMENT_AWAITING_ACCEPTANCE,
  "Appointment Date":"1405/07/22", "Appointment Time":"11:00",
  "Slot Key":"1405/07/22|11:00", "Hold Until":"", _row:2
};
let rowUpdates = [], logs = 0, queued = [];
const rows = [booking];
const sandbox = {
  CONFIG:{STATUSES:S,SHEETS:{BOOKINGS:"Bookings"},LOG_ACTIONS:{}},
  withBookingLock_:fn=>fn(),
  getBookingByIdObject_:id=>rows.find(x=>x["Booking ID"]===id)||null,
  getSheetObjects_:()=>rows,
  normalizeJalaliDate_:x=>String(x||""),
  normalizeTime_:x=>String(x||""),
  buildSlotKey_:(d,t)=>d+"|"+t,
  isBlockedSlot_:()=>false,
  parseDateValue_:x=>x ? new Date(x) : null,
  updateRowFields_:(sheet,row,values)=>{rowUpdates.push(values);Object.assign(booking,values);},
  appendBookingLog_:()=>{logs++;},
  queueBookingTelegramNotification_:(b,event)=>{queued.push(event);return {ok:true};},
  fail_:(error,message)=>({ok:false,error,message}),
  publicBooking_:b=>b,
  Date,String,Math,JSON
};
vm.runInNewContext(extractFunction("acceptBooking_"),sandbox,{timeout:1000});
const accepted=sandbox.acceptBooking_({bookingId:booking["Booking ID"],adminId:"staging-admin"});
assert.equal(accepted.ok,true);
assert.equal(booking["Payment Status"],S.PAYMENT_PENDING);
assert.equal(booking["Appointment Status"],S.BOOKING_PENDING);
assert.ok(booking["Hold Until"] instanceof Date || String(booking["Hold Until"]).includes(""),"payment deadline should be set");
const deadline = new Date(booking["Hold Until"]).getTime();
assert.ok(deadline > Date.now() && deadline <= Date.now()+10*60*1000+3000,"acceptance starts a 10-minute deadline");
assert.deepEqual(queued,["accepted"]);
assert.equal(logs,1);
const acceptedAgain=sandbox.acceptBooking_({bookingId:booking["Booking ID"],adminId:"staging-admin"});
assert.equal(acceptedAgain.ok,true);
assert.equal(acceptedAgain.alreadyAccepted,true);
assert.equal(new Date(booking["Hold Until"]).getTime(),deadline,"retry must not reset the deadline");

const unaccepted = {...booking,"Payment Status":S.PAYMENT_AWAITING_ACCEPTANCE,"Hold Until":""};
sandbox.getBookingByIdObject_=()=>unaccepted;
const paymentSandbox={...sandbox, getBookingByIdObject_:()=>unaccepted};
vm.runInNewContext(extractFunction("submitPayment_"),paymentSandbox,{timeout:1000});
const paymentResult=paymentSandbox.submitPayment_({bookingId:unaccepted["Booking ID"],transactionNumber:"123"});
assert.equal(paymentResult.ok,false);
assert.equal(paymentResult.error,"BOOKING_NOT_ACCEPTED");
console.log("PASS request acceptance starts one 10-minute deadline; repeat acceptance is idempotent; payment before acceptance is blocked");

const receiptBooking = {
  "Slot Key":"1405/07/22|11:00",
  "Appointment Status":S.BOOKING_PENDING,
  "Payment Status":S.PAYMENT_RECEIVED,
  "Hold Until":new Date(Date.now()-3*60*60*1000)
};
const slotSandbox = {
  CONFIG:{STATUSES:S,SLOT_STATUS:{FREE:"free",HELD:"held",CONFIRMED:"confirmed",BLOCKED:"blocked"}},
  isBlockedSlot_:()=>false,
  getSheetObjects_:()=>[receiptBooking],
  parseDateValue_:()=>new Date(Date.now()-3*60*60*1000),
  Date,String
};
vm.runInNewContext(extractFunction("getSlotStatus_"),slotSandbox,{timeout:1000});
assert.equal(slotSandbox.getSlotStatus_(receiptBooking["Slot Key"],"1405/07/22","11:00"),"held",
  "a receipt awaiting manual bank verification must keep the slot reserved beyond 120 minutes");
console.log("PASS receipt-review booking remains reserved after the old 120-minute review interval");
