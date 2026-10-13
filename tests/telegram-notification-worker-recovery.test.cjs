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
    if (ch === "'" || ch === '"' || ch === "\`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}
const names = ["processBookingTelegramNotificationQueue_", "mergeTelegramQueueItemsPure_",
  "isTelegramQueueItemReadyPure_", "getTelegramRetryDelayMsPure_",
  "isTelegramDeliveryConfirmedPure_", "shouldRetryTelegramNotification_",
  "ensureTelegramQueueTriggerScheduled_", "readTelegramQueueProperty_",
  "isTelegramQueuePropertyWithinLimitPure_"];
const functions = names.map(extractFunction).join("\n\n");
const props = new Map();
const scheduled = [];
let now = Date.parse("2026-10-13T12:00:00.000Z");
let uuid = 0, sendMode = "failure", sendCalls = 0;
const fakeDate = class extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const propertyStore = {
  getProperty: key => props.has(key) ? props.get(key) : null,
  setProperty: (key,value) => { props.set(key,String(value)); },
  deleteProperty: key => { props.delete(key); }
};
const sandbox = {
  CONFIG: {STAGING_MODE:false},
  LockService: {getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  PropertiesService: {getScriptProperties:()=>propertyStore},
  ScriptApp: {newTrigger:name=>({timeBased:()=>({after:ms=>({create:()=>{scheduled.push({name,ms});return {};}})})})},
  Utilities: {getUuid:()=>"uuid-"+(++uuid)},
  Date: fakeDate, JSON, Math, Number, String, Array, Object, isFinite, console,
  processAppointmentReminders_:()=>({ok:true}),
  getBookingByIdObject_:id=>id==="B-1"?{"Booking ID":"B-1"}:null,
  sendBookingTelegramNotifications_:()=>{sendCalls++;return sendMode==="failure"?{ok:false,error:"SIMULATED_SEND_FAILURE"}:{ok:true,results:[{recipient:"admin",result:{ok:true}}]};}
};
vm.runInNewContext(functions, sandbox, {timeout:1000});
props.set("KAENATCHI_TELEGRAM_QUEUE",JSON.stringify([{id:"item-1",bookingId:"B-1",eventType:"payment_received",queuedAt:new Date(now).toISOString(),attempts:0}]));
props.set("KAENATCHI_TELEGRAM_INFLIGHT","[]");
const failed = sandbox.processBookingTelegramNotificationQueue_();
assert.equal(failed.ok,false,"worker reports failed delivery");
assert.equal(failed.failed,1);
let inflight=JSON.parse(props.get("KAENATCHI_TELEGRAM_INFLIGHT"));
assert.equal(inflight.length,1,"failed notification remains durable");
assert.equal(inflight[0].attempts,1,"attempt counter increments");
assert.match(inflight[0].lastError,/Telegram delivery failed/,"worker records a durable delivery failure reason");
assert.equal(Date.parse(inflight[0].retryAt),now+5000,"first retry is delayed by five seconds");
assert.ok(scheduled.some(x=>x.name==="processBookingTelegramNotificationQueue_"),"retry trigger scheduled");
console.log("PASS failed delivery remains in durable queue with retry metadata");
now += 5000;
sendMode="success";
const recovered = sandbox.processBookingTelegramNotificationQueue_();
assert.equal(recovered.ok,true);
assert.equal(recovered.sent,1);
inflight=JSON.parse(props.get("KAENATCHI_TELEGRAM_INFLIGHT"));
assert.equal(inflight.length,0,"confirmed delivery removes item from in-flight queue");
assert.equal(sendCalls,2,"worker retried exactly once in this fixture");
console.log("PASS retry after retryAt succeeds and clears in-flight item");
props.set("KAENATCHI_TELEGRAM_QUEUE","{malformed");
let threw=false;
try { sandbox.processBookingTelegramNotificationQueue_(); } catch(e) { threw=true; }
assert.equal(threw,true,"malformed queue must fail visibly rather than be silently cleared");
assert.equal(props.get("KAENATCHI_TELEGRAM_QUEUE"),"{malformed","malformed queue is preserved");
console.log("PASS malformed queue is preserved for diagnosis");
console.log("PASS total: 3/3 scenarios");
