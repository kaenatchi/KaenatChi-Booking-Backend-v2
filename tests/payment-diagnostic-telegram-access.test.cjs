const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");

function extract(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && quote) { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const routeStart = source.indexOf("function routeRequest_");
const routeEnd = source.indexOf("\nfunction ", routeStart + 10);
assert.ok(!source.slice(routeStart, routeEnd < 0 ? source.length : routeEnd).includes("getPaymentConsistencyDiagnosticReport_"),
  "diagnostic must not be exposed through public router");

let sends = [], answers = [], writes = 0, reportReads = 0;
const sandbox = {
  getTelegramConfig_: () => ({adminChatId:"ADMIN-1",adminUserId:"7"}),
  answerTelegramCallbackQuery_: (...args) => { answers.push(args); return {ok:true}; },
  getPaymentConsistencyDiagnosticReport_: () => {
    reportReads++;
    return {caseCount:1,cases:[{bookingId:"B-1",state:"PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED",appointmentStatus:"REQUEST_APPROVED",bookingPaymentStatus:"در انتظار پرداخت",receiptUrl:"PRIVATE-URL"}]};
  },
  sendTelegramMessage_: (chatId, message) => { sends.push({chatId,message}); return {ok:true}; },
  withBookingLock_: fn => fn(),
  getSheetObjects_: () => [],
  appendBookingLog_: () => { writes++; },
  CONFIG: {SHEETS:{BOOKING_LOGS:"BookingLogs"},LOG_ACTIONS:{PAYMENT_REVIEW_HOLD:"PAYMENT_REVIEW_HOLD"}}
};
vm.runInNewContext(extract("handleTelegramCallbackQuery_"), sandbox, {timeout:1000});

const unauthorized = sandbox.handleTelegramCallbackQuery_({
  id:"Q-1",data:"kaenatchi:payment_diagnostics",from:{id:7},message:{chat:{id:"OTHER"},message_id:1}
});
assert.equal(unauthorized.error,"TELEGRAM_ADMIN_ONLY");
assert.equal(reportReads,0,"unauthorized caller must not read diagnostics");
assert.equal(sends.length,0,"unauthorized caller must not receive report");

const wrongUser = sandbox.handleTelegramCallbackQuery_({
  id:"Q-1B",data:"kaenatchi:payment_diagnostics",from:{id:8},message:{chat:{id:"ADMIN-1"},message_id:3}
});
assert.equal(wrongUser.error,"TELEGRAM_ADMIN_ONLY","another group member cannot access diagnostics");
assert.equal(reportReads,0,"wrong user must not read diagnostics");
assert.equal(sends.length,0,"wrong user must not receive report");

const missingUser = sandbox.handleTelegramCallbackQuery_({
  id:"Q-1C",data:"kaenatchi:payment_diagnostics",message:{chat:{id:"ADMIN-1"},message_id:4}
});
assert.equal(missingUser.error,"TELEGRAM_ADMIN_ONLY","missing user identity must fail closed");
assert.equal(reportReads,0,"missing identity must not read diagnostics");

const result = sandbox.handleTelegramCallbackQuery_({
  id:"Q-2",data:"kaenatchi:payment_diagnostics",from:{id:7},message:{chat:{id:"ADMIN-1"},message_id:2}
});
assert.equal(result.ok,true);
assert.equal(reportReads,1);
assert.equal(sends.length,1);
assert.equal(sends[0].chatId,"ADMIN-1");
assert.ok(!sends[0].message.includes("PRIVATE-URL"),"receipt URLs must never be included");
assert.ok(sends[0].message.includes("PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED"));
assert.equal(writes,0,"diagnostic callback must not write sheets");
assert.ok(answers.some(a => a[1] === "گزارش فقط‌خواندنی ارسال شد."));
console.log("PASS non-admin callback cannot access diagnostic");
console.log("PASS admin callback sends read-only report without receipt URL");
console.log("PASS no sheet writes and public router remains unexposed");
console.log("PASS total: 3/3");
