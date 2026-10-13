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

const S = {
  PAYMENT_RECEIVED: "فیش دریافت شد", PAYMENT_REJECTED: "رد شد",
  PAYMENT_APPROVED: "تأیید شد", BOOKING_PENDING: "در انتظار بررسی",
  BOOKING_CONFIRMED: "تأیید شده", BOOKING_REJECTED: "رد شده",
  BOOKING_CANCELLED: "لغو شده"
};

function makeSandbox(action) {
  const booking = {
    "Booking ID": "B-QUEUE-RECOVERY", "Tracking Code": "T-QUEUE-RECOVERY",
    "Slot Key": "1405/07/21|11:00", "Appointment Date": "1405/07/21",
    "Appointment Time": "11:00", "Appointment Status": S.BOOKING_PENDING,
    "Payment Status": S.PAYMENT_RECEIVED, "Hold Until": "future",
    "Discount Code": "", "Customer ID": "C-1", "Telegram ID": "TG-1",
    _row: 2
  };
  const payment = {"Booking ID": booking["Booking ID"], "Payment Status": S.PAYMENT_RECEIVED, _row: 3};
  const logs = [];
  const properties = {};
  let queueStorageFails = true;
  const scriptProperties = {
    getProperty: key => Object.prototype.hasOwnProperty.call(properties,key) ? properties[key] : null,
    setProperty: (key,value) => {
      if (key === "KAENATCHI_TELEGRAM_QUEUE" && queueStorageFails) {
        queueStorageFails = false;
        throw new Error("simulated ScriptProperties storage failure");
      }
      properties[key] = value;
    },
    deleteProperty: key => { delete properties[key]; }
  };
  const sandbox = {
    CONFIG: {
      STATUSES: S,
      SHEETS: {PAYMENTS: "Payments", BOOKINGS: "Bookings"},
      SLOT_STATUS: {CONFIRMED: "CONFIRMED", BLOCKED: "BLOCKED"},
      LOG_ACTIONS: {ADMIN_APPROVED: "ADMIN_APPROVED", ADMIN_REJECTED: "ADMIN_REJECTED"}
    },
    withBookingLock_: fn => fn(),
    getBookingByIdObject_: () => booking,
    normalizeJalaliDate_: v => v,
    normalizeTime_: v => v,
    buildSlotKey_: (d, t) => d + "|" + t,
    getSlotStatus_: () => "AVAILABLE",
    updateRowFields_: (sheet, row, fields) => Object.assign(sheet === "Payments" ? payment : booking, fields),
    getSheetObjects_: sheet => sheet === "Payments" ? [payment] : [booking],
    consumeDiscountToken_: () => {},
    ensureBookingLogOnce_: entry => {
      if (logs.some(x => x.bookingId === entry.bookingId && x.action === entry.action)) return false;
      logs.push({...entry});
      return true;
    },
    PropertiesService: {getScriptProperties: () => scriptProperties},
    console: {warn: () => {}},
    JSON, Date, String,
    fail_: (error, message) => ({ok:false, error, message})
  };
  vm.runInNewContext(extractFunction("queueBookingTelegramNotification_"), sandbox, {timeout:1000});
  vm.runInNewContext(extractFunction(action), sandbox, {timeout:1000});
  return {
    sandbox, booking, payment, logs, properties,
    queued: () => JSON.parse(properties["KAENATCHI_TELEGRAM_QUEUE"] || "[]")
  };
}

{
  const x = makeSandbox("approveBooking_");
  const first = x.sandbox.approveBooking_({bookingId:"B-QUEUE-RECOVERY", adminId:"test-admin"});
  assert.equal(first.ok, true, "payment approval must remain successful when queue persistence fails");
  assert.equal(first.notificationQueued, false);
  assert.equal(first.notificationError, "TELEGRAM_QUEUE_SAVE_FAILED");
  assert.equal(x.booking["Payment Status"], S.PAYMENT_APPROVED);
  assert.equal(x.payment["Payment Status"], S.PAYMENT_APPROVED);
  assert.equal(x.logs.filter(l => l.action === "ADMIN_APPROVED").length, 1);

  const retry = x.sandbox.approveBooking_({bookingId:"B-QUEUE-RECOVERY", adminId:"test-admin"});
  assert.equal(retry.ok, true);
  assert.equal(retry.notificationQueued, true, "retry must recover the missing approval notice");
  assert.equal(x.logs.filter(l => l.action === "ADMIN_APPROVED").length, 1, "admin audit must not duplicate on retry");
  assert.equal(x.queued().length, 1, "approval notification must be queued exactly once");
  x.properties["KAENATCHI_TELEGRAM_SENT:"+encodeURIComponent("B-QUEUE-RECOVERY")+":"+encodeURIComponent("approved")]="1";
  const duplicate=x.sandbox.queueBookingTelegramNotification_(x.booking,"approved");
  assert.equal(duplicate.alreadySent,true,"repeating approval after successful delivery must not enqueue a second notice");
  assert.equal(x.queued().length,1,"delivered approval notification must remain deduplicated");
}

