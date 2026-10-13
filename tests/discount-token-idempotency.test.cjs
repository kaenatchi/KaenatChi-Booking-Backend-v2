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

const token = {used:true, row:[ "VIP-TEST", "C1", 5, "", "", "USED", "", "TRACK-1" ],
  customerId:"C1", telegramId:"T1"};
const sandbox = {
  CONFIG:{VIP:{USED_STATUS:"USED"}},
  findVIPDiscountToken_:()=>token,
  SpreadsheetApp:{flush:()=>{}},
  Date,String,Error
};
vm.runInNewContext(extractFunction("consumeDiscountToken_"),sandbox,{timeout:1000});
assert.doesNotThrow(()=>sandbox.consumeDiscountToken_("VIP-TEST","C1","T1","TRACK-1"),
  "retry for the same tracking code should be idempotent");
assert.throws(()=>sandbox.consumeDiscountToken_("VIP-TEST","C1","T1","TRACK-OTHER"),
  /کد تخفیف قبلاً مصرف شده است/,
  "a different booking must not reuse the consumed token");
assert.throws(()=>sandbox.consumeDiscountToken_("VIP-TEST","OTHER","T1","TRACK-1"),
  /متعلق به این حساب VIP/,
  "same tracking code must not bypass customer ownership checks");
console.log("PASS same-booking token retry is idempotent; other booking/customer remains blocked");
