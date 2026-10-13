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
  PAYMENT_RECEIVED:"فیش دریافت شد", PAYMENT_APPROVED:"تأیید شد",
  BOOKING_PENDING:"در انتظار بررسی", BOOKING_CONFIRMED:"تأیید شده",
  SLOT_STATUS:{FREE:"free",CONFIRMED:"confirmed",BLOCKED:"blocked"},
  SHEETS:{PAYMENTS:"Payments",BOOKINGS:"Bookings"},
  LOG_ACTIONS:{ADMIN_APPROVED:"ADMIN_APPROVED"}
};
const booking = {"Booking ID":"B-TOKEN-1","Payment Status":S.PAYMENT_RECEIVED,
  "Appointment Status":S.BOOKING_PENDING,"Appointment Date":"1405/07/20",
  "Appointment Time":"11:00","Slot Key":"1405/07/20|11:00",
  "Discount Code":"VIP-TEST","Customer ID":"C1","Telegram ID":"T1","Tracking Code":"TR1"};
const payment = {"Booking ID":"B-TOKEN-1","Payment Status":S.PAYMENT_RECEIVED,_row:2};
let tokenFailures = 1;
const writes = [], logs = [], queued = [];
const sandbox = {
  CONFIG:{STATUSES:S,SLOT_STATUS:S.SLOT_STATUS,SHEETS:S.SHEETS,LOG_ACTIONS:S.LOG_ACTIONS},
  withBookingLock_:fn=>fn(),
  getBookingByIdObject_:()=>({...booking}),
  normalizeJalaliDate_:v=>v, normalizeTime_:v=>v, buildSlotKey_:(d,t)=>d+"|"+t,
  getSlotStatus_:()=>booking["Appointment Status"]===S.BOOKING_CONFIRMED?S.SLOT_STATUS.CONFIRMED:S.SLOT_STATUS.FREE,
  getSheetObjects_:()=>[{...payment}],
  updateRowFields_:(sheet,row,fields)=>{writes.push({sheet,fields:{...fields}});Object.assign(sheet==="Payments"?payment:booking,fields);},
  consumeDiscountToken_:()=>{if(tokenFailures-- > 0) throw new Error("simulated token-sheet failure");},
  appendBookingLog_:entry=>logs.push(entry),
  queueBookingTelegramNotificationWithAudit_:(...args)=>queued.push(args),
  fail_:(error,message)=>({ok:false,error,message}), Date, String
};
vm.runInNewContext(extractFunction("approveBooking_"),sandbox,{timeout:1000});
let firstError="";
try { sandbox.approveBooking_({bookingId:"B-TOKEN-1",adminId:"test"}); }
catch(e) { firstError=String(e.message||e); }
assert.match(firstError,/simulated token-sheet failure/);
assert.equal(booking["Appointment Status"],S.BOOKING_CONFIRMED,"booking is already confirmed before token consumption throws");
const retry=sandbox.approveBooking_({bookingId:"B-TOKEN-1",adminId:"test"});
assert.equal(retry.ok,true,"retry completes recovery after token storage recovers");
assert.equal(tokenFailures,0,"retry never reaches discount-token consumption");
assert.equal(booking["Appointment Status"],S.BOOKING_CONFIRMED);
assert.equal(payment["Payment Status"],S.PAYMENT_APPROVED);
assert.equal(logs.length,1,"retry writes the missing approval audit");
assert.equal(queued.length,1,"retry queues the missing approval notification");
console.log("RECOVERY VERIFIED: token failure is retried idempotently and approval audit/notification are completed");
