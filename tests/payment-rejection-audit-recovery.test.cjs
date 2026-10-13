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

const S = {PAYMENT_RECEIVED:"فیش دریافت شد",PAYMENT_REJECTED:"رد شد",PAYMENT_APPROVED:"تأیید شد",
  BOOKING_PENDING:"در انتظار بررسی",BOOKING_CONFIRMED:"تأیید شده",BOOKING_REJECTED:"رد شده",BOOKING_CANCELLED:"لغو شده"};
const booking={"Booking ID":"B-AUDIT-1","Slot Key":"D|11:00","Appointment Status":S.BOOKING_PENDING,
  "Payment Status":S.PAYMENT_RECEIVED,"Hold Until":new Date(Date.now()+3600000)};
const payment={"Booking ID":"B-AUDIT-1","Payment Status":S.PAYMENT_RECEIVED,_row:2};
let failAuditOnce=true; const logs=[],queued=[];
const sandbox={
 CONFIG:{STATUSES:S,SHEETS:{PAYMENTS:"Payments",BOOKINGS:"Bookings"},LOG_ACTIONS:{ADMIN_REJECTED:"ADMIN_REJECTED"}},
 withBookingLock_:fn=>fn(),getBookingByIdObject_:()=>({...booking}),
 getSheetObjects_:()=>[{...payment}],
 updateRowFields_:(sheet,row,fields)=>Object.assign(sheet==="Payments"?payment:booking,fields),
 appendBookingLog_:entry=>{if(failAuditOnce){failAuditOnce=false;throw new Error("simulated booking audit write failure");}logs.push(entry);},
 queueBookingTelegramNotificationWithAudit_:(...args)=>queued.push(args),
 fail_:(error,message)=>({ok:false,error,message}),Date,String
};
vm.runInNewContext(extractFunction("rejectBooking_"),sandbox,{timeout:1000});
let firstError="";
try {sandbox.rejectBooking_({bookingId:"B-AUDIT-1",paymentReview:true,adminId:"test"});}
catch(e){firstError=String(e.message||e);}
assert.match(firstError,/simulated booking audit write failure/);
assert.equal(booking["Appointment Status"],S.BOOKING_REJECTED,"booking transition completed before audit failed");
const retry=sandbox.rejectBooking_({bookingId:"B-AUDIT-1",paymentReview:true,adminId:"test"});
assert.equal(retry.ok,true,"retry should complete after audit storage recovers");
assert.equal(booking["Appointment Status"],S.BOOKING_REJECTED);
assert.equal(logs.length,1,"retry writes the missing rejection audit");
assert.equal(queued.length,1,"retry queues the rejection notification");
console.log("RECOVERY OBSERVED: retry repeats rejection transition and writes audit/notification after storage recovers");
