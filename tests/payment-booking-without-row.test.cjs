const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0, single = false, double = false, template = false, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && (single || double || template)) { escaped = true; continue; }
    if (!double && !template && ch === "'" && !single) { single = true; continue; }
    if (single && ch === "'") { single = false; continue; }
    if (!single && !template && ch === '"' && !double) { double = true; continue; }
    if (double && ch === '"') { double = false; continue; }
    if (!single && !double && ch === "`") { template = !template; continue; }
    if (single || double || template) continue;
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}
const code = [
  extractFunction("normalizePaymentConsistencyStatusPure_"),
  extractFunction("classifyPaymentSubmissionConsistencyPure_"),
  extractFunction("submitPayment_")
].join("\n");

let driveWrites = 0, bookingWrites = 0, paymentAppends = 0, telegramQueues = 0;
const logs = [];
const booking = {
  "Booking ID":"B-MISSING-ROW-1",
  "Mobile":"5551234567",
  "Appointment Status":"BOOKING_PENDING",
  "Admin Note":"INITIAL_REQUEST_APPROVED",
  "Payment Status":"PAYMENT_RECEIVED",
  "Hold Until":new Date(Date.now()+3600000),
  "Receipt File ID":"FAKE-BOOKING-RECEIPT",
  "Slot Key":"2030-01-01|11:00"
};
const sandbox = {
  Date,
  CONFIG:{STATUSES:{BOOKING_PENDING:"BOOKING_PENDING",PAYMENT_PENDING:"PAYMENT_PENDING",PAYMENT_RECEIVED:"PAYMENT_RECEIVED",PAYMENT_APPROVED:"PAYMENT_APPROVED"},SHEETS:{PAYMENTS:"Payments"},LOG_ACTIONS:{PAYMENT_SUBMITTED:"PAYMENT_SUBMITTED"}},
  withBookingLock_:fn=>fn(),
  getBookingByIdObject_:()=>({...booking}),
  normalizeMobileForMatch_:v=>String(v||"").replace(/\D/g,""),
  getSheetObjects_:()=>[],
  appendBookingLog_:x=>logs.push(x),
  fail_:(code,message)=>({ok:false,code,message}),
  saveReceiptToDrive_:()=>{driveWrites++;return {id:"NEW",url:"NEW"};},
  updateRowFields_:()=>{bookingWrites++;},
  appendObjectRow_:()=>{paymentAppends++;},
  queueBookingTelegramNotificationWithAudit_:()=>{telegramQueues++;}
};
vm.runInNewContext(code,sandbox,{timeout:1000});
const result=sandbox.submitPayment_({bookingId:"B-MISSING-ROW-1",mobile:"5551234567",receiptData:"data:image/png;base64,AAAA"});
assert.equal(result.ok,false,"booking/payment mismatch must fail closed");
assert.ok(["PAYMENT_ALREADY_SUBMITTED","PAYMENT_CONSISTENCY_REVIEW_REQUIRED"].includes(result.code),"must not accept another receipt");
assert.equal(driveWrites,0,"must not upload a second receipt");
assert.equal(bookingWrites,0,"must not change booking state");
assert.equal(paymentAppends,0,"must not create a duplicate payment row");
assert.equal(telegramQueues,0,"must not queue another Telegram notice");
console.log("PASS booking-received/payment-row-missing mismatch fails closed");
console.log("PASS no receipt upload, booking mutation, payment append, or Telegram queue");
console.log("Observed response: "+result.code);
console.log("Audit log entries: "+logs.length);
