const fs = require("node:fs");
const path = require("node:path");
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

const config = source.match(/const CONFIG\s*=\s*\{[\s\S]*?\n\};/);
assert.ok(config, "CONFIG must exist");
assert.match(config[0], /STAGING_MODE:\s*true/, "staging must remain enabled");
const sendSource = extract("sendTelegramMessage_");
const apiSource = extract("telegramApiRequest_");
assert.match(sendSource, /if\s*\(CONFIG\.STAGING_MODE\)\s*return\s*\{ok:false,skipped:true,reason:'STAGING_MODE'\}/,
  "sendTelegramMessage_ must fail closed in staging");
assert.match(apiSource, /if\s*\(CONFIG\.STAGING_MODE\)\s*return\s*\{ok:false,skipped:true,error:'STAGING_MODE'\}/,
  "Telegram API helper must fail closed in staging");

let fetchCalls = 0;
const sandbox = {
  CONFIG: {STAGING_MODE:true},
  getTelegramConfig_: () => ({botToken:"TEST-ONLY-TOKEN"}),
  UrlFetchApp: {fetch: () => { fetchCalls++; throw new Error("network must not be reached"); }},
  console
};
const vm = require("node:vm");
vm.runInNewContext(sendSource + "\n" + apiSource, sandbox, {timeout:1000});
assert.equal(sandbox.sendTelegramMessage_("ADMIN-1","test").reason,"STAGING_MODE");
assert.equal(sandbox.telegramApiRequest_("sendMessage",{chat_id:"ADMIN-1"}).error,"STAGING_MODE");
assert.equal(fetchCalls,0,"staging must not call Telegram network");
console.log("PASS staging mode is enabled in source config");
console.log("PASS message sender and API helper both fail closed");
console.log("PASS no Telegram network call occurs");
console.log("PASS total: 3/3");
