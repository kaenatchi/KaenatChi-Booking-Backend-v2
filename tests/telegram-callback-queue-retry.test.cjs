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

function runCase(queueOk) {
  const calls = {answers: [], edits: 0, approvals: 0};
  const sandbox = {
    getTelegramConfig_: () => ({adminChatId: "ADMIN"}),
    answerTelegramCallbackQuery_: (...args) => calls.answers.push(args),
    editTelegramMessageReplyMarkup_: () => { calls.edits++; },
    getBookingTelegramResultKeyboard_: status => ({status}),
    approveBooking_: () => {
      calls.approvals++;
      return queueOk
        ? {ok:true, notificationQueued:true, message:"نوبت تأیید شد."}
        : {ok:true, notificationQueued:false, notificationError:"TELEGRAM_QUEUE_SAVE_FAILED",
           message:"ذخیره اعلان تلگرام ناموفق بود؛ همان دکمه را دوباره بزنید."};
    },
    rejectBooking_: () => ({ok:true, notificationQueued:queueOk}),
    String
  };
  vm.runInNewContext(extractFunction("handleTelegramCallbackQuery_"), sandbox, {timeout:1000});
  const result = sandbox.handleTelegramCallbackQuery_({
    id:"CALLBACK-1", data:"kaenatchi:approve:BOOKING-1",
    message:{chat:{id:"ADMIN"}, message_id:77}
  });
  return {result, calls};
}

const failed = runCase(false);
assert.equal(failed.result.ok, true, "the booking decision is committed");
assert.equal(failed.result.notificationQueued, false);
assert.equal(failed.result.notificationError, "TELEGRAM_QUEUE_SAVE_FAILED");
assert.equal(failed.calls.edits, 0, "keep approve button available so admin can retry queue recovery");
assert.equal(failed.calls.answers[0][1].includes("ذخیره اعلان تلگرام ناموفق بود"), true);
assert.equal(failed.calls.answers[0][2], true, "show the warning to the admin");

const succeeded = runCase(true);
assert.equal(succeeded.result.notificationQueued, true);
assert.equal(succeeded.calls.edits, 1, "finalize keyboard only after notification is queued");
assert.equal(succeeded.calls.answers[0][2], false);
console.log("PASS Telegram callback preserves retry button after queue-save failure and finalizes only on success");
