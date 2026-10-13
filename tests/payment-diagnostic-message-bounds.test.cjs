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

const cases = Array.from({length:40}, (_,i) => ({
  bookingId: "B-"+i+" <script>INJECTED</script>",
  state: "MISMATCH & <private>",
  appointmentStatus: "STATUS",
  bookingPaymentStatus: "PAYMENT",
  receiptUrl: "PRIVATE-URL"
}));
let sentMessage = "";
const sandbox = {
  getTelegramConfig_: () => ({adminChatId:"ADMIN",adminUserId:"7"}),
  answerTelegramCallbackQuery_: () => ({ok:true}),
  getPaymentConsistencyDiagnosticReport_: () => ({caseCount:cases.length,cases}),
  sendTelegramMessage_: (chatId,message) => { assert.equal(chatId,"ADMIN"); sentMessage=message; return {ok:true}; }
};
vm.runInNewContext(extract("handleTelegramCallbackQuery_"),sandbox,{timeout:1000});
const result=sandbox.handleTelegramCallbackQuery_({
  id:"Q",data:"kaenatchi:payment_diagnostics",from:{id:7},message:{chat:{id:"ADMIN"},message_id:1}
});
assert.equal(result.ok,true);
assert.ok(sentMessage.length <= 3500,"report must stay under conservative Telegram message budget");
assert.ok(!sentMessage.includes("<script>"),"dynamic report fields must be HTML escaped");
assert.ok(!sentMessage.includes("PRIVATE-URL"),"receipt URL must never be included");
assert.ok(!sentMessage.includes("<script>"),"HTML tags must not survive escaping");
assert.ok(sentMessage.includes("&lt;script&gt;"),"untrusted booking ID should be escaped");
assert.ok(sentMessage.includes("تعداد موارد") || sentMessage.includes("موارد:"),"report should show a count");
console.log("PASS long diagnostic is bounded for Telegram");
console.log("PASS dynamic fields are HTML escaped");
console.log("PASS receipt URLs remain hidden");
console.log("PASS total: 3/3");
