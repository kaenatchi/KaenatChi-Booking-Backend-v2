const fs = require("node:fs");
const assert = require("node:assert/strict");
const source = fs.readFileSync("Code.gs", "utf8");
function body(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, "missing function " + name);
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
const lock = body("withBookingLock_");
const create = body("createBooking_");
const payment = body("submitPayment_");
const log = body("appendBookingLog_");
const callback = body("handleTelegramCallbackQuery_");
assert.match(lock, /LockService\.getScriptLock\(\)/);
assert.match(lock, /lock\.waitLock\(30000\)/);
assert.match(lock, /finally\s*\{\s*lock\.releaseLock\(\)/);
assert.match(create, /return withBookingLock_\(function\(\)/);
assert.match(payment, /return withBookingLock_\(function\(\)/);
assert.match(callback, /holdResult\s*=\s*withBookingLock_\(function\(\)/);
assert.doesNotMatch(log, /withBookingLock_\(/, "log writer must not reacquire the non-reentrant script lock");
assert.match(callback, /getSheetObjects_\(CONFIG\.SHEETS\.BOOKING_LOGS\)/);
assert.match(callback, /appendBookingLog_\(/);
console.log("PASS booking creation uses the shared script lock");
console.log("PASS payment submission uses the shared script lock");
console.log("PASS hold-review uses the same shared script lock");
console.log("PASS lock is released in finally");
console.log("PASS audit log writer does not reacquire lock (no self-deadlock)");
console.log("PASS total: 5/5 integration invariants");