{
  const x = makeSandbox("rejectBooking_");
  const first = x.sandbox.rejectBooking_({bookingId:"B-QUEUE-RECOVERY", adminId:"test-admin", note:"receipt mismatch"});
  assert.equal(first.ok, true, "payment rejection must remain committed when queue persistence fails");
  assert.equal(first.notificationQueued, false);
  assert.equal(first.notificationError, "TELEGRAM_QUEUE_SAVE_FAILED");
  assert.equal(x.booking["Payment Status"], S.PAYMENT_REJECTED);
  assert.equal(x.booking["Appointment Status"], S.BOOKING_REJECTED);
  assert.equal(x.logs.filter(l => l.action === "ADMIN_REJECTED").length, 1);

  const retry = x.sandbox.rejectBooking_({bookingId:"B-QUEUE-RECOVERY", adminId:"test-admin", note:"receipt mismatch"});
  assert.equal(retry.ok, true);
  assert.equal(retry.notificationQueued, true, "retry must recover the missing rejection notice");
  assert.equal(x.logs.filter(l => l.action === "ADMIN_REJECTED").length, 1, "rejection audit must not duplicate on retry");
  assert.equal(x.queued().length, 1, "rejection notification must be queued exactly once");
  x.properties["KAENATCHI_TELEGRAM_SENT:"+encodeURIComponent("B-QUEUE-RECOVERY")+":"+encodeURIComponent("rejected")]="1";
  const duplicate=x.sandbox.queueBookingTelegramNotification_(x.booking,"rejected");
  assert.equal(duplicate.alreadySent,true,"repeating rejection after successful delivery must not enqueue a second notice");
  assert.equal(x.queued().length,1,"delivered rejection notification must remain deduplicated");
}


{
  const sendSource = extractFunction("sendBookingTelegramNotifications_");
  let adminAttempts = 0, customerAttempts = 0;
  const sandbox = {
    getTelegramConfig_: () => ({adminChatId:"ADMIN"}),
    buildBookingTelegramText_: () => "payment status",
    getBookingTelegramAdminKeyboard_: () => ({}),
    sendTelegramMessage_: chatId => {
      if (chatId === "ADMIN") return {ok:++adminAttempts > 1};
      customerAttempts++;
      return {ok:true};
    },
    String
  };
  vm.runInNewContext(sendSource, sandbox, {timeout:1000});
  const booking = {"Booking ID":"B-SEND-1","Telegram ID":"CUSTOMER"};
  const queueItem = {bookingId:"B-SEND-1",eventType:"approved",attempts:0};
  const first = sandbox.sendBookingTelegramNotifications_(booking, "approved", queueItem);
  assert.equal(first.results.length, 2);
  assert.equal(first.results[0].ok, false, "admin delivery intentionally fails on first attempt");
  assert.equal(first.results[1].ok, true, "customer delivery intentionally succeeds");
  assert.equal(first.ok, false, "customer success must not mask admin notification failure");
  assert.equal(queueItem.customerDelivered, true, "successful customer delivery is persisted on queue item");

  const retry = sandbox.sendBookingTelegramNotifications_(booking, "approved", queueItem);
  assert.equal(retry.ok, true, "second admin delivery succeeds");
  assert.equal(retry.results.length, 1, "successful customer recipient must be skipped on retry");
  assert.equal(adminAttempts, 2);
  assert.equal(customerAttempts, 1, "customer must not receive a duplicate on queue retry");
}


{
  const sendSource = extractFunction("sendBookingTelegramNotifications_");
  let customerAttempts = 0, adminAttempts = 0;
  const sandbox = {
    getTelegramConfig_: () => ({adminChatId:"ADMIN"}),
    buildBookingTelegramText_: () => "payment status",
    getBookingTelegramAdminKeyboard_: () => ({}),
    sendTelegramMessage_: chatId => {
      if (chatId === "ADMIN") { adminAttempts++; return {ok:true}; }
      customerAttempts++;
      return {ok:customerAttempts > 1};
    },
    String
  };
  vm.runInNewContext(sendSource, sandbox, {timeout:1000});
  const booking = {"Booking ID":"B-SEND-2","Telegram ID":"CUSTOMER"};
  const queueItem = {bookingId:"B-SEND-2",eventType:"rejected",attempts:0};
  const first = sandbox.sendBookingTelegramNotifications_(booking, "rejected", queueItem);
  assert.equal(first.ok, false, "failed customer delivery must keep the queue item retryable");
  assert.equal(queueItem.adminDelivered, true);
  const retry = sandbox.sendBookingTelegramNotifications_(booking, "rejected", queueItem);
  assert.equal(retry.ok, true, "retry should finish once the customer delivery succeeds");
  assert.equal(adminAttempts, 1, "already-delivered admin message must not be duplicated");
  assert.equal(customerAttempts, 2);
}

console.log("PASS approval/rejection queue-save failure is visible; payment state and admin audit persist; retry recovers one notification without duplicate audit/queue entries");
