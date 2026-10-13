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

const booking={"Booking ID":"B-TG-1","Slot Key":"D|11:00"};
let queueAttempts=0,auditAttempts=0,consoleErrors=0;
const sandbox={
 CONFIG:{STAGING_MODE:true},
 queueBookingTelegramNotification_:()=>{queueAttempts++;return {ok:false,queued:false,error:"SIMULATED_QUEUE_FAILURE"};},
 appendBookingLog_:()=>{auditAttempts++;throw new Error("simulated audit storage failure");},
 console:{error:()=>{consoleErrors++;}},String,JSON
};
vm.runInNewContext(extractFunction("queueBookingTelegramNotificationWithAudit_"),sandbox,{timeout:1000});
const result=sandbox.queueBookingTelegramNotificationWithAudit_(booking,"approved");
assert.equal(result.ok,false,"queue failure must remain visible to the caller");
assert.equal(queueAttempts,1);
assert.equal(auditAttempts,1,"failed queue must attempt an audit record");
assert.equal(consoleErrors,2,"both queue failure and audit failure must be surfaced to diagnostics");
assert.equal(result.queued,false);
console.log("PASS queue failure and audit failure remain observable");
