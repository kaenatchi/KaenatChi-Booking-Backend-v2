const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");

function extractFunction(name) {
  const marker = "function " + name + "(";
  const start = source.indexOf(marker);
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

const now = Date.parse("2026-10-13T12:00:00.000Z");
const expiredBy121Minutes = new Date(now - 121 * 60 * 1000);
const expiredBy11Minutes = new Date(now - 11 * 60 * 1000);
const future = new Date(now + 10 * 60 * 1000);

const sandbox = {
  CONFIG: {
    STATUSES: {
      BOOKING_PENDING: "در انتظار بررسی",
      BOOKING_CONFIRMED: "تأیید شده",
      PAYMENT_PENDING: "در انتظار پرداخت",
      PAYMENT_RECEIVED: "فیش دریافت شد",
      PAYMENT_APPROVED: "تأیید شد"
    }
  },
  parseDateValue_: value => {
    if (value instanceof Date) return value;
    if (value === null || value === undefined || value === "") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
};

vm.runInNewContext(extractFunction("shouldReleaseExpiredHold_"), sandbox, { timeout: 1000 });

const cases = [
  {
    name: "expired unpaid hold can be released",
    row: { "Appointment Status": "در انتظار بررسی", "Payment Status": "در انتظار پرداخت", "Hold Until": expiredBy11Minutes },
    expected: true
  },
  {
    name: "receipt stays held even 121 minutes after expiry",
    row: { "Appointment Status": "در انتظار بررسی", "Payment Status": "فیش دریافت شد", "Hold Until": expiredBy121Minutes },
    expected: false
  },
  {
    name: "approved payment is not auto-released before final booking decision",
    row: { "Appointment Status": "در انتظار بررسی", "Payment Status": "تأیید شد", "Hold Until": expiredBy121Minutes },
    expected: false
  },
  {
    name: "future unpaid hold stays held",
    row: { "Appointment Status": "در انتظار بررسی", "Payment Status": "در انتظار پرداخت", "Hold Until": future },
    expected: false
  },
  {
    name: "confirmed booking is not auto-released",
    row: { "Appointment Status": "تأیید شده", "Payment Status": "در انتظار پرداخت", "Hold Until": expiredBy121Minutes },
    expected: false
  },
  {
    name: "missing hold deadline fails closed",
    row: { "Appointment Status": "در انتظار بررسی", "Payment Status": "در انتظار پرداخت", "Hold Until": "" },
    expected: false
  }
];

for (const test of cases) {
  assert.equal(sandbox.shouldReleaseExpiredHold_(test.row, now), test.expected, test.name);
}
assert.equal(sandbox.shouldReleaseExpiredHold_(null, now), false, "missing booking row must fail closed");

console.log("PASS expired unpaid hold is eligible for release");
console.log("PASS received receipt remains held beyond the 120-minute review window");
console.log("PASS approved payment, future hold, and confirmed booking are not auto-released");
console.log("PASS missing hold deadline and missing row fail closed");
console.log("PASS total: " + (cases.length + 1) + "/" + (cases.length + 1));
