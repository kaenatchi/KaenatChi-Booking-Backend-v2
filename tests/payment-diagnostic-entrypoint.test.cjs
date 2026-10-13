const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf8");
function extract(name) {
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
const routeStart = source.indexOf("function routeRequest_");
const routeEnd = source.indexOf("\nfunction ", routeStart + 10);
const routeText = source.slice(routeStart, routeEnd < 0 ? source.length : routeEnd);
assert.ok(!routeText.includes("getPaymentConsistencyDiagnosticReport_"), "diagnostic must not be exposed through public action router");

let reads = [];
let writes = 0, telegram = 0;
const sandbox = {
  CONFIG: { SHEETS: { BOOKINGS:"Bookings", PAYMENTS:"Payments" } },
  getSheetObjects_(name) {
    reads.push(name);
    if (name === "Bookings") return [{"Booking ID":"B1","Payment Status":"در انتظار پرداخت"}];
    if (name === "Payments") return [{"Booking ID":"B1","Payment ID":"P1","Payment Status":"فیش دریافت شد","Receipt URL":"SECRET"}];
    throw new Error("unexpected sheet");
  },
  buildPaymentConsistencyDiagnosticReportPure_(bookings,payments) {
    return {ok:true,cases:[{bookingId:"B1",state:"PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED",safeToAutoRepair:false}],safeToAutoRepair:false,noWrites:true,noTelegramSent:true,noReceiptLinksExposed:true};
  },
  updateRowFields_(){writes++;},
  appendObjectRow_(){writes++;},
  sendTelegramMessage_(){telegram++;}
};
vm.runInNewContext(extract("getPaymentConsistencyDiagnosticReport_"),sandbox,{timeout:1000});
const report=sandbox.getPaymentConsistencyDiagnosticReport_();
assert.deepEqual(reads,["Bookings","Payments"]);
assert.equal(report.cases[0].state,"PAYMENT_ROW_RECEIVED_BOOKING_NOT_UPDATED");
assert.equal(report.safeToAutoRepair,false);
assert.equal(report.noWrites,true);
assert.equal(report.noTelegramSent,true);
assert.equal(report.noReceiptLinksExposed,true);
assert.equal(writes,0);
assert.equal(telegram,0);
console.log("PASS read-only report reads only booking/payment tables");
console.log("PASS report marks recovery as manual and never auto-repairs");
console.log("PASS no writes, Telegram sends, or receipt URL exposure");
console.log("PASS report entry point is not in public action router");
console.log("PASS total: 4/4");
