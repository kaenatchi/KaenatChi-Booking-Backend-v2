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
const queuedItem = {bookingId:"B-REQUEUE-TRANSIENT",eventType:"approved",attempts:0};
const props = {[queueKey]:JSON.stringify([queuedItem])};
let failRequeueOnce = true, triggerCreates = 0;
const sandbox = {
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>Object.prototype.hasOwnProperty.call(props,key)?props[key]:null,
    setProperty:(key,value)=>{
      if(key===queueKey && value!=="[]" && failRequeueOnce){
        failRequeueOnce=false;
        throw new Error("simulated transient queue write failure");
      }
      props[key]=value;
    },
    deleteProperty:key=>{delete props[key];}
  })},
  ScriptApp:{newTrigger:()=>({timeBased(){return this;},after(){return this;},create(){triggerCreates++;return {};}})},
  processAppointmentReminders_:()=>{},
  getBookingByIdObject_:()=>({"Booking ID":queuedItem.bookingId,"Telegram ID":"CUSTOMER"}),
  sendBookingTelegramNotifications_:()=>({ok:false}),
  console:{warn:()=>{}},
  Date, String, JSON, Number
};
vm.runInNewContext(extractFunction("processBookingTelegramNotificationQueue_"),sandbox,{timeout:1000});
sandbox.processBookingTelegramNotificationQueue_();
const saved = JSON.parse(props[queueKey] || "[]");
assert.equal(saved.length,1,"failed notification must remain queued after a transient re-persist error");
assert.equal(saved[0].bookingId,queuedItem.bookingId);
assert.equal(saved[0].attempts,1,"retry attempt count must be persisted");
assert.equal(props[triggerKey],"1","follow-up trigger should be scheduled");
assert.equal(triggerCreates,1);
console.log("PASS transient queue re-persist failure is retried and the failed notification remains durable");
