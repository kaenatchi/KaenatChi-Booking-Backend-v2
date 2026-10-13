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
  throw new Error("unterminated function " + name);
}

const S = {
  PAYMENT_PENDING:"در انتظار پرداخت", PAYMENT_RECEIVED:"فیش دریافت شد",
  PAYMENT_APPROVED:"تأیید شد", PAYMENT_REJECTED:"رد شد",
  BOOKING_PENDING:"در انتظار بررسی", BOOKING_CONFIRMED:"تأیید شده",
  BOOKING_REJECTED:"رد شده", BOOKING_CANCELLED:"لغو شده"
};
function fixture({bookingStatus=S.BOOKING_PENDING, bookingPayment=S.PAYMENT_RECEIVED, paymentRows=1, failBookingWriteOnce=false}={}) {
  const booking = {"Booking ID":"B1","Slot Key":"D|11:00","Appointment Status":bookingStatus,
    "Payment Status":bookingPayment,"Hold Until":new Date(Date.now()+3600000)};
  const payments = Array.from({length:paymentRows},(_,i)=>({"Booking ID":"B1","Payment Status":S.PAYMENT_RECEIVED,_row:i+2}));
  const writes = [], logs = [], queued = [];
  let shouldFail = failBookingWriteOnce;
  const sandbox = {
    CONFIG:{STATUSES:S,SHEETS:{PAYMENTS:"Payments",BOOKINGS:"Bookings"},LOG_ACTIONS:{ADMIN_REJECTED:"ADMIN_REJECTED"}},
    withBookingLock_:fn=>fn(),
    getBookingByIdObject_:()=>({...booking}),
    getSheetObjects_:name=>name==="Payments"?payments.map(p=>({...p})):[],
    updateRowFields_:(sheet,row,fields)=>{
      writes.push({sheet,row,fields:{...fields}});
      if(sheet==="Bookings" && shouldFail){shouldFail=false;throw new Error("simulated booking-sheet write failure");}
      const target=sheet==="Payments"?payments.find(p=>p._row===row):booking;
      if(target) Object.assign(target,fields);
    },
    appendBookingLog_:entry=>logs.push(entry),
    queueBookingTelegramNotificationWithAudit_:(...args)=>queued.push(args),
    fail_:(error,message)=>({ok:false,error,message}),
    Date,String
  };
  vm.runInNewContext(extractFunction("rejectBooking_"),sandbox,{timeout:1000});
  return {sandbox,booking,payments,writes,logs,queued};
}

{
 const f=fixture({failBookingWriteOnce:true});
 let threw=false;
 try { f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true,adminId:"admin"}); } catch(e) { threw=true; }
 assert.equal(threw,true,"simulated first booking write must fail");
 assert.equal(f.payments[0]["Payment Status"],S.PAYMENT_REJECTED,"payment row write occurs first");
 assert.equal(f.booking["Appointment Status"],S.BOOKING_PENDING,"booking remains pending after simulated failure");
 const retry=f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true,adminId:"admin"});
 assert.equal(retry.ok,true,"retry should finish the interrupted rejection");
 assert.equal(f.booking["Appointment Status"],S.BOOKING_REJECTED);
 assert.equal(f.booking["Payment Status"],S.PAYMENT_REJECTED);
 assert.equal(f.payments[0]["Payment Status"],S.PAYMENT_REJECTED);
 assert.equal(f.queued.length,1,"notification queued only after successful retry");
 console.log("PASS interrupted rejection can be safely retried");
}
{
 const f=fixture({paymentRows:2});
 const result=f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true});
 assert.equal(result.error,"PAYMENT_RECORD_MISMATCH");
 assert.equal(f.writes.length,0,"duplicate payment rows block all writes");
 console.log("PASS duplicate payment rows fail closed without writes");
}
{
 const f=fixture({bookingStatus:S.BOOKING_CONFIRMED,bookingPayment:S.PAYMENT_APPROVED});
 const result=f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true});
 assert.equal(result.error,"BOOKING_ALREADY_FINAL");
 assert.equal(f.writes.length,0,"final booking cannot be rejected");
 console.log("PASS finalized booking is protected");
}
{
 const f=fixture();
 const first=f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true,adminId:"admin"});
 assert.equal(first.ok,true);
 const writeCount=f.writes.length;
 const second=f.sandbox.rejectBooking_({bookingId:"B1",paymentReview:true,adminId:"admin"});
 assert.equal(second.error,"PAYMENT_NOT_AWAITING_REVIEW");
 assert.equal(f.writes.length,writeCount,"repeated reject does not mutate again");
 assert.equal(f.queued.length,1,"repeat does not queue duplicate notification");
 console.log("PASS repeated rejection is safely blocked");
}
console.log("PASS total: 4/4 scenarios");
