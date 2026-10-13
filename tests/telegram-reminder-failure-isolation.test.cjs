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

const queueKey = "KAENATCHI_TELEGRAM_QUEUE";
const triggerKey = "KAENATCHI_TELEGRAM_TRIGGER_SCHEDULED";
const item = {bookingId:"B-REMINDER-THROWS",eventType:"payment_received",attempts:0};
const props = {[queueKey]:JSON.stringify([item]),[triggerKey]:"1"};
let delivered = 0;
const sandbox = {
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>Object.prototype.hasOwnProperty.call(props,key)?props[key]:null,
    setProperty:(key,value)=>{props[key]=value;},
    deleteProperty:key=>{delete props[key];}
  })},
  ScriptApp:{newTrigger:()=>({timeBased(){return this;},after(){return this;},create(){return {};}})},
  processAppointmentReminders_:()=>{throw new Error("simulated reminder-sheet failure");},
  getBookingByIdObject_:()=>({"Booking ID":item.bookingId,"Telegram ID":"CUSTOMER"}),
  sendBookingTelegramNotifications_:()=>{delivered++;return {ok:true};},
  console:{warn:()=>{}},
  Date,String,JSON,Number
};
vm.runInNewContext(extractFunction("processBookingTelegramNotificationQueue_"),sandbox,{timeout:1000});
sandbox.processBookingTelegramNotificationQueue_();
assert.equal(delivered,1,"reminder failure must not prevent queued booking notification delivery");
assert.equal(props[queueKey],"[]");
assert.equal(props["KAENATCHI_TELEGRAM_SENT:B-REMINDER-THROWS:payment_received"],"1");
console.log("PASS reminder processing failure does not abort drained payment notification queue");
