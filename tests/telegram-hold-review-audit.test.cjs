const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
function extractFunction(name) {
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
let logs = [];
let answers = [];
let bookingWrites = 0;
let paymentWrites = 0;
const sandbox = {
  CONFIG: {LOG_ACTIONS:{PAYMENT_REVIEW_HOLD:"PAYMENT_REVIEW_HOLD"}},
  getTelegramConfig_: () => ({adminChatId:"admin-1"}),
  appendBookingLog_: entry => logs.push(entry),
  answerTelegramCallbackQuery_: (...args) => answers.push(args),
  updateRowFields_: () => { bookingWrites++; },
  appendObjectRow_: () => { paymentWrites++; },
  getBookingByIdObject_: () => { throw new Error("hold-review must not fetch or mutate booking"); }
};
vm.runInNewContext(extractFunction("handleTelegramCallbackQuery_"), sandbox, {timeout:1000});
const result = sandbox.handleTelegramCallbackQuery_({
  id:"callback-1",data:"kaenatchi:hold_review:B-100",
  message:{chat:{id:"admin-1"},message_id:44}
});
assert.equal(result.ok, true);
assert.equal(result.unchanged, true);
assert.equal(result.audited, true);
assert.equal(logs.length, 1);
assert.equal(logs[0].action, "PAYMENT_REVIEW_HOLD");
assert.equal(logs[0].bookingId, "B-100");
assert.match(logs[0].details, /وضعیت رزرو و پرداخت تغییر نکرد/);
assert.equal(bookingWrites, 0);
assert.equal(paymentWrites, 0);
assert.equal(answers.length, 1);
logs = [];
const unauthorized = sandbox.handleTelegramCallbackQuery_({
  id:"callback-2",data:"kaenatchi:hold_review:B-100",
  message:{chat:{id:"not-admin"},message_id:45}
});
assert.equal(unauthorized.error, "TELEGRAM_ADMIN_ONLY");
assert.equal(logs.length, 0, "unauthorized user must not write audit log");
console.log("PASS authorized hold_review writes audit record only");
console.log("PASS booking/payment state remains untouched");
console.log("PASS unauthorized callback cannot create audit record");
console.log("PASS total: 3/3");
