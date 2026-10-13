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

let warnings = 0;
const booking = {"Booking ID":"B-TG-1"};
const sandbox = {
  PropertiesService: {getScriptProperties: () => ({getProperty: () => { throw new Error("simulated queue storage failure"); }})},
  console: {warn: () => { warnings++; }},
  Date, String, JSON
};
vm.runInNewContext(extractFunction("queueBookingTelegramNotification_"), sandbox, {timeout:1000});
const result = sandbox.queueBookingTelegramNotification_(booking, "approved");
assert.equal(result.ok, false, "storage failure must not be reported as queued");
assert.equal(result.queued, false);
assert.equal(warnings, 1, "queue failure should be visible in diagnostics");
console.log("PASS queue storage failure is caught and reported without claiming notification queued");
