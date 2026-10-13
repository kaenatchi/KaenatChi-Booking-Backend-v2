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
let logs = [], answers = [], bookingWrites = 0, paymentWrites = 0, failAudit = false;
let priorLogs = [];
let lockAcquires = 0, lockReleases = 0, failLock = false;
const sandbox = {
  CONFIG: {SHEETS:{BOOKING_LOGS:"BookingLogs"},LOG_ACTIONS:{PAYMENT_REVIEW_HOLD:"PAYMENT_REVIEW_HOLD"}},
  LockService: {getScriptLock: () => ({
    waitLock: ms => { assert.equal(ms,30000); lockAcquires++; if (failLock) throw new Error('simulated lock timeout'); },
    releaseLock: () => { lockReleases++; }
  })},
  getTelegramConfig_: () => ({adminChatId:"admin-1",adminUserId:"user-7"}),
  getSheetObjects_: name => { assert.equal(name,"BookingLogs"); return priorLogs; },
  appendBookingLog_: entry => { if (failAudit) throw new Error("simulated audit storage failure"); logs.push(entry); priorLogs.push({"Booking ID":entry.bookingId,Action:entry.action}); },
  answerTelegramCallbackQuery_: (...args) => answers.push(args),
  updateRowFields_: () => { bookingWrites++; },
  appendObjectRow_: () => { paymentWrites++; },
  getBookingByIdObject_: () => { throw new Error("hold-review must not fetch or mutate booking"); }
};
vm.runInNewContext(
  extractFunction("withBookingLock_") + "\n" + extractFunction("handleTelegramCallbackQuery_"),
  sandbox,
  {timeout:1000}
);
const callback = (chat, user = "user-7") => ({id:"callback-1",data:"kaenatchi:hold_review:B-100",from:user === null ? undefined : {id:user},message:{chat:{id:chat},message_id:44}});
const result = sandbox.handleTelegramCallbackQuery_(callback("admin-1"));
assert.equal(result.ok, true);
assert.equal(result.unchanged, true);
assert.equal(result.audited, true);
assert.equal(logs.length, 1);

const wrongUser = sandbox.handleTelegramCallbackQuery_(callback("admin-1", "other-user"));
assert.equal(wrongUser.error, "TELEGRAM_ADMIN_ONLY");
assert.equal(logs.length, 1, "unauthorized group member must not create audit record");
const missingUser = sandbox.handleTelegramCallbackQuery_(callback("admin-1", null));
assert.equal(missingUser.error, "TELEGRAM_ADMIN_ONLY");
assert.equal(logs.length, 1, "missing clicker identity must fail closed");
assert.equal(logs[0].action, "PAYMENT_REVIEW_HOLD");
assert.equal(logs[0].bookingId, "B-100");
assert.equal(bookingWrites, 0);
assert.equal(paymentWrites, 0);
assert.equal(answers.length, 1);
assert.equal(lockAcquires, 1, "first hold must acquire script lock");
assert.equal(lockReleases, 1, "first hold must release script lock");

answers = [];
const repeated = sandbox.handleTelegramCallbackQuery_(callback("admin-1"));
assert.equal(repeated.ok, true);
assert.equal(repeated.duplicate, true);
assert.equal(logs.length, 1, "repeat click must not duplicate audit row");
assert.equal(bookingWrites, 0);
assert.equal(paymentWrites, 0);
assert.equal(lockAcquires, 2, "repeat must check idempotency under lock");
assert.equal(lockReleases, 2, "repeat must release lock");

const unauthorized = sandbox.handleTelegramCallbackQuery_(callback("not-admin"));
assert.equal(unauthorized.error, "TELEGRAM_ADMIN_ONLY");
assert.equal(logs.length, 1);

priorLogs = [];
failAudit = true;
answers = [];
const failed = sandbox.handleTelegramCallbackQuery_(callback("admin-1"));
assert.equal(failed.ok, false);
assert.equal(failed.error, "PAYMENT_REVIEW_AUDIT_FAILED");
assert.equal(failed.unchanged, true);
assert.equal(answers.length, 1);
assert.equal(answers[0][2], true);
assert.equal(bookingWrites, 0);
assert.equal(paymentWrites, 0);
assert.equal(lockAcquires, 3, "audit failure path also acquires lock");
assert.equal(lockReleases, 3, "lock releases when audit append throws");

priorLogs = [];
failAudit = false;
failLock = true;
answers = [];
const lockFailed = sandbox.handleTelegramCallbackQuery_(callback("admin-1"));
assert.equal(lockFailed.ok, false);
assert.equal(lockFailed.error, "PAYMENT_REVIEW_AUDIT_FAILED");
assert.equal(lockFailed.unchanged, true);
assert.equal(logs.length, 1, "lock timeout must not append audit record");
assert.equal(answers.length, 1);
assert.equal(answers[0][2], true);
assert.equal(lockReleases, 3, "lock that was never acquired must not be released");

console.log("PASS actual withBookingLock_ acquires and releases script lock");
console.log("PASS first hold-review writes one audit record only");
console.log("PASS repeated click is idempotent and creates no duplicate log");
console.log("PASS unauthorized callback cannot create audit record");
console.log("PASS audit failure is reported without claiming success");
console.log("PASS lock acquisition timeout fails closed without logging");
console.log("PASS total: 5/5 scenarios");
