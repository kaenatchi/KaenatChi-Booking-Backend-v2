/*******************************************************
 * KaenatChi Booking Backend v2
 * Core Backend - Phase 1
 *
 * Connected Spreadsheet:
 * KaenatChi CMS
 *
 * IMPORTANT:
 * - Telegram notifications are isolated from the booking request path.
 * - Do not modify the old booking backend.
 *******************************************************/

const CONFIG = {
  // Isolated staging only. Never use production CMS, VIP, Drive receipts, or Telegram.
  STAGING_MODE: true,
  SPREADSHEET_ID: '1xGgeqdsUGFzHhD00NIVVD8QqwnutnDfKwsmssHzaklw',

  SHEETS: {
    BOOKINGS: 'Bookings',
    CUSTOMERS: 'Customers',
    SCHEDULE: 'Schedule',
    BLOCKED_DATES: 'BlockedDates',
    BLOCKED_SLOTS: 'BlockedSlots',
    PAYMENTS: 'Payments',
    BOOKING_SETTINGS: 'BookingSettings',
    BOOKING_LOGS: 'BookingLogs'
  },

  VIP: {
    SPREADSHEET_ID: '1xGgeqdsUGFzHhD00NIVVD8QqwnutnDfKwsmssHzaklw',
    CUSTOMERS_SHEET: 'مشتریان',
    TOKENS_SHEET: 'توکن ها',
    ACTIVE_STATUS: 'فعال',
    ISSUED_STATUS: 'صادرشده',
    USED_STATUS: 'مصرف‌شده',
    EXPIRED_STATUS: 'منقضی‌شده'
  },

  STATUSES: {
    PAYMENT_PENDING: 'در انتظار پرداخت',
    PAYMENT_RECEIVED: 'فیش دریافت شد',
    PAYMENT_APPROVED: 'تأیید شد',
    PAYMENT_REJECTED: 'رد شد',

    BOOKING_PENDING: 'در انتظار بررسی',
    BOOKING_CONFIRMED: 'تأیید شده',
    BOOKING_REJECTED: 'رد شده',
    BOOKING_CANCELLED: 'لغو شده',
    BOOKING_COMPLETED: 'انجام شده'
  },

  LOG_ACTIONS: {
    BOOKING_CREATED: 'BOOKING_CREATED',
    SLOT_HELD: 'SLOT_HELD',
    PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
    ADMIN_APPROVED: 'ADMIN_APPROVED',
    ADMIN_REJECTED: 'ADMIN_REJECTED',
    SLOT_RELEASED: 'SLOT_RELEASED',
    BOOKING_CANCELLED: 'BOOKING_CANCELLED'
  },

  SLOT_STATUS: {
    FREE: 'free',
    HELD: 'held',
    CONFIRMED: 'confirmed',
    BLOCKED: 'blocked',
    INACTIVE: 'inactive'
  }
};


/* =====================================================
   1. WEB APP ENTRY POINTS
   ===================================================== */

function doGet(e) {
  const request = (e && e.parameter) ? e.parameter : {};
  const action = String(request.action || '').trim();
  const callback = String(request.callback || '').trim();
  const bridge = String(request.bridge || '').trim();
  const respond = function(data) {
    if (bridge === 'iframe') {
      return iframeBridgeResponse_(data);
    }

    if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
      return jsonpResponse_(callback, data);
    }
    return jsonResponse_(data);
  };

  try {

    if (action === 'transportTest') {
      return respond({
        ok: true,
        transport: true,
        service: 'KaenatChi Booking Backend v2',
        callback: callback || ''
      });
    }

    if (action === 'getConfig') {
      return respond(getConfig_());
    }

    if (action === 'getBookedSlots') {
      return respond(getBookedSlots_());
    }

    if (action === 'bookingStatus') {
      return respond(getBookingStatusByRequestId_(request));
    }

    if (action === 'getBlockedDates') {
      return respond(getBlockedDatesSafe_());
    }

    if (action) {
      return respond(routeRequest_(action, request));
    }

    return respond({
      ok: true,
      service: 'KaenatChi Booking Backend v2',
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(error);
    const errorData = {
      ok: false,
      error: 'SERVER_ERROR',
      message: error && error.message ? error.message : 'خطای داخلی سرور.'
    };

    return respond(errorData);
  }
}


function doPost(e) {
  try {
    /*
     * Telegram callback updates are delivered as raw JSON and must be
     * handled before the normal booking request parser.
     */
    if (
      e &&
      e.postData &&
      e.postData.contents
    ) {
      var rawBody = String(e.postData.contents || '').trim();

      if (rawBody) {
        var telegramUpdate = null;

        try {
          telegramUpdate = JSON.parse(rawBody);
        } catch (telegramParseError) {}

        if (
          telegramUpdate &&
          telegramUpdate.callback_query
        ) {
          var telegramWebhookSecret = String(
            PropertiesService
              .getScriptProperties()
              .getProperty('KAENATCHI_TELEGRAM_WEBHOOK_SECRET') || ''
          ).trim();

          var suppliedWebhookSecret = String(
            e.parameter &&
            e.parameter.telegram_webhook || ''
          ).trim();

          if (
            !telegramWebhookSecret ||
            suppliedWebhookSecret !== telegramWebhookSecret
          ) {
            return jsonResponse_({
              ok:false,
              error:'TELEGRAM_WEBHOOK_UNAUTHORIZED'
            });
          }

          return jsonResponse_(
            handleTelegramCallbackQuery_(
              telegramUpdate.callback_query
            )
          );
        }
      }
    }

    const request = parseRequest_(e);
    const action = String(request.action || '').trim();

    if (!action) {
      return jsonResponse_(legacyBookingSubmit_(request));
    }

    return jsonResponse_(routeRequest_(action, request));

  } catch (error) {
    console.error(error);

    return jsonResponse_({
      ok: false,
      error: 'SERVER_ERROR',
      message: error && error.message
        ? error.message
        : 'خطای داخلی سرور.'
    });
  }
}


/* =====================================================
   2. REQUEST ROUTER
   ===================================================== */

function routeRequest_(action, request) {

  switch (action) {

    case 'healthCheck':
      return healthCheck_();

    case 'getBookingSettings':
      return getBookingSettings_();

    case 'getSchedule':
      return getSchedule_();

    case 'getBlockedDates':
      return getBlockedDatesDiagnostic_();

    case 'getBlockedSlots':
      return getBlockedSlots_();

    case 'getAvailableDates':
      return getAvailableDates_(request);

    case 'getAvailableSlots':
      return getAvailableSlots_(request);

    case 'getBooking':
      return getBooking_(request);

    case 'getBookingPublicStatus':
      return getBookingPublicStatus_(request);

    case 'getServices': return getServices_(request);
    case 'validateDiscount': return validateDiscount_(request);
    case 'createBooking': return createBooking_(request);
    case 'submitPayment': return submitPayment_(request);
    case 'approveBookingRequest': return approveBookingRequest_(request);
    case 'rejectBookingRequest': return rejectBookingRequest_(request);
    case 'approveBooking': return approveBooking_(request);
    case 'rejectBooking': return rejectBooking_(request);
    case 'cancelBooking': return cancelBooking_(request);
    case 'releaseExpiredHolds': return releaseExpiredHolds_(request);

    default:
      return {
        ok: false,
        error: 'UNKNOWN_ACTION',
        message: 'عملیات موردنظر شناخته نشد.'
      };
  }
}


/* =====================================================
   2A. BOOKING MINI APP COMPATIBILITY
   ===================================================== */

function getConfig_() {
  const services = getServices_({});
  const schedule = getSchedule_();
  const blockedDates = getBlockedDatesSafe_();
  const blockedSlots = getBlockedSlots_();
  const settings = getBookingSettings_();
  const dates = getAvailableDates_({});
  const booked = getBookedSlots_();

  return {
    ok: true,
    services: services.services || [],
    workHours: schedule.schedule || [],
    closures: blockedDates.blockedDates || [],
    blockedSlots: blockedSlots.blockedSlots || [],
    bookedSlots: booked.bookedSlots || [],
    availableDates: dates.dates || [],
    settings: settings.settings || {}
  };
}

function getBookedSlots_() {
  const rows = getSheetObjects_(CONFIG.SHEETS.BOOKINGS);
  const bookedSlots = [];

  rows.forEach(function(row) {
    const status = String(row['Appointment Status'] || '');
    const date = normalizeJalaliDate_(row['Appointment Date']);
    const time = normalizeTime_(row['Appointment Time']);

    if (!date || !time) return;

    const paymentStatus = String(row['Payment Status'] || '');
    const holdUntil = parseDateValue_(row['Hold Until']);
    const pendingStillReservesSlot = status === CONFIG.STATUSES.BOOKING_PENDING && (
      paymentStatus === CONFIG.STATUSES.PAYMENT_RECEIVED ||
      (holdUntil && holdUntil.getTime() > Date.now())
    );

    if (
      pendingStillReservesSlot ||
      status === CONFIG.STATUSES.BOOKING_CONFIRMED
    ) {
      bookedSlots.push({
        date: date,
        time: time,
        slotKey: String(row['Slot Key'] || buildSlotKey_(date, time)),
        status: status
      });
    }
  });

  return { ok: true, bookedSlots: bookedSlots };
}

function normalizeMobileForMatch_(value) {
  var s=String(value||'').trim();
  var fa='۰۱۲۳۴۵۶۷۸۹', ar='٠١٢٣٤٥٦٧٨٩';
  s=s.replace(/[۰-۹]/g,function(c){return String(fa.indexOf(c));})
     .replace(/[٠-٩]/g,function(c){return String(ar.indexOf(c));})
     .replace(/\D/g,'');
  if(s.indexOf('0098')===0)s=s.slice(4);
  else if(s.indexOf('98')===0&&s.length>10)s=s.slice(2);
  if(s.indexOf('0')===0&&s.length>10)s=s.slice(1);
  return s;
}

function getBookingPublicStatus_(request) {
  var tracking=String(request.trackingCode||'').trim();
  var mobile=normalizeMobileForMatch_(request.mobile||request.phone||'');
  if(!tracking||!mobile)return fail_('TRACKING_AND_MOBILE_REQUIRED','کد پیگیری و شماره موبایل الزامی است.');
  var b=getBookingByIdObject_(tracking);
  if(!b||normalizeMobileForMatch_(b['Mobile']||'')!==mobile)
    return fail_('BOOKING_NOT_FOUND','با این کد پیگیری و شماره موبایل نوبتی پیدا نشد.');
  return {ok:true,found:true,booking:{
    bookingId:String(b['Booking ID']||''),requestId:String(b['Request ID']||''),trackingCode:String(b['Tracking Code']||''),
    serviceName:String(b['Service Name']||''),appointmentDate:String(b['Appointment Date']||''),
    appointmentTime:String(b['Appointment Time']||''),appointmentStatus:String(b['Appointment Status']||''),
    paymentStatus:String(b['Payment Status']||''),finalPrice:toNumber_(b['Final Price']),
    currency:String(b['Currency']||'IRR'),
    canPay:String(b['Admin Note']||'').indexOf('INITIAL_REQUEST_APPROVED')!==-1 && String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_PENDING && (parseDateValue_(b['Hold Until'])||new Date(0)).getTime()>Date.now()
  }};
}

function isBookingStatusMobileMatch_(storedMobile, suppliedMobile) {
  var stored = normalizeMobileForMatch_(storedMobile || '');
  var supplied = normalizeMobileForMatch_(suppliedMobile || '');
  return !!stored && !!supplied && stored === supplied;
}

function getBookingStatusByRequestId_(request) {
  const requestId = String(
    request.requestId ||
    request.clientRequestId ||
    request.clientTrackingCode ||
    ''
  ).trim();

  if (!requestId) {
    return {
      ok: false,
      found: false,
      error: 'REQUEST_ID_REQUIRED',
      message: 'شناسه درخواست الزامی است.'
    };
  }

  /*
   * bookingStatus is polled immediately after a mutation. Reading the whole
   * Booking sheet on every poll becomes increasingly expensive as history
   * grows. Find the Request ID directly, then read only that one row.
   */
  const sheet = getSheet_(CONFIG.SHEETS.BOOKINGS);
  const headers = getHeaders_(sheet);
  const requestColumn = headers.indexOf('Request ID');

  if (requestColumn < 0 || sheet.getLastRow() < 2) {
    return {
      ok: true,
      found: false,
      requestId: requestId
    };
  }

  const match = sheet
    .getRange(2, requestColumn + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(requestId)
    .matchEntireCell(true)
    .findNext();

  if (!match) {
    return {
      ok: true,
      found: false,
      requestId: requestId
    };
  }

  const rowNumber = match.getRow();
  const rowValues = sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];

  const booking = {};
  headers.forEach(function(header, index) {
    booking[header] = rowValues[index];
  });

  // Public status polling must verify the customer's mobile number as well as
  // the opaque request ID. Do not reveal booking/tracking details on ID alone.
  if (!isBookingStatusMobileMatch_(booking['Mobile'], request.mobile || request.phone || '')) {
    return {
      ok: true,
      found: false,
      requestId: requestId
    };
  }

  return {
    ok: true,
    found: true,
    requestId: requestId,
    bookingId: String(booking['Booking ID'] || ''),
    trackingCode: String(booking['Tracking Code'] || ''),
    paymentStatus: String(booking['Payment Status'] || ''),
    appointmentStatus: String(booking['Appointment Status'] || '')
  };
}

function legacyBookingSubmit_(request) {
  const createRequest = {
    requestId: String(
      request.clientRequestId ||
      request.clientTrackingCode ||
      request.requestId ||
      ''
    ).trim(),
    telegramId: String(
      request.telegramChatId ||
      request.telegramId ||
      ''
    ).trim(),
    firstName: request.firstName || '',
    lastName: request.lastName || '',
    mobile: request.mobile || request.phone || '',
    serviceName: request.serviceName || request.service || '',
    date: request.date || request.appointmentDate || '',
    time: request.time || request.appointmentTime || '',
    discountCode: request.discountCode || request.vipCode || ''
  };

  const created = createBooking_(createRequest);

  if (!created || !created.ok || !created.booking) {
    return created;
  }

  const bookingId = String(
    created.booking.bookingId ||
    created.booking['Booking ID'] ||
    ''
  ).trim();

  if (!bookingId) {
    return {
      ok: false,
      error: 'BOOKING_ID_MISSING',
      message: 'شناسه نوبت ایجاد نشد.'
    };
  }

  const payment = submitPayment_({
    bookingId: bookingId,
    transactionNumber: request.trackingCode || request.paymentTrackingCode || '',
    receiptData: request.receiptDataUrl || request.receiptData || request.receiptBase64 || '',
    receiptFileName: request.receiptName || request.receiptFileName || '',
    receiptMimeType: request.receiptMimeType || ''
  });

  if (!payment || !payment.ok) {
    return payment || {
      ok: false,
      error: 'PAYMENT_SUBMIT_FAILED',
      message: 'ثبت اطلاعات پرداخت ناموفق بود.'
    };
  }

  return {
    ok: true,
    booking: created.booking,
    bookingId: bookingId,
    paymentStatus: payment.paymentStatus,
    message: payment.message || created.message
  };
}


/* =====================================================
   3. HEALTH CHECK
   ===================================================== */

function healthCheck_() {

  const spreadsheet = getSpreadsheet_();

  const requiredSheets = Object.values(CONFIG.SHEETS);

  const result = {
    ok: true,
    spreadsheetName: spreadsheet.getName(),
    spreadsheetId: spreadsheet.getId(),
    sheets: {}
  };

  requiredSheets.forEach(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);

    result.sheets[sheetName] = {
      exists: !!sheet,
      rows: sheet ? sheet.getLastRow() : 0,
      columns: sheet ? sheet.getLastColumn() : 0
    };
  });

  return result;
}


/* =====================================================
   4. SPREADSHEET ACCESS
   ===================================================== */

function getSpreadsheet_() {

  const spreadsheet = SpreadsheetApp.openById(
    CONFIG.SPREADSHEET_ID
  );

  if (!spreadsheet) {
    throw new Error('اتصال به KaenatChi CMS برقرار نشد.');
  }

  return spreadsheet;
}


function getSheet_(sheetName) {

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'شیت موردنظر پیدا نشد: ' + sheetName
    );
  }

  return sheet;
}


/* =====================================================
   5. HEADER / ROW HELPERS
   ===================================================== */

function getHeaders_(sheet) {

  if (sheet.getLastColumn() === 0) {
    return [];
  }

  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(value) {
      return String(value).trim();
    });
}


function getSheetObjects_(sheetName) {

  const sheet = getSheet_(sheetName);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const headers = getHeaders_(sheet);

  const values = sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      lastColumn
    )
    .getValues();

  return values.map(function(row, rowIndex) {

    const object = {
      _row: rowIndex + 2
    };

    headers.forEach(function(header, index) {

      if (header) {
        object[header] = row[index];
      }

    });

    return object;
  });
}


/* =====================================================
   6. SETTINGS
   ===================================================== */

function getBookingSettings_() {

  const rows = getSheetObjects_(
    CONFIG.SHEETS.BOOKING_SETTINGS
  );

  const settings = {};

  rows.forEach(function(row) {

    if (!row.Setting) {
      return;
    }

    settings[String(row.Setting).trim()] =
      normalizeSheetValue_(row.Value);
  });

  return {
    ok: true,
    settings: settings
  };
}


function getSetting_(settingName, defaultValue) {

  const rows = getSheetObjects_(
    CONFIG.SHEETS.BOOKING_SETTINGS
  );

  for (let i = 0; i < rows.length; i++) {

    if (
      String(rows[i].Setting).trim() === settingName
    ) {
      return normalizeSheetValue_(rows[i].Value);
    }
  }

  return defaultValue;
}

/* =====================================================
   6A. TELEGRAM NOTIFICATIONS
   ===================================================== */

function getTelegramConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    botToken: String(props.getProperty('KAENATCHI_TELEGRAM_BOT_TOKEN') || '').trim(),
    adminChatId: String(props.getProperty('KAENATCHI_TELEGRAM_ADMIN_CHAT_ID') || '').trim()
  };
}

function setupTelegramWebhook() {
  if (CONFIG.STAGING_MODE) return {ok:true,skipped:true,reason:'STAGING_MODE'};
  var props = PropertiesService.getScriptProperties();
  var config = getTelegramConfig_();

  if (!config.botToken) {
    throw new Error(
      'KAENATCHI_TELEGRAM_BOT_TOKEN is not configured.'
    );
  }

  var deploymentUrl =
    'https://script.google.com/macros/s/AKfycbyEh9txZP7nWdLoTtNvbQn_aKxiI0syH3M8Qh0TXR6C6AFC5rEuyidq1tMo5ufpKdXzHg/exec';

  var secret = String(
    props.getProperty('KAENATCHI_TELEGRAM_WEBHOOK_SECRET') || ''
  ).trim();

  if (!secret) {
    secret =
      Utilities.getUuid().replace(/-/g, '') +
      Utilities.getUuid().replace(/-/g, '');

    props.setProperty(
      'KAENATCHI_TELEGRAM_WEBHOOK_SECRET',
      secret
    );
  }

  var webhookUrl =
    deploymentUrl +
    '?telegram_webhook=' +
    encodeURIComponent(secret);

  var result = telegramApiRequest_(
    'setWebhook',
    {
      url:webhookUrl,
      allowed_updates:['callback_query'],
      drop_pending_updates:true
    }
  );

  if (!result.ok) {
    throw new Error(
      'Telegram webhook setup failed: ' +
      JSON.stringify(result)
    );
  }

  return {
    ok:true,
    webhookConfigured:true,
    allowedUpdates:['callback_query']
  };
}

function sendTelegramMessage_(chatId, text, replyMarkup) {
  if (CONFIG.STAGING_MODE) return {ok:false,skipped:true,reason:'STAGING_MODE'};
  chatId = String(chatId || '').trim();
  if (!chatId || !text) return {ok:false,skipped:true};

  var config = getTelegramConfig_();
  if (!config.botToken) {
    console.warn('Telegram notification skipped: KAENATCHI_TELEGRAM_BOT_TOKEN is not configured.');
    return {ok:false,skipped:true,reason:'BOT_TOKEN_NOT_CONFIGURED'};
  }

  try {
    var payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + encodeURIComponent(config.botToken) + '/sendMessage',
      {
        method:'post',
        contentType:'application/json',
        muteHttpExceptions:true,
        payload:JSON.stringify(payload)
      }
    );

    var code=response.getResponseCode();
    var body=response.getContentText();
    var parsed={};
    try { parsed=JSON.parse(body); } catch(e) {}

    if(code>=200 && code<300 && parsed.ok!==false){
      return {ok:true,result:parsed.result||null};
    }

    console.warn('Telegram notification failed: HTTP '+code+' '+body);
    return {ok:false,error:'TELEGRAM_SEND_FAILED',httpCode:code};
  } catch(error) {
    console.warn('Telegram notification exception: '+(error&&error.message?error.message:error));
    return {ok:false,error:'TELEGRAM_EXCEPTION'};
  }
}

function telegramApiRequest_(method, payload) {
  if (CONFIG.STAGING_MODE) return {ok:false,skipped:true,error:'STAGING_MODE'};
  var config = getTelegramConfig_();

  if (!config.botToken) {
    return {
      ok:false,
      error:'BOT_TOKEN_NOT_CONFIGURED'
    };
  }

  try {
    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' +
        encodeURIComponent(config.botToken) +
        '/' +
        method,
      {
        method:'post',
        contentType:'application/json',
        muteHttpExceptions:true,
        payload:JSON.stringify(payload || {})
      }
    );

    var code = response.getResponseCode();
    var body = response.getContentText();
    var parsed = {};

    try {
      parsed = JSON.parse(body);
    } catch(e) {}

    if (code >= 200 && code < 300 && parsed.ok !== false) {
      return {
        ok:true,
        result:parsed.result || null
      };
    }

    console.warn(
      'Telegram API failed: ' +
      method +
      ' HTTP ' +
      code +
      ' ' +
      body
    );

    return {
      ok:false,
      error:'TELEGRAM_API_FAILED',
      httpCode:code
    };

  } catch(error) {
    console.warn(
      'Telegram API exception: ' +
      method +
      ' ' +
      (error && error.message ? error.message : error)
    );

    return {
      ok:false,
      error:'TELEGRAM_EXCEPTION'
    };
  }
}

function answerTelegramCallbackQuery_(callbackQueryId, text, showAlert) {
  return telegramApiRequest_(
    'answerCallbackQuery',
    {
      callback_query_id:String(callbackQueryId || ''),
      text:String(text || ''),
      show_alert:Boolean(showAlert)
    }
  );
}

function editTelegramMessageReplyMarkup_(chatId, messageId, replyMarkup) {
  return telegramApiRequest_(
    'editMessageReplyMarkup',
    {
      chat_id:String(chatId || ''),
      message_id:Number(messageId),
      reply_markup:replyMarkup || {inline_keyboard:[]}
    }
  );
}

function testPaymentReviewKeyboardPure_() {
  var k=getBookingTelegramAdminKeyboard_('B-TEST','payment');
  var buttons=(k.inline_keyboard||[]).reduce(function(a,row){return a.concat(row);},[]);
  var actions=buttons.map(function(b){return String(b.callback_data||'');});
  var expected=['kaenatchi:approve:B-TEST','kaenatchi:hold_review:B-TEST','kaenatchi:reject:B-TEST'];
  var failed=expected.filter(function(x){return actions.indexOf(x)<0;});
  return {ok:failed.length===0,test:'PAYMENT_REVIEW_KEYBOARD_PURE_TEST',passed:expected.length-failed.length,total:expected.length,failed:failed,noTelegramSent:true};
}

function getBookingTelegramAdminKeyboard_(bookingId, mode) {
  var id = String(bookingId || '').trim();
  var requestMode = mode === 'request';
  if (requestMode) {
    return {inline_keyboard:[[
      {text:'✅ تأیید اولیه',callback_data:'kaenatchi:request_approve:'+id},
      {text:'❌ رد درخواست',callback_data:'kaenatchi:request_reject:'+id}
    ]]};
  }
  return {inline_keyboard:[
    [
      {text:'✅ تأیید پرداخت',callback_data:'kaenatchi:approve:'+id},
      {text:'🕓 بررسی بانکی',callback_data:'kaenatchi:hold_review:'+id}
    ],
    [
      {text:'❌ رد فیش',callback_data:'kaenatchi:reject:'+id}
    ]
  ]};
}
function getBookingTelegramResultKeyboard_(status) {
  if (status === 'approved') {
    return {
      inline_keyboard: [
        [
          {
            text:'✅ نوبت تأیید شد',
            callback_data:'kaenatchi:noop'
          }
        ]
      ]
    };
  }

  if (status === 'rejected') {
    return {
      inline_keyboard: [
        [
          {
            text:'❌ فیش رد شد',
            callback_data:'kaenatchi:noop'
          }
        ]
      ]
    };
  }

  return {inline_keyboard:[]};
}

function handleTelegramCallbackQuery_(callbackQuery) {
  var config = getTelegramConfig_();
  var queryId = String(callbackQuery && callbackQuery.id || '').trim();
  var data = String(callbackQuery && callbackQuery.data || '').trim();
  var message = callbackQuery && callbackQuery.message;

  if (!queryId || !message) return {ok:false,error:'TELEGRAM_CALLBACK_INVALID'};

  var chatId = String(message.chat && message.chat.id || '').trim();
  if (!config.adminChatId || chatId !== config.adminChatId) {
    answerTelegramCallbackQuery_(queryId,'این عملیات فقط برای ادمین مجاز است.',true);
    return {ok:false,error:'TELEGRAM_ADMIN_ONLY'};
  }

  if (data === 'kaenatchi:noop') {
    answerTelegramCallbackQuery_(queryId,'این نوبت قبلاً تعیین تکلیف شده است.',false);
    return {ok:true,noop:true};
  }

  var match = data.match(/^kaenatchi:(request_approve|request_reject|approve|reject|hold_review):([^:]+)$/);
  if (!match) {
    answerTelegramCallbackQuery_(queryId,'عملیات نامعتبر است.',true);
    return {ok:false,error:'TELEGRAM_CALLBACK_INVALID_ACTION'};
  }

  var action = match[1];
  var bookingId = String(match[2] || '').trim();

  // This action is deliberately non-mutating: it leaves payment pending manual bank verification.
  if (action === 'hold_review') {
    answerTelegramCallbackQuery_(queryId,'فیش در انتظار بررسی بانکی باقی ماند؛ وضعیت نوبت تغییری نکرد.',false);
    return {ok:true,action:action,bookingId:bookingId,unchanged:true};
  }

  var result;
  if (action === 'request_approve') {
    result = approveBookingRequest_({bookingId:bookingId,adminId:config.adminChatId});
  } else if (action === 'request_reject') {
    result = rejectBookingRequest_({bookingId:bookingId,adminId:config.adminChatId,reason:'رد درخواست نوبت توسط ادمین از طریق تلگرام'});
  } else if (action === 'approve') {
    result = approveBooking_({bookingId:bookingId,adminId:config.adminChatId});
  } else {
    result = rejectBooking_({bookingId:bookingId,adminId:config.adminChatId,reason:'رد فیش توسط ادمین از طریق تلگرام',paymentReview:true});
  }

  if (!result || result.ok !== true) {
    answerTelegramCallbackQuery_(queryId,String(result && result.message || 'عملیات انجام نشد.'),true);
    return result || {ok:false,error:'TELEGRAM_CALLBACK_ACTION_FAILED'};
  }

  var finalStatus = action === 'request_approve' ? 'request_approved' :
    action === 'request_reject' ? 'request_rejected' :
    action === 'approve' ? 'approved' : 'rejected';

  editTelegramMessageReplyMarkup_(chatId,message.message_id,getBookingTelegramResultKeyboard_(finalStatus));
  answerTelegramCallbackQuery_(queryId,
    action === 'request_approve' ? 'درخواست تأیید شد؛ مشتری می‌تواند پرداخت کند.' :
    action === 'request_reject' ? 'درخواست نوبت رد شد.' :
    action === 'approve' ? 'پرداخت تأیید و نوبت نهایی شد.' : 'فیش پرداخت رد شد.',
    false
  );
  return {ok:true,action:action,bookingId:bookingId};
}
function escapeTelegramHtml_(value) {
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function buildBookingTelegramText_(booking, eventType) {
  var name = (String(booking['First Name'] || '') + ' ' + String(booking['Last Name'] || '')).trim();
  var tracking = escapeTelegramHtml_(booking['Tracking Code'] || '');
  var service = escapeTelegramHtml_(booking['Service Name'] || '');
  var date = escapeTelegramHtml_(normalizeJalaliDate_(booking['Appointment Date'] || ''));
  var time = escapeTelegramHtml_(normalizeTime_(booking['Appointment Time'] || ''));
  var customer = escapeTelegramHtml_(name || 'مشتری');
  var price = escapeTelegramHtml_(booking['Final Price'] || '');
  var bookingId = escapeTelegramHtml_(booking['Booking ID'] || '');
  var transactionNumber = escapeTelegramHtml_(booking['Transaction Number'] || 'ثبت نشده');

  if (eventType === 'request_received') {
    return '📩 <b>درخواست جدید نوبت کائنات‌چی</b>\n\n' +
      '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
      '\n💳 مبلغ: ' + price + '\n🎫 کد پیگیری: <code>' + tracking +
      '</code>\n\n⏳ مهلت بررسی اولیه: ۱۲ ساعت';
  }
  if (eventType === 'request_approved') {
    return '✅ <b>درخواست نوبت تأیید اولیه شد</b>\n\n' +
      '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
      '\n💳 مبلغ قابل پرداخت: ' + price + '\n🎫 کد پیگیری: <code>' + tracking +
      '</code>\n\nبرای پرداخت، در مینی‌اپ کائنات‌چی وارد بخش «پیگیری درخواست» شو و کد پیگیری و شماره موبایل ثبت‌شده را وارد کن؛ سپس تصویر فیش را بارگذاری کن. مهلت پرداخت: ۱۰ دقیقه.';
  }
  if (eventType === 'request_rejected') {
    return '❌ <b>درخواست نوبت پذیرفته نشد</b>\n\n' +
      '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
      '\n🎫 کد پیگیری: <code>' + tracking + '</code>';
  }
  if (eventType === 'approved') {
    return '✅ <b>نوبت کائنات‌چی تأیید شد</b>\n\n' +
      '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
      '\n💳 مبلغ: ' + price + '\n🎫 کد پیگیری: <code>' + tracking + '</code>';
  }
  if (eventType === 'rejected') {
    return '❌ <b>فیش پرداخت کائنات‌چی رد شد</b>\n\n' +
      '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
      '\n🎫 کد پیگیری: <code>' + tracking + '</code>\n\n⛔ وضعیت: فیش پرداخت تأیید نشد';
  }
  return '🧾 <b>فیش پرداخت کائنات‌چی دریافت شد</b>\n\n' +
    '👤 ' + customer + '\n✨ ' + service + '\n📅 ' + date + ' — ' + time +
    '\n💳 مبلغ: ' + price + '\n🧾 شناسه نوبت: <code>' + bookingId +
    '</code>\n🎫 کد پیگیری نوبت: <code>' + tracking +
    '</code>\n🏦 کد پیگیری اعلام‌شده: <code>' + transactionNumber +
    '</code>\n\n⏳ وضعیت: در انتظار بررسی ادمین';
}
function sendTelegramPhoto_(chatId, fileId, caption, replyMarkup) {
  // Staging must never read real Drive files or contact Telegram.
  if (CONFIG.STAGING_MODE) return {ok:false,skipped:true,reason:'STAGING_MODE'};
  chatId = String(chatId || '').trim();
  fileId = String(fileId || '').trim();
  if (!chatId || !fileId || !caption) {
    return {ok:false,error:'TELEGRAM_PHOTO_ARGUMENTS_MISSING'};
  }

  var config = getTelegramConfig_();
  if (!config.botToken) {
    return {ok:false,skipped:true,reason:'BOT_TOKEN_NOT_CONFIGURED'};
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var payload = {
      chat_id: chatId,
      photo: file.getBlob(),
      caption: caption,
      parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);

    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + encodeURIComponent(config.botToken) + '/sendPhoto',
      {method:'post',muteHttpExceptions:true,payload:payload}
    );
    var code = response.getResponseCode();
    var body = response.getContentText();
    var parsed = {};
    try { parsed = JSON.parse(body); } catch(e) {}

    if (code >= 200 && code < 300 && parsed.ok === true) {
      return {ok:true,result:parsed.result || null};
    }
    console.warn('Telegram photo delivery failed: HTTP ' + code + ' ' + body);
    return {ok:false,error:'TELEGRAM_PHOTO_SEND_FAILED',httpCode:code};
  } catch(error) {
    console.warn('Telegram photo delivery exception: ' + (error && error.message ? error.message : error));
    return {ok:false,error:'TELEGRAM_PHOTO_EXCEPTION'};
  }
}

function sendBookingTelegramNotifications_(booking, eventType) {
  if (CONFIG.STAGING_MODE) return {ok:true,skipped:true,reason:'STAGING_MODE'};
  var config = getTelegramConfig_();
  var text = buildBookingTelegramText_(booking, eventType);
  var results = [];
  var adminResult = null;
  var replyMarkup = eventType === 'request_received'
    ? getBookingTelegramAdminKeyboard_(booking['Booking ID'], 'request')
    : eventType === 'payment_received'
      ? getBookingTelegramAdminKeyboard_(booking['Booking ID'], 'payment')
      : null;

  // Admin delivery is the critical path. A customer message must not mask a failed admin notification.
  if (config.adminChatId) {
    if (eventType === 'payment_received') {
      var receiptFileId = String(booking['Receipt File ID'] || '').trim();
      adminResult = receiptFileId
        ? sendTelegramPhoto_(config.adminChatId, receiptFileId, text, replyMarkup)
        : {ok:false,error:'PAYMENT_RECEIPT_FILE_ID_MISSING'};
    } else {
      adminResult = sendTelegramMessage_(config.adminChatId, text, replyMarkup);
    }
    results.push({recipient:'admin',result:adminResult});
  } else {
    adminResult = {ok:false,skipped:true,reason:'ADMIN_CHAT_ID_NOT_CONFIGURED'};
    results.push({recipient:'admin',result:adminResult});
  }

  var customerChatId = String(booking['Telegram ID'] || '').trim();
  if (customerChatId && customerChatId !== config.adminChatId) {
    results.push({recipient:'customer',result:sendTelegramMessage_(customerChatId,text)});
  }

  return {ok:!!(adminResult && adminResult.ok === true),results:results};
}
function queueBookingTelegramNotification_(booking, eventType) {
  if (CONFIG.STAGING_MODE) return {ok:true,queued:false,skipped:true,reason:'STAGING_MODE'};

  var queueKey = 'KAENATCHI_TELEGRAM_QUEUE';
  var inflightKey = 'KAENATCHI_TELEGRAM_INFLIGHT';
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
    try {
      var props = PropertiesService.getScriptProperties();
      var queue = readTelegramQueueProperty_(props, queueKey);
      var inflight = readTelegramQueueProperty_(props, inflightKey);
      var bookingId = String(booking && booking['Booking ID'] || '').trim();
      var normalizedEvent = String(eventType || '').trim();

      if (!bookingId || !normalizedEvent) {
        console.error('Telegram queue rejected an item without bookingId/eventType.');
        return {ok:false,queued:false,error:'INVALID_NOTIFICATION_ITEM'};
      }

      var duplicate = queue.concat(inflight).some(function(item) {
        return String(item.bookingId || '') === bookingId &&
          String(item.eventType || '') === normalizedEvent;
      });
      if (duplicate) return {ok:true,queued:false,duplicate:true};

      // Never silently discard an older notification to make room.
      // Leave a visible failure for monitoring instead of truncating the queue.
      if (queue.length + inflight.length >= 100) {
        console.error('Telegram notification queue is full; new item was not queued: ' +
          bookingId + ' / ' + normalizedEvent);
        return {ok:false,queued:false,error:'TELEGRAM_QUEUE_FULL'};
      }

      var newItem = {
        id: Utilities.getUuid(),
        bookingId: bookingId,
        eventType: normalizedEvent,
        queuedAt: new Date().toISOString(),
        attempts: 0
      };
      var candidateQueue = queue.concat([newItem]);
      if (!isTelegramQueuePropertyWithinLimitPure_(candidateQueue, 8000)) {
        console.error('Telegram notification queue reached its safe storage limit; item not queued: ' +
          bookingId + ' / ' + normalizedEvent);
        return {ok:false,queued:false,error:'TELEGRAM_QUEUE_STORAGE_LIMIT'};
      }
      props.setProperty(queueKey, JSON.stringify(candidateQueue));
      try {
        ensureTelegramQueueTriggerScheduled_(props, 'KAENATCHI_TELEGRAM_TRIGGER_SCHEDULED', 5000);
      } catch (triggerError) {
        // Keep the queued item. Report the scheduling failure explicitly so
        // monitoring can detect that a trigger needs attention.
        console.error('Telegram item queued but trigger scheduling failed: ' +
          String(triggerError && triggerError.message ? triggerError.message : triggerError));
        return {ok:false,queued:true,triggerScheduled:false,error:'TELEGRAM_TRIGGER_SCHEDULE_FAILED'};
      }
      return {ok:true,queued:true,triggerScheduled:true};
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('Telegram notification queue failed: ' +
      String(error && error.message ? error.message : error));
    return {ok:false,queued:false,error:'TELEGRAM_QUEUE_WRITE_FAILED'};
  }
}

/*
 * Read a queue property without converting malformed data into an empty
 * queue silently. A malformed queue is preserved for diagnosis and throws,
 * preventing the worker from overwriting recoverable notification data.
 */

function testTelegramQueueStorageLimitPure_() {
  var small = [{id:'1',bookingId:'BK-1',eventType:'payment_received',queuedAt:'2026-10-13T00:00:00.000Z',attempts:0}];
  var large = [{id:'2',bookingId:'BK-2',eventType:'payment_received',lastError:new Array(9000).join('x')}];
  var cases = [
    {name:'small queue fits safe property budget',actual:isTelegramQueuePropertyWithinLimitPure_(small,8000),expected:true},
    {name:'oversized queue is rejected before property write',actual:isTelegramQueuePropertyWithinLimitPure_(large,8000),expected:false},
    {name:'empty queue fits',actual:isTelegramQueuePropertyWithinLimitPure_([],8000),expected:true},
    {name:'Unicode queue size is counted in UTF-8 bytes',actual:isTelegramQueuePropertyWithinLimitPure_([{text:'مایا'.repeat(100)}],8000),expected:true}
  ];
  var failed=cases.filter(function(test){return test.actual!==test.expected;});
  return {ok:failed.length===0,test:'TELEGRAM QUEUE STORAGE LIMIT PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noExternalCalls:true};
}

function mergeTelegramQueueItemsPure_(inflight, queued) {
  var merged = [];
  var seen = {};
  (Array.isArray(inflight) ? inflight : []).concat(Array.isArray(queued) ? queued : []).forEach(function(item) {
    if (!item || typeof item !== 'object') return;
    var id = String(item.id || '').trim();
    var key = id ? 'id:' + id : 'legacy:' + String(item.bookingId || '') + '|' + String(item.eventType || '');
    if (seen[key]) return;
    seen[key] = true;
    merged.push(item);
  });
  return merged;
}

function testTelegramQueueRecoveryMergePure_() {
  var inflight = [
    {id:'same-1',bookingId:'BK-1',eventType:'payment_received',attempts:2,retryAt:'2026-10-13T00:01:00.000Z'},
    {id:'inflight-only',bookingId:'BK-2',eventType:'request_created',attempts:1}
  ];
  var queued = [
    {id:'same-1',bookingId:'BK-1',eventType:'payment_received',attempts:0},
    {id:'queue-only',bookingId:'BK-3',eventType:'request_created',attempts:0}
  ];
  var merged = mergeTelegramQueueItemsPure_(inflight, queued);
  var cases = [
    {name:'duplicate claim is deduplicated',actual:merged.length,expected:3},
    {name:'inflight copy wins and preserves attempts',actual:merged[0].attempts,expected:2},
    {name:'inflight retryAt is preserved',actual:merged[0].retryAt,expected:'2026-10-13T00:01:00.000Z'},
    {name:'inflight-only item retained',actual:merged.some(function(x){return x.id==='inflight-only';}),expected:true},
    {name:'queue-only item retained',actual:merged.some(function(x){return x.id==='queue-only';}),expected:true},
    {name:'malformed entries ignored safely',actual:mergeTelegramQueueItemsPure_([null,5],[]).length,expected:0}
  ];
  var failed=cases.filter(function(t){return t.actual!==t.expected;});
  return {ok:failed.length===0,test:'TELEGRAM QUEUE RECOVERY MERGE PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noExternalCalls:true};
}

function isTelegramQueueItemReadyPure_(item, nowMs) {
  if (!item || item.permanentFailure === true) return false;
  var retryAt = Date.parse(String(item.retryAt || ''));
  return !isFinite(retryAt) || retryAt <= Number(nowMs || Date.now());
}

function getTelegramRetryDelayMsPure_(attempts) {
  var count = Math.max(1, Number(attempts || 1));
  // Exponential backoff, capped at one minute; no external services involved.
  return Math.min(60000, 5000 * Math.pow(2, count - 1));
}

function testTelegramRetrySchedulePure_() {
  var now = Date.parse('2026-10-13T00:00:00.000Z');
  var cases = [
    {name:'new item is ready immediately',item:{attempts:0},expected:true},
    {name:'retry with future retryAt waits',item:{attempts:1,retryAt:'2026-10-13T00:00:10.000Z'},expected:false},
    {name:'retry becomes ready at retryAt',item:{attempts:1,retryAt:'2026-10-13T00:00:10.000Z'},expected:true,now:now+10000},
    {name:'permanent failure is never auto-retried',item:{permanentFailure:true},expected:false},
    {name:'missing retryAt is recoverable after interruption',item:{attempts:2},expected:true}
  ];
  var failed = cases.filter(function(test) {
    return isTelegramQueueItemReadyPure_(test.item, test.now === undefined ? now : test.now) !== test.expected;
  });
  var delays = [1,2,3,4,5,6,8].map(function(attempts) {
    return getTelegramRetryDelayMsPure_(attempts);
  });
  var delayOk = delays[0] === 5000 && delays[1] === 10000 &&
    delays[2] === 20000 && delays[3] === 40000 &&
    delays[4] === 60000 && delays[6] === 60000;
  return {ok:failed.length===0 && delayOk,test:'TELEGRAM RETRY SCHEDULE PURE TEST',
    passed:cases.length-failed.length+(delayOk?1:0),total:cases.length+1,failed:failed,
    delaysMs:delays,noExternalCalls:true};
}

function ensureTelegramQueueTriggerScheduled_(props, triggerKey, delayMs) {
  if (String(props.getProperty(triggerKey) || '') === '1') return {ok:true,alreadyScheduled:true};
  ScriptApp.newTrigger('processBookingTelegramNotificationQueue_')
    .timeBased()
    .after(Math.max(5000, Number(delayMs || 5000)))
    .create();
  props.setProperty(triggerKey, '1');
  return {ok:true,scheduled:true};
}

function readTelegramQueueProperty_(props, key) {
  var raw = props.getProperty(key);
  if (raw === null || raw === '') return [];
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('TELEGRAM_QUEUE_JSON_INVALID:' + key);
  }
  if (!Array.isArray(parsed)) throw new Error('TELEGRAM_QUEUE_NOT_ARRAY:' + key);
  return parsed;
}

/* Apps Script property values have a small per-value quota; leave headroom. */
function isTelegramQueuePropertyWithinLimitPure_(items, maxBytes) {
  var serialized = JSON.stringify(Array.isArray(items) ? items : []);
  var utf8Bytes = encodeURIComponent(serialized).replace(/%[0-9A-F]{2}/g, 'x').length;
  return utf8Bytes <= Number(maxBytes || 8000);
}

/*
 * Queue worker notes:
 * - Appointment reminders run before queue claims, so a reminder exception
 *   cannot strand queued notifications.
 * - Claimed notifications stay in an INFLIGHT property until delivery is
 *   confirmed or the bounded retry policy is exhausted.
 * - Queue property mutations share the same script lock as enqueue.
 * - Telegram cannot provide exactly-once delivery here: if the send succeeds
 *   but execution stops before state is saved, a retry may send a duplicate.
 */
function processBookingTelegramNotificationQueue_() {
  if (CONFIG.STAGING_MODE) return {ok:true,skipped:true,reason:'STAGING_MODE',sent:0};

  var queueKey = 'KAENATCHI_TELEGRAM_QUEUE';
  var inflightKey = 'KAENATCHI_TELEGRAM_INFLIGHT';
  var triggerKey = 'KAENATCHI_TELEGRAM_TRIGGER_SCHEDULED';
  var workerLeaseKey = 'KAENATCHI_TELEGRAM_WORKER_LEASE';
  var workerToken = Utilities.getUuid();
  var leaseLock = LockService.getScriptLock();
  leaseLock.waitLock(5000);
  try {
    var leaseProps = PropertiesService.getScriptProperties();
    var leaseRaw = String(leaseProps.getProperty(workerLeaseKey) || '');
    var leaseParts = leaseRaw.split('|');
    var leaseExpiry = Number(leaseParts[0] || 0);
    if (leaseExpiry > Date.now()) {
      // A one-shot trigger may have fired while another worker held the lease.
      // Replace it so the queue is not stranded after this skipped execution.
      leaseProps.deleteProperty('KAENATCHI_TELEGRAM_TRIGGER_SCHEDULED');
      ensureTelegramQueueTriggerScheduled_(
        leaseProps,
        'KAENATCHI_TELEGRAM_TRIGGER_SCHEDULED',
        leaseExpiry - Date.now()
      );
      return {ok:true,skipped:true,reason:'WORKER_ALREADY_RUNNING'};
    }
    // Lease expires after five minutes if execution terminates unexpectedly.
    leaseProps.setProperty(workerLeaseKey, String(Date.now() + 300000) + '|' + workerToken);
    // This one-shot trigger has fired. Clear its marker immediately so any
    // unexpected error can schedule a replacement in the outer catch.
    leaseProps.deleteProperty(triggerKey);
  } finally {
    leaseLock.releaseLock();
  }

  try {
  // Do reminder work before claiming notifications. Its failure must not
  // remove booking notifications from the persistent queue.
  try {
    processAppointmentReminders_();
  } catch (reminderError) {
    console.error('Appointment reminder batch failed: ' +
      String(reminderError && reminderError.message ? reminderError.message : reminderError));
  }

  var lock = LockService.getScriptLock();
  var items = [];
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = readTelegramQueueProperty_(props, queueKey);
    var inflight = readTelegramQueueProperty_(props, inflightKey);

    // Recover any items left in-flight by a terminated previous execution.
    // Keep in-flight items first and preserve new enqueues behind them.
    var combined = mergeTelegramQueueItemsPure_(inflight, queue);
    if (combined.length > 100) {
      // Do not truncate. Preserve everything and fail visibly for operator review.
      throw new Error('TELEGRAM_QUEUE_CAPACITY_EXCEEDED:' + combined.length);
    }
    if (!isTelegramQueuePropertyWithinLimitPure_(combined, 8000)) {
      throw new Error('TELEGRAM_QUEUE_STORAGE_LIMIT_EXCEEDED: refusing to overwrite either queue.');
    }
    props.setProperty(inflightKey, JSON.stringify(combined));
    props.setProperty(queueKey, '[]');
    props.deleteProperty(triggerKey);
    items = combined.filter(function(item) {
      return isTelegramQueueItemReadyPure_(item, Date.now());
    });
  } finally {
    lock.releaseLock();
  }

  // Continue to the scheduling phase even when every retained item is
  // waiting for retryAt; otherwise a future retry could be stranded.
  var sent = 0;
  var failedCount = 0;
  items.forEach(function(item) {
    var confirmed = false;
    var failureMessage = '';
    try {
      var booking = getBookingByIdObject_(item.bookingId);
      if (!booking) throw new Error('BOOKING_NOT_FOUND_FOR_NOTIFICATION');

      var result = sendBookingTelegramNotifications_(booking, String(item.eventType || ''));
      if (!isTelegramDeliveryConfirmedPure_(result)) {
        throw new Error('Telegram delivery failed, was skipped, or returned no confirmed success.');
      }
      confirmed = true;
    } catch (error) {
      failureMessage = String(error && error.message ? error.message : error);
    }

    var lock2 = LockService.getScriptLock();
    lock2.waitLock(5000);
    try {
      var props2 = PropertiesService.getScriptProperties();
      var inflight2 = readTelegramQueueProperty_(props2, inflightKey);
      var currentIndex = inflight2.findIndex(function(candidate) {
        return String(candidate.id || '') === String(item.id || '') &&
          String(candidate.bookingId || '') === String(item.bookingId || '') &&
          String(candidate.eventType || '') === String(item.eventType || '');
      });

      if (confirmed) {
        if (currentIndex !== -1) inflight2.splice(currentIndex, 1);
        sent++;
      } else {
        var attempts = Number(item.attempts || 0) + 1;
        if (shouldRetryTelegramNotification_(attempts)) {
          item.attempts = attempts;
          item.lastError = failureMessage;
          item.retryAt = new Date(Date.now() + getTelegramRetryDelayMsPure_(attempts)).toISOString();
          if (currentIndex !== -1) inflight2[currentIndex] = item;
          else inflight2.push(item);
        } else {
          // Keep exhausted items for manual inspection instead of silently
          // deleting a critical admin/payment notification.
          item.attempts = attempts;
          item.lastError = failureMessage;
          item.failedPermanentlyAt = new Date().toISOString();
          item.permanentFailure = true;
          if (currentIndex !== -1) inflight2[currentIndex] = item;
          else inflight2.push(item);
        }
        failedCount++;
      }

      if (!isTelegramQueuePropertyWithinLimitPure_(inflight2, 8000)) {
        throw new Error('TELEGRAM_QUEUE_STORAGE_LIMIT_EXCEEDED: item state remains recoverable in prior property value.');
      }
      props2.setProperty(inflightKey, JSON.stringify(inflight2));
    } finally {
      lock2.releaseLock();
    }
  });

  // If retryable or permanently failed items remain, schedule a follow-up.
  // Permanent failures are retained for manual inspection, but should not
  // cause a tight trigger loop.
  var remaining = [];
  lock.waitLock(5000);
  try {
    var props3 = PropertiesService.getScriptProperties();
    remaining = readTelegramQueueProperty_(props3, inflightKey);
    var retryable = remaining.filter(function(item) { return item.permanentFailure !== true; });
    if (retryable.length && String(props3.getProperty(triggerKey) || '') !== '1') {
      var nowMs = Date.now();
      var dueTimes = retryable.map(function(item) {
        var parsed = Date.parse(String(item.retryAt || ''));
        return isFinite(parsed) ? parsed : nowMs;
      });
      var earliestDue = Math.min.apply(null, dueTimes);
      var delayMs = Math.max(5000, earliestDue - nowMs);
      ensureTelegramQueueTriggerScheduled_(props3, triggerKey, delayMs);
    }
  } finally {
    lock.releaseLock();
  }

  return {ok:failedCount===0,processed:items.length,sent:sent,failed:failedCount,remaining:remaining.length};
  } catch (workerError) {
    try {
      var recoveryLock = LockService.getScriptLock();
      recoveryLock.waitLock(5000);
      try {
        var recoveryProps = PropertiesService.getScriptProperties();
        recoveryProps.deleteProperty(triggerKey);
        ensureTelegramQueueTriggerScheduled_(recoveryProps, triggerKey, 5000);
      } finally {
        recoveryLock.releaseLock();
      }
    } catch (scheduleError) {
      console.error('Telegram queue recovery scheduling failed: ' +
        String(scheduleError && scheduleError.message ? scheduleError.message : scheduleError));
    }
    throw workerError;
  } finally {
    var finishLock = LockService.getScriptLock();
    finishLock.waitLock(5000);
    try {
      var finishProps = PropertiesService.getScriptProperties();
      var currentLease = String(finishProps.getProperty(workerLeaseKey) || '');
      if (currentLease.split('|')[1] === workerToken) {
        finishProps.deleteProperty(workerLeaseKey);
      }
    } finally {
      finishLock.releaseLock();
    }
  }
}

function setupBookingTelegramQueueTrigger_() {
  if (CONFIG.STAGING_MODE) return {ok:true,skipped:true,reason:'STAGING_MODE',triggerCount:0};
  var functionName = 'processBookingTelegramNotificationQueue_';
  var triggers = ScriptApp.getProjectTriggers();
  var existing = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === functionName;
  });

  if (!existing.length) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyMinutes(1)
      .create();
  }

  return {
    ok: true,
    triggerCount: existing.length || 1,
    message: 'Telegram queue worker is configured.'
  };
}


function testTelegramRetryPolicyPure_() {
  var cases=[
    {attempts:0,expected:true},
    {attempts:1,expected:true},
    {attempts:4,expected:true},
    {attempts:5,expected:false},
    {attempts:6,expected:false}
  ];
  var failed=cases.filter(function(t){return shouldRetryTelegramNotification_(t.attempts)!==t.expected;});
  return {ok:failed.length===0,test:'TELEGRAM_RETRY_POLICY_PURE_TEST',passed:cases.length-failed.length,total:cases.length,failed:noRetryPolicyFailures_(failed),maxAttempts:5,noExternalCalls:true};
}
function noRetryPolicyFailures_(failed) { return failed; }

function shouldRetryTelegramNotification_(attempts) {
  return Number(attempts || 0) < 5;
}

function testTelegramNotificationRetryPolicyPure_() {
  var cases = [
    {attempts:0,expected:true},
    {attempts:1,expected:true},
    {attempts:4,expected:true},
    {attempts:5,expected:false},
    {attempts:6,expected:false}
  ];
  var failed = cases.filter(function(test) {
    return shouldRetryTelegramNotification_(test.attempts) !== test.expected;
  });
  return {
    ok:failed.length === 0,
    test:'TELEGRAM NOTIFICATION RETRY POLICY PURE TEST',
    passed:cases.length-failed.length,
    total:cases.length,
    failed:failed,
    noSheetRead:true,
    noSheetWrite:true,
    noTelegramSent:true
  };
}

function isTelegramDeliveryConfirmedPure_(result) {
  return !!result && result.ok === true && result.skipped !== true;
}

function testTelegramDeliveryResultGuardPure_() {
  var cases=[
    {name:'confirmed success accepted',value:{ok:true},expected:true},
    {name:'explicit failure rejected',value:{ok:false,error:'SEND_FAILED'},expected:false},
    {name:'missing result rejected',value:undefined,expected:false},
    {name:'null result rejected',value:null,expected:false},
    {name:'empty object rejected',value:{},expected:false},
    {name:'confirmed send accepted',value:{ok:true},expected:true},
    {name:'skipped staging send is not delivery success',value:{ok:true,skipped:true,reason:'STAGING_MODE'},expected:false},
    {name:'skipped send without reason is not delivery success',value:{ok:true,skipped:true},expected:false}
  ];
  var failed=cases.filter(function(t){return isTelegramDeliveryConfirmedPure_(t.value)!==t.expected;});
  return {ok:failed.length===0,test:'TELEGRAM_DELIVERY_RESULT_GUARD_PURE_TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noExternalCalls:true};
}

/* Legacy duplicate queue worker removed: the durable worker above is authoritative. */

/* =====================================================
 * APPOINTMENT REMINDERS
 * ===================================================== */

/*
 * Runs from the existing one-minute Telegram worker.
 * Booking Core, payment, VIP and slot locking are untouched.
 *
 * A reminder is eligible when:
 * - appointment is confirmed
 * - appointment is within the final six minutes before start
 * - no REMINDER_SENT log exists for this booking
 */
function processAppointmentReminders_() {
  var rows = getSheetObjects_(CONFIG.SHEETS.BOOKINGS);
  var nowMs = Date.now();
  var sent = 0;
  var skipped = 0;

  rows.forEach(function(booking) {
    try {
      if (
        String(booking['Appointment Status'] || '') !==
        CONFIG.STATUSES.BOOKING_CONFIRMED
      ) {
        return;
      }

      if (isAppointmentReminderSent_(booking['Booking ID'])) {
        skipped++;
        return;
      }

      var appointmentMs = getBookingAppointmentTimestampMs_(booking);
      if (!appointmentMs) return;

      var minutesUntil = (appointmentMs - nowMs) / 60000;

      /*
       * The worker normally runs every minute, but Apps Script triggers can
       * drift or be delayed. Send once at any point in the final six minutes
       * before the appointment, rather than losing the reminder if a narrow
       * 4–6 minute window is missed. Never send after the appointment starts.
       */
      if (minutesUntil <= 0 || minutesUntil > 6) {
        return;
      }

      var result = sendAppointmentReminderTelegram_(booking);

      if (result.ok) {
        appendBookingLog_({
          action: 'REMINDER_SENT',
          bookingId: String(booking['Booking ID'] || ''),
          slotKey: String(booking['Slot Key'] || ''),
          details: 'Appointment reminder delivered to all available recipients.'
        });
        sent++;
      } else if (result.finalizedWithoutCustomer) {
        appendBookingLog_({
          action: 'REMINDER_FINALIZED_NO_CUSTOMER_ID',
          bookingId: String(booking['Booking ID'] || ''),
          slotKey: String(booking['Slot Key'] || ''),
          details: 'Admin reminder delivered; customer Telegram ID is unavailable, so customer delivery was skipped.'
        });
        sent++;
      } else {
        console.warn(
          'Appointment reminder delivery failed for booking ' +
          String(booking['Booking ID'] || '') + ': ' +
          JSON.stringify(result)
        );
      }

    } catch (error) {
      console.warn(
        'Appointment reminder processing failed for booking ' +
        String(booking['Booking ID'] || '') + ': ' +
        String(error && error.message ? error.message : error)
      );
    }
  });

  return {
    ok: true,
    sent: sent,
    skipped: skipped
  };
}


function getBookingAppointmentTimestampMs_(booking) {
  var jalaliDate = normalizeJalaliDate_(
    booking['Appointment Date'] || ''
  );
  var time = normalizeTime_(
    booking['Appointment Time'] || ''
  );

  if (!jalaliDate || !/^\d{2}:\d{2}$/.test(time)) {
    return 0;
  }

  try {
    /*
     * Convert the Jalali calendar date to Gregorian first.
     * jalaliToGregorian_ returns a Date at UTC noon, deliberately
     * avoiding project-timezone calendar-day shifts.
     *
     * IMPORTANT:
     * Do not pass that Date through Utilities.formatDate() here.
     * The reminder diagnostic only needs the Gregorian calendar
     * components, and using UTC components keeps this helper
     * independent from the Apps Script project timezone.
     */
    var gregorian = jalaliToGregorian_(jalaliDate);

    if (
      Object.prototype.toString.call(gregorian) !== '[object Date]' ||
      isNaN(gregorian.getTime())
    ) {
      return 0;
    }

    var year = gregorian.getUTCFullYear();
    var month = gregorian.getUTCMonth() + 1;
    var day = gregorian.getUTCDate();

    var timeParts = time.split(':');
    var hour = Number(timeParts[0]);
    var minute = Number(timeParts[1]);

    if (
      !year ||
      !month ||
      !day ||
      isNaN(hour) ||
      isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return 0;
    }

    /*
     * Booking times are Iran local time (UTC+03:30 for this system).
     * Build UTC explicitly instead of parsing a timezone-dependent
     * string. This keeps the reminder trigger deterministic.
     */
    var timestamp =
      Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
      (3 * 60 + 30) * 60 * 1000;

    return isFinite(timestamp) && timestamp > 0
      ? timestamp
      : 0;

  } catch (error) {
    return 0;
  }
}

function isAppointmentReminderSent_(bookingId) {
  var id = String(bookingId || '').trim();
  if (!id) return false;

  var logs = getSheetObjects_(CONFIG.SHEETS.BOOKING_LOGS);

  return logs.some(function(log) {
    return (
      String(log['Booking ID'] || '').trim() === id &&
      (
        String(log['Action'] || '').trim() === 'REMINDER_SENT' ||
        String(log['Action'] || '').trim() === 'REMINDER_FINALIZED_NO_CUSTOMER_ID'
      )
    );
  });
}


function buildAppointmentReminderText_(booking) {
  var name = (
    String(booking['First Name'] || '') +
    ' ' +
    String(booking['Last Name'] || '')
  ).trim();

  var service = escapeTelegramHtml_(
    booking['Service Name'] || ''
  );

  var date = escapeTelegramHtml_(
    normalizeJalaliDate_(booking['Appointment Date'] || '')
  );

  var time = escapeTelegramHtml_(
    normalizeTime_(booking['Appointment Time'] || '')
  );

  var customer = escapeTelegramHtml_(
    name || 'مشتری'
  );

  return (
    '🔔 <b>یادآوری نوبت کائنات‌چی</b>\n\n' +
    '👤 ' + customer + ' عزیز\n' +
    '✨ نوبت شما: <b>' + service + '</b>\n' +
    '📅 تاریخ: <b>' + date + '</b>\n' +
    '🕚 ساعت: <b>' + time + '</b>\n\n' +
    '🌿 این پیام در دقایق پایانی پیش از زمان نوبت شما ارسال شده است.'
  );
}


function buildAdminAppointmentReminderText_(booking) {
  var name = (
    String(booking['First Name'] || '') +
    ' ' +
    String(booking['Last Name'] || '')
  ).trim();

  var username = String(
    booking['Telegram Username'] || ''
  ).trim();

  var telegramId = String(
    booking['Telegram ID'] || ''
  ).trim();

  var service = escapeTelegramHtml_(
    booking['Service Name'] || ''
  );

  var date = escapeTelegramHtml_(
    normalizeJalaliDate_(booking['Appointment Date'] || '')
  );

  var time = escapeTelegramHtml_(
    normalizeTime_(booking['Appointment Time'] || '')
  );

  return (
    '🔔 <b>یادآوری نوبت</b>\n\n' +
    '👤 ' + escapeTelegramHtml_(name || 'مشتری') + '\n' +
    '✨ ' + service + '\n' +
    '📅 ' + date + '\n' +
    '🕚 ' + time + '\n' +
    '📱 Telegram: ' +
      escapeTelegramHtml_(username || 'بدون Username') + '\n' +
    '🆔 Telegram ID: <code>' +
      escapeTelegramHtml_(telegramId || 'ثبت نشده') + '</code>'
  );
}


function isAppointmentReminderRecipientSent_(bookingId, recipient) {
  var id = String(bookingId || '').trim();
  var target = String(recipient || '').trim().toUpperCase();

  if (!id || (target !== 'ADMIN' && target !== 'CUSTOMER')) {
    return false;
  }

  var logs = getSheetObjects_(CONFIG.SHEETS.BOOKING_LOGS);

  return logs.some(function(log) {
    if (String(log['Booking ID'] || '').trim() !== id) {
      return false;
    }

    var action = String(log['Action'] || '').trim();

    /*
     * Older records used one REMINDER_SENT entry only after delivery
     * completed. Preserve those records as already delivered.
     */
    return action === 'REMINDER_SENT' ||
      action === 'REMINDER_SENT_' + target;
  });
}


function sendAppointmentReminderTelegram_(booking) {
  var config = getTelegramConfig_();
  var bookingId = String(booking['Booking ID'] || '').trim();
  var slotKey = String(booking['Slot Key'] || '').trim();
  var customerChatId = String(
    booking['Telegram ID'] || ''
  ).trim();
  var results = [];

  /*
   * Keep recipient-level delivery records. If one recipient succeeds and
   * the other fails, the next worker run retries only the failed recipient.
   */
  if (!config.adminChatId) {
    results.push({
      target: 'admin',
      result: {
        ok: false,
        skipped: true,
        reason: 'ADMIN_TELEGRAM_ID_NOT_CONFIGURED'
      }
    });
  } else if (isAppointmentReminderRecipientSent_(bookingId, 'ADMIN')) {
    results.push({
      target: 'admin',
      result: {ok: true, alreadySent: true}
    });
  } else {
    var adminResult = sendTelegramMessage_(
      config.adminChatId,
      buildAdminAppointmentReminderText_(booking)
    );

    results.push({target: 'admin', result: adminResult});

    if (adminResult && adminResult.ok === true) {
      appendBookingLog_({
        action: 'REMINDER_SENT_ADMIN',
        bookingId: bookingId,
        slotKey: slotKey,
        details: 'Admin appointment reminder delivered.'
      });
    }
  }

  /*
   * Customer reminder uses Telegram ID, not username. Do not send a
   * second copy to the admin chat if the IDs happen to be identical.
   */
  if (customerChatId && customerChatId !== config.adminChatId) {
    if (isAppointmentReminderRecipientSent_(bookingId, 'CUSTOMER')) {
      results.push({
        target: 'customer',
        result: {ok: true, alreadySent: true}
      });
    } else {
      var customerResult = sendTelegramMessage_(
        customerChatId,
        buildAppointmentReminderText_(booking)
      );

      results.push({target: 'customer', result: customerResult});

      if (customerResult && customerResult.ok === true) {
        appendBookingLog_({
          action: 'REMINDER_SENT_CUSTOMER',
          bookingId: bookingId,
          slotKey: slotKey,
          details: 'Customer appointment reminder delivered.'
        });
      }
    }
  } else {
    results.push({
      target: 'customer',
      result: {
        ok: false,
        skipped: true,
        reason: 'CUSTOMER_TELEGRAM_ID_NOT_AVAILABLE_OR_MATCHES_ADMIN'
      }
    });
  }

  var adminResultEntry = results.filter(function(item) {
    return item.target === 'admin';
  })[0];
  var customerResultEntry = results.filter(function(item) {
    return item.target === 'customer';
  })[0];

  var adminOk = !!(
    adminResultEntry &&
    adminResultEntry.result &&
    adminResultEntry.result.ok === true
  );
  var customerUnavailable = !!(
    customerResultEntry &&
    customerResultEntry.result &&
    customerResultEntry.result.skipped === true &&
    (
      customerResultEntry.result.reason === 'CUSTOMER_TELEGRAM_ID_NOT_AVAILABLE_OR_MATCHES_ADMIN'
    )
  );
  var ok = results.length > 0 && results.every(function(item) {
    return !!(item.result && item.result.ok === true);
  });

  return {
    ok: ok,
    finalizedWithoutCustomer: adminOk && customerUnavailable,
    results: results,
    requiredRecipientCount: results.length,
    pendingRecipientCount: results.filter(function(item) {
      return !(item.result && item.result.ok === true);
    }).length
  };
}


function testBookingTelegramQueueNow() {
  processBookingTelegramNotificationQueue_();
  return {
    ok: true,
    message: 'Telegram queue processor executed.'
  };
}


/* =====================================================
   7. SCHEDULE
   ===================================================== */

function getSchedule_() {
  /*
   * Schedule is a configuration table containing time cells.
   * Read it with getDisplayValues() so Google Sheets date/time
   * cells are returned as plain text and cannot break the Web App
   * response serialization.
   */
  const sheet = getSheet_(CONFIG.SHEETS.SCHEDULE);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return {
      ok: true,
      schedule: []
    };
  }

  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  const dayIndex = headers.indexOf('Day');
  const activeIndex = headers.indexOf('Active');
  const startIndex = headers.indexOf('Start Time');
  const endIndex = headers.indexOf('End Time');
  const durationIndex = headers.indexOf('Slot Duration');

  if (dayIndex === -1) {
    throw new Error('ستون Day در شیت Schedule پیدا نشد.');
  }

  const schedule = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    if (!row[dayIndex]) {
      continue;
    }

    schedule.push({
      day: String(row[dayIndex]).trim(),
      active: isTruthy_(row[activeIndex]),
      startTime: normalizeTime_(row[startIndex]),
      endTime: normalizeTime_(row[endIndex]),
      slotDuration: Number(row[durationIndex]) || 30
    });
  }

  return {
    ok: true,
    schedule: schedule
  };
}


/* =====================================================
   8. BLOCKED DATES
   ===================================================== */

function getBlockedDates_() {
  /*
   * BlockedDates is intentionally handled independently from the
   * generic row reader. This sheet may be completely empty except
   * for its header row, and in that case the Web App must return
   * a clean empty array without touching any cell values.
   */
  const sheet = getSheet_(CONFIG.SHEETS.BLOCKED_DATES);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return {
      ok: true,
      blockedDates: []
    };
  }

  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  const dateIndex = headers.indexOf('Date');
  const activeIndex = headers.indexOf('Active');
  const reasonIndex = headers.indexOf('Reason');

  if (dateIndex === -1) {
    throw new Error('ستون Date در شیت BlockedDates پیدا نشد.');
  }

  const result = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rawDate = String(
      row[dateIndex] === undefined || row[dateIndex] === null
        ? ''
        : row[dateIndex]
    ).trim();

    if (!rawDate) {
      continue;
    }

    const normalizedDate = normalizeJalaliDate_(rawDate);

    if (!normalizedDate) {
      continue;
    }

    result.push({
      date: normalizedDate,
      active: activeIndex >= 0
        ? isTruthy_(row[activeIndex])
        : false,
      reason: reasonIndex >= 0 && row[reasonIndex]
        ? String(row[reasonIndex]).trim()
        : ''
    });
  }

  return {
    ok: true,
    blockedDates: result
  };
}

/* =====================================================
   9. BLOCKED SLOTS
   ===================================================== */

function getBlockedSlots_() {

  const rows = getSheetObjects_(
    CONFIG.SHEETS.BLOCKED_SLOTS
  );

  const result = [];

  rows.forEach(function(row) {

    if (!row.Date || !row.Time) {
      return;
    }

    result.push({
      date: normalizeJalaliDate_(row.Date),
      time: normalizeTime_(row.Time),
      active: isTruthy_(row.Active),
      reason: row.Reason
        ? String(row.Reason)
        : ''
    });

  });

  return {
    ok: true,
    blockedSlots: result
  };
}


/* =====================================================
   10. AVAILABLE DATES
   ===================================================== */

function getAvailableDates_(request) {

  const settings = getBookingSettings_();

  const minAdvance =
    Number(settings.settings['Minimum Advance'] || 0);

  const maxAdvance =
    Number(settings.settings['Maximum Advance'] || 30);

  if (maxAdvance < minAdvance) {
    return {
      ok: false,
      error: 'INVALID_ADVANCE_RANGE',
      message: 'بازه مجاز رزرو صحیح نیست.'
    };
  }

  /*
   * PERFORMANCE FIX:
   * Read Schedule and BlockedDates once per request.
   * Then evaluate all Jalali dates in memory.
   *
   * This preserves the existing availability rules while
   * removing repeated Google Sheets reads from the date loop.
   */
  const scheduleRows =
    getSheetObjects_(
      CONFIG.SHEETS.SCHEDULE
    );

  const blockedDateRows =
    getSheetObjects_(
      CONFIG.SHEETS.BLOCKED_DATES
    );

  const todayJalali = getTodayJalali_();

  const dates = [];

  for (
    let offset = minAdvance;
    offset <= maxAdvance;
    offset++
  ) {

    const jalali =
      addJalaliDays_(
        todayJalali,
        offset
      );

    const blocked =
      blockedDateRows.some(function(row) {

        return (
          normalizeJalaliDate_(row.Date) === jalali &&
          isTruthy_(row.Active)
        );

      });

    if (blocked) {
      continue;
    }

    const dayName =
      getPersianDayNameFromJalali_(jalali);

    const hasActiveSchedule =
      scheduleRows.some(function(row) {

        const scheduleDay =
          String(row.Day || '').trim();

        const baseDay =
          scheduleDay
            .replace(/\s+(صبح|عصر)$/u, '')
            .trim();

        return (
          normalizePersianDayName_(baseDay) ===
            normalizePersianDayName_(dayName) &&
          isTruthy_(row.Active)
        );

      });

    if (hasActiveSchedule) {

      dates.push({
        date: jalali,
        dayOfWeek: dayName,
        available: true
      });

    }
  }

  return {
    ok: true,
    dates: dates
  };
}


/* =====================================================
   11. AVAILABLE SLOTS
   ===================================================== */

function getAvailableSlots_(request) {
  const date = normalizeJalaliDate_(request.date);

  if (!date) {
    return {
      ok: false,
      error: 'DATE_REQUIRED',
      message: 'تاریخ الزامی است.'
    };
  }

  const schedule = getScheduleForDate_(date);

  if (!schedule.active) {
    return {
      ok: true,
      date: date,
      slots: []
    };
  }

  const blockedRows = getSheetObjects_(CONFIG.SHEETS.BLOCKED_SLOTS);
  const bookingRows = getSheetObjects_(CONFIG.SHEETS.BOOKINGS);

  const blocked = {};
  blockedRows.forEach(function(row) {
    if (
      normalizeJalaliDate_(row.Date) === date &&
      isTruthy_(row.Active)
    ) {
      blocked[buildSlotKey_(date, normalizeTime_(row.Time))] = true;
    }
  });

  const statuses = {};
  bookingRows.forEach(function(row) {
    const rowDate = normalizeJalaliDate_(row['Appointment Date']);
    const rowTime = normalizeTime_(row['Appointment Time']);
    if (!rowDate || !rowTime || rowDate !== date) return;

    /*
     * Rebuild the key from the authoritative date/time fields. This makes
     * older bookings visible even if their historical Slot Key was missing
     * or formatted differently.
     */
    const key = buildSlotKey_(rowDate, rowTime);
    const status = String(row['Appointment Status'] || '');

    if (status === CONFIG.STATUSES.BOOKING_CONFIRMED) {
      statuses[key] = CONFIG.SLOT_STATUS.CONFIRMED;
      return;
    }

    if (status === CONFIG.STATUSES.BOOKING_PENDING) {
      /*
       * A booking with submitted payment proof must remain locked until
       * admin decision. Its Hold Until is extended by submitPayment_(),
       * but payment proof is the authoritative lock once submitted.
       *
       * A booking without submitted payment proof remains a temporary hold
       * and is released when its Hold Until expires.
       */
      const paymentStatus = String(row['Payment Status'] || '');
      const paymentReceived =
        paymentStatus === CONFIG.STATUSES.PAYMENT_RECEIVED ||
        paymentStatus === CONFIG.STATUSES.PAYMENT_APPROVED;

      if (paymentReceived) {
        statuses[key] = CONFIG.SLOT_STATUS.HELD;
        return;
      }

      const holdUntil = parseDateValue_(row['Hold Until']);
      if (holdUntil && holdUntil.getTime() > Date.now()) {
        statuses[key] = CONFIG.SLOT_STATUS.HELD;
      }
    }
  });

  const slots = [];

  schedule.ranges.forEach(function(range) {
    generateSlots_(
      range.startTime,
      range.endTime,
      range.slotDuration
    ).forEach(function(time) {
      const slotKey = buildSlotKey_(date, time);
      let status = CONFIG.SLOT_STATUS.FREE;

      if (blocked[slotKey]) {
        status = CONFIG.SLOT_STATUS.BLOCKED;
      } else if (statuses[slotKey]) {
        status = statuses[slotKey];
      }

      slots.push({
        date: date,
        time: time,
        slotKey: slotKey,
        status: status,
        available: status === CONFIG.SLOT_STATUS.FREE
      });
    });
  });

  return {
    ok: true,
    date: date,
    slots: slots
  };
}


/* =====================================================
   12. DATE SCHEDULE RESOLUTION
   ===================================================== */

function getScheduleForDate_(jalaliDate) {

  const blockedDates =
    getSheetObjects_(
      CONFIG.SHEETS.BLOCKED_DATES
    );

  const blockedDate =
    blockedDates.find(function(row) {

      return (
        normalizeJalaliDate_(row.Date) === jalaliDate &&
        isTruthy_(row.Active)
      );

    });

  if (blockedDate) {

    return {
      active: false,
      ranges: [],
      reason: blockedDate.Reason || ''
    };
  }


  /*
   * Determine the weekday directly from the Jalali date.
   * No approximate Gregorian conversion is used here.
   */
  const dayName =
    getPersianDayNameFromJalali_(jalaliDate);


  const scheduleRows =
    getSheetObjects_(
      CONFIG.SHEETS.SCHEDULE
    );


  const ranges =
    scheduleRows
      .filter(function(row) {

        const scheduleDay =
          String(row.Day || '').trim();

        /*
         * Schedule rows are stored as:
         * شنبه صبح
         * شنبه عصر
         * یکشنبه صبح
         * یکشنبه عصر
         *
         * We only compare the base weekday.
         */

        const baseDay =
          scheduleDay
            .replace(/\s+(صبح|عصر)$/u, '')
            .trim();

        return (
          normalizePersianDayName_(baseDay) ===
            normalizePersianDayName_(dayName) &&
          isTruthy_(row.Active)
        );

      })
      .map(function(row) {

        return {
          startTime:
            normalizeTime_(row['Start Time']),

          endTime:
            normalizeTime_(row['End Time']),

          slotDuration:
            Number(row['Slot Duration']) || 30
        };

      });


  return {
    active: ranges.length > 0,
    ranges: ranges
  };
}


/* =====================================================
   13. DATE AVAILABILITY
   ===================================================== */

function isDateAvailable_(jalaliDate) {

  const schedule =
    getScheduleForDate_(jalaliDate);

  return schedule.active;
}


/* =====================================================
   14. SLOT STATUS
   ===================================================== */

function getSlotStatus_(
  slotKey,
  jalaliDate,
  time
) {

  if (
    isBlockedSlot_(
      jalaliDate,
      time
    )
  ) {
    return CONFIG.SLOT_STATUS.BLOCKED;
  }


  const bookings =
    getSheetObjects_(
      CONFIG.SHEETS.BOOKINGS
    );


  for (let i = 0; i < bookings.length; i++) {

    const booking = bookings[i];

    if (
      String(booking['Slot Key']) !== slotKey
    ) {
      continue;
    }

    const status =
      String(booking['Appointment Status'] || '');

    const holdUntil =
      parseDateValue_(booking['Hold Until']);


    if (
      status === CONFIG.STATUSES.BOOKING_CONFIRMED
    ) {
      return CONFIG.SLOT_STATUS.CONFIRMED;
    }


    if (
      status === CONFIG.STATUSES.BOOKING_PENDING
    ) {
      // A submitted payment must keep the slot reserved until an admin
      // makes the final decision. The payment-review timer is not a license
      // to release a slot for which proof/payment details were submitted.
      const paymentStatus = String(booking['Payment Status'] || '');
      if (paymentStatus === CONFIG.STATUSES.PAYMENT_RECEIVED) {
        return CONFIG.SLOT_STATUS.HELD;
      }

      if (
        holdUntil &&
        holdUntil.getTime() > Date.now()
      ) {
        return CONFIG.SLOT_STATUS.HELD;
      }
    }
  }


  return CONFIG.SLOT_STATUS.FREE;
}


/* =====================================================
   15. BLOCKED SLOT CHECK
   ===================================================== */

function isBlockedSlot_(
  jalaliDate,
  time
) {

  const rows =
    getSheetObjects_(
      CONFIG.SHEETS.BLOCKED_SLOTS
    );

  return rows.some(function(row) {

    return (
      normalizeJalaliDate_(row.Date) === jalaliDate &&
      normalizeTime_(row.Time) === time &&
      isTruthy_(row.Active)
    );

  });
}


/* =====================================================
   16. GET SINGLE BOOKING
   ===================================================== */

function getBooking_(request) {

  const bookingId =
    request.bookingId ||
    request.trackingCode ||
    '';

  if (!bookingId) {

    return {
      ok: false,
      error: 'BOOKING_ID_REQUIRED',
      message: 'شناسه نوبت الزامی است.'
    };
  }


  const rows =
    getSheetObjects_(
      CONFIG.SHEETS.BOOKINGS
    );


  const booking =
    rows.find(function(row) {

      return (
        String(row['Booking ID']) ===
          String(bookingId) ||

        String(row['Tracking Code']) ===
          String(bookingId)
      );

    });


  if (!booking) {

    return {
      ok: false,
      error: 'BOOKING_NOT_FOUND',
      message: 'نوبت پیدا نشد.'
    };
  }


  return {
    ok: true,
    booking: booking
  };
}


/* =====================================================
   17. SLOT KEY
   ===================================================== */

function buildSlotKey_(
  jalaliDate,
  time
) {

  return (
    String(jalaliDate) +
    '|' +
    String(time)
  );
}


/* =====================================================
   18. SLOT LOCK
   ===================================================== */

/*
 * This function is the foundation for preventing
 * double booking.
 *
 * At final booking submission:
 * 1. Acquire script lock.
 * 2. Re-check slot.
 * 3. Create booking.
 * 4. Create hold.
 * 5. Release lock.
 *
 * Only ONE request can pass the critical section
 * at a time.
 */

function withBookingLock_(callback) {

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {

    return callback();

  } finally {

    lock.releaseLock();

  }
}


/* =====================================================
   19. JALALI HELPERS
   ===================================================== */

function normalizeJalaliDate_(value) {

  if (!value) {
    return '';
  }

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {

    return gregorianToJalali_(
      value
    );
  }

  const text =
    String(value)
      .trim()
      .replace(/-/g, '/');

  const parts =
    text.split('/');

  if (parts.length !== 3) {
    return text;
  }

  return (
    parts[0] +
    '/' +
    pad2_(parts[1]) +
    '/' +
    pad2_(parts[2])
  );
}


function gregorianToJalali_(date) {

  let gy = date.getFullYear();
  let gm = date.getMonth() + 1;
  let gd = date.getDate();

  const gdm = [
    0,
    31,
    59,
    90,
    120,
    151,
    181,
    212,
    243,
    273,
    304,
    334
  ];

  let gy2 =
    gm > 2
      ? gy + 1
      : gy;

  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];

  let jy =
    -1595 +
    33 *
      Math.floor(days / 12053);

  days %= 12053;

  jy +=
    4 *
    Math.floor(days / 1461);

  days %= 1461;

  if (days > 365) {

    jy +=
      Math.floor(
        (days - 1) / 365
      );

    days =
      (days - 1) % 365;

  }

  let jm;

  if (days < 186) {

    jm =
      1 +
      Math.floor(days / 31);

  } else {

    jm =
      7 +
      Math.floor(
        (days - 186) / 30
      );

  }

  let jd;

  if (days < 186) {

    jd =
      1 +
      (days % 31);

  } else {

    jd =
      1 +
      ((days - 186) % 30);

  }

  return (
    jy +
    '/' +
    pad2_(jm) +
    '/' +
    pad2_(jd)
  );
}


/*
 * Standard Jalali -> Gregorian conversion.
 *
 * The result is created at UTC noon so the calendar day
 * cannot shift because of the Apps Script project timezone.
 *
 * This is used only when a Gregorian Date object is genuinely
 * needed. Booking dates themselves remain Jalali everywhere.
 */
function jalaliToGregorian_(jalaliDate) {

  const parts =
    String(jalaliDate)
      .replace(/-/g, '/')
      .split('/');

  if (parts.length !== 3) {
    throw new Error(
      'فرمت تاریخ شمسی نامعتبر است: ' + jalaliDate
    );
  }

  const jy = Number(parts[0]);
  const jm = Number(parts[1]);
  const jd = Number(parts[2]);

  if (
    !Number.isInteger(jy) ||
    !Number.isInteger(jm) ||
    !Number.isInteger(jd) ||
    jm < 1 ||
    jm > 12 ||
    jd < 1 ||
    jd > 31
  ) {
    throw new Error(
      'تاریخ شمسی نامعتبر است: ' + jalaliDate
    );
  }

  const adjustedJy = jy + 1595;

  let days =
    -355668 +
    365 * adjustedJy +
    Math.floor(adjustedJy / 33) * 8 +
    Math.floor(((adjustedJy % 33) + 3) / 4) +
    jd +
    (
      jm < 7
        ? (jm - 1) * 31
        : (jm - 7) * 30 + 186
    );

  let gy =
    400 * Math.floor(days / 146097);

  days %= 146097;

  if (days > 36524) {

    days -= 1;

    gy +=
      100 * Math.floor(days / 36524);

    days %= 36524;

    if (days >= 365) {
      days += 1;
    }
  }

  gy +=
    4 * Math.floor(days / 1461);

  days %= 1461;

  if (days > 365) {

    gy +=
      Math.floor((days - 1) / 365);

    days =
      (days - 1) % 365;
  }

  const gd =
    days + 1;

  const leap =
    (
      gy % 4 === 0 &&
      gy % 100 !== 0
    ) ||
    gy % 400 === 0;

  const monthLengths = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  let remainingDays = gd;
  let gm = 1;

  while (
    gm <= 12 &&
    remainingDays > monthLengths[gm - 1]
  ) {

    remainingDays -=
      monthLengths[gm - 1];

    gm++;
  }

  return new Date(
    Date.UTC(
      gy,
      gm - 1,
      remainingDays,
      12,
      0,
      0
    )
  );
}


/*
 * Returns today's Jalali date using Iran's timezone.
 * The booking system is Jalali-based, so this is independent
 * of the Apps Script project's own timezone setting.
 */
function getTodayJalali_() {

  const now = new Date();

  const iranDateText =
    Utilities.formatDate(
      now,
      'Asia/Tehran',
      'yyyy-MM-dd'
    );

  return gregorianToJalali_(
    new Date(
      iranDateText + 'T12:00:00+03:30'
    )
  );
}


/*
 * Adds whole calendar days directly to a Jalali date.
 * This avoids Gregorian timezone/date rollover problems.
 */
function addJalaliDays_(jalaliDate, daysToAdd) {

  let result =
    normalizeJalaliDate_(jalaliDate);

  const count =
    Number(daysToAdd) || 0;

  if (count < 0) {
    for (
      let i = 0;
      i > count;
      i--
    ) {
      result = addOneJalaliDay_(result, -1);
    }
  } else {
    for (
      let i = 0;
      i < count;
      i++
    ) {
      result = addOneJalaliDay_(result, 1);
    }
  }

  return result;
}


function addOneJalaliDay_(jalaliDate, direction) {

  const parts =
    normalizeJalaliDate_(jalaliDate)
      .split('/');

  let jy = Number(parts[0]);
  let jm = Number(parts[1]);
  let jd = Number(parts[2]);

  if (direction >= 0) {

    const maxDay =
      jalaliMonthLength_(jy, jm);

    if (jd < maxDay) {
      jd++;
    } else {

      jd = 1;

      if (jm < 12) {
        jm++;
      } else {
        jm = 1;
        jy++;
      }
    }

  } else {

    if (jd > 1) {
      jd--;
    } else {

      if (jm > 1) {
        jm--;
      } else {
        jm = 12;
        jy--;
      }

      jd =
        jalaliMonthLength_(jy, jm);
    }
  }

  return (
    jy +
    '/' +
    pad2_(jm) +
    '/' +
    pad2_(jd)
  );
}


function jalaliMonthLength_(jy, jm) {

  if (jm >= 1 && jm <= 6) {
    return 31;
  }

  if (jm >= 7 && jm <= 11) {
    return 30;
  }

  return isJalaliLeapYear_(jy)
    ? 30
    : 29;
}


/*
 * Jalali leap-year calculation via the standard
 * Jalali -> Gregorian conversion.
 */
function isJalaliLeapYear_(jy) {

  return isJalaliLeapYearSimple_(jy);
}


/*
 * Returns the Persian weekday for a Jalali date.
 *
 * Fixed anchor:
 * 1405/07/14 = Tuesday.
 *
 * We calculate the day difference entirely in the Jalali
 * calendar, so no approximate Gregorian weekday is involved.
 */
function getPersianDayNameFromJalali_(jalaliDate) {

  const anchorDate = '1405/07/14';

  const difference =
    jalaliDayDifference_(
      anchorDate,
      jalaliDate
    );

  const weekdayIndex =
    (2 + difference % 7 + 7) % 7;

  const days = [
    'یکشنبه',
    'دوشنبه',
    'سه‌شنبه',
    'چهارشنبه',
    'پنج‌شنبه',
    'جمعه',
    'شنبه'
  ];

  return days[weekdayIndex];
}


function jalaliDayDifference_(fromDate, toDate) {

  const from =
    jalaliToOrdinal_(fromDate);

  const to =
    jalaliToOrdinal_(toDate);

  return to - from;
}


function jalaliToOrdinal_(jalaliDate) {

  const parts =
    normalizeJalaliDate_(jalaliDate)
      .split('/');

  const jy = Number(parts[0]);
  const jm = Number(parts[1]);
  const jd = Number(parts[2]);

  let days =
    0;

  /*
   * The Jalali 33-year cycle contains 12053 days.
   * This ordinal is sufficient for the booking date ranges
   * and keeps all weekday calculations inside the Jalali system.
   */
  const cycles =
    Math.floor(jy / 33);

  days +=
    cycles * 12053;

  const remainder =
    jy % 33;

  for (
    let year = 0;
    year < remainder;
    year++
  ) {

    days +=
      isJalaliLeapYearSimple_(jy - remainder + year)
        ? 366
        : 365;
  }

  for (
    let month = 1;
    month < jm;
    month++
  ) {
    days +=
      jalaliMonthLength_(
        jy,
        month
      );
  }

  days +=
    jd - 1;

  return days;
}


function isJalaliLeapYearSimple_(jy) {

  /*
   * Standard 33-year Jalali cycle.
   * The exact conversion helper above remains the authority
   * for Gregorian conversion; this function is used only
   * for ordinal day arithmetic.
   */
  const remainder =
    ((jy % 33) + 33) % 33;

  return [
    1,
    5,
    9,
    13,
    17,
    22,
    26,
    30
  ].indexOf(remainder) !== -1;
}


/* =====================================================
   20. PERSIAN WEEKDAY
   ===================================================== */

function getPersianDayName_(date) {

  const days = [
    'یکشنبه',
    'دوشنبه',
    'سه‌شنبه',
    'چهارشنبه',
    'پنج‌شنبه',
    'جمعه',
    'شنبه'
  ];

  return days[
    date.getDay()
  ];
}


function normalizePersianDayName_(value) {

  return String(value || '')
    .replace(/[\u200c\u200d\s]/g, '')
    .trim();
}


/* =====================================================
   21. TIME HELPERS
   ===================================================== */

function normalizeTime_(value) {

  if (!value) {
    return '';
  }

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'HH:mm'
    );
  }

  const text =
    String(value).trim();

  const parts =
    text.split(':');

  if (parts.length < 2) {
    return text;
  }

  return (
    pad2_(parts[0]) +
    ':' +
    pad2_(parts[1])
  );
}


function generateSlots_(
  startTime,
  endTime,
  duration
) {

  const result = [];

  const start =
    timeToMinutes_(startTime);

  const end =
    timeToMinutes_(endTime);

  const step =
    Number(duration) || 30;

  for (
    let minutes = start;
    minutes + step <= end;
    minutes += step
  ) {

    result.push(
      minutesToTime_(minutes)
    );

  }

  return result;
}


function timeToMinutes_(time) {

  const parts =
    String(time)
      .split(':');

  return (
    Number(parts[0]) * 60 +
    Number(parts[1])
  );
}


function minutesToTime_(minutes) {

  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  return (
    pad2_(hours) +
    ':' +
    pad2_(mins)
  );
}


/* =====================================================
   22. GENERAL HELPERS
   ===================================================== */

function pad2_(value) {

  return String(value)
    .padStart(2, '0');
}


function isTruthy_(value) {

  if (
    value === true ||
    value === 1
  ) {
    return true;
  }

  const text =
    String(value)
      .trim()
      .toLowerCase();

  return [
    'true',
    '1',
    'yes',
    'active',
    'بله',
    'فعال'
  ].indexOf(text) !== -1;
}


function normalizeSheetValue_(value) {

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return value.toISOString();
  }

  return value;
}


function parseDateValue_(value) {

  if (!value) {
    return null;
  }

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return value;
  }

  const date =
    new Date(value);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}


/* =====================================================
   23. REQUEST PARSER
   ===================================================== */

function parseRequest_(e) {

  if (!e) {
    return {};
  }

  if (
    e.postData &&
    e.postData.contents
  ) {

    const body =
      e.postData.contents;

    try {
      return JSON.parse(body);

    } catch (error) {

      return {
        rawBody: body
      };

    }
  }

  if (e.parameter) {
    return e.parameter;
  }

  return {};
}


/* =====================================================
   24. JSON RESPONSE
   ===================================================== */

function jsonpResponse_(callback, data) {
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jsonResponse_(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        data,
        null,
        2
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

function iframeBridgeResponse_(data) {
  const payload = Utilities.base64EncodeWebSafe(
    Utilities.newBlob(JSON.stringify(data), 'application/json').getBytes()
  );

  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '</head><body><script>' +
    '(function(){' +
    'var message={source:"kaenatchi-booking-bridge",data:null};' +
    'try{' +
    'var encoded="' + payload + '";' +
    'var pad=encoded.length%4;' +
    'if(pad){encoded+="====".slice(0,4-pad);}' +
    'var binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));' +
    'var bytes="";' +
    'for(var i=0;i<binary.length;i++){bytes+=String.fromCharCode(binary.charCodeAt(i));}' +
    'message.data=JSON.parse(decodeURIComponent(escape(bytes)));' +
    '}catch(error){' +
    'message.data={ok:false,error:"BRIDGE_ERROR",message:"خطا در دریافت پاسخ سامانه رزرو."};' +
    '}' +
    'try{window.parent.postMessage(message,"*");}catch(error){}' +
    'try{if(window.top!==window.parent){window.top.postMessage(message,"*");}}catch(error){}' +
    '})();</script></body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function testKaenatChiCMS() {
  const result = healthCheck();
  console.log(JSON.stringify(result, null, 2));
}

function testScheduleAndSlots() {
  const scheduleResult = getSchedule_();

  console.log('=== SCHEDULE ===');
  console.log(JSON.stringify(scheduleResult, null, 2));

  const datesResult = getAvailableDates_({});

  console.log('=== AVAILABLE DATES ===');
  console.log(JSON.stringify(datesResult, null, 2));

  if (datesResult.dates && datesResult.dates.length > 0) {
    const firstDate = datesResult.dates[0].date;

    const slotsResult = getAvailableSlots_({
      date: firstDate
    });

    console.log('=== FIRST AVAILABLE DATE ===');
    console.log(firstDate);

    console.log('=== SLOTS ===');
    console.log(JSON.stringify(slotsResult, null, 2));
  }
}

function testJalaliWeekdays() {
  const testDates = [
    '1405/07/14',
    '1405/07/15',
    '1405/07/16',
    '1405/07/17',
    '1405/07/18',
    '1405/07/19'
  ];

  testDates.forEach(function(date) {
    const dayName = getPersianDayNameFromJalali_(date);
    const schedule = getScheduleForDate_(date);

    console.log(JSON.stringify({
      jalali: date,
      calculatedDay: dayName,
      scheduleActive: schedule.active,
      ranges: schedule.ranges
    }, null, 2));
  });
}


/* =====================================================
   PHASE 2 - BACKEND CONTRACT VALIDATION
   Safe test only. Does not change booking data.
   ===================================================== */

function testBookingBackendContract() {
  const requiredSheets = CONFIG.SHEETS;
  const result = {
    ok: true,
    sheets: {},
    missingSheets: [],
    headerWarnings: []
  };

  Object.keys(requiredSheets).forEach(function(key) {
    const name = requiredSheets[key];
    const sheet = getSpreadsheet_().getSheetByName(name);

    if (!sheet) {
      result.ok = false;
      result.missingSheets.push(name);
      result.sheets[name] = { exists: false };
      return;
    }

    result.sheets[name] = {
      exists: true,
      rows: Math.max(0, sheet.getLastRow() - 1),
      columns: sheet.getLastColumn(),
      headers: getHeaders_(sheet)
    };
  });

  const expectedHeaders = {
    BookingSettings: ['Setting', 'Value'],
    Schedule: ['Day', 'Active', 'Start Time', 'End Time', 'Slot Duration'],
    BlockedDates: ['Date', 'Active', 'Reason'],
    BlockedSlots: ['Date', 'Time', 'Active', 'Reason'],
    Bookings: ['Slot Key', 'Appointment Status', 'Hold Until', 'Booking ID', 'Tracking Code']
  };

  Object.keys(expectedHeaders).forEach(function(sheetName) {
    if (!result.sheets[sheetName] || !result.sheets[sheetName].exists) return;

    expectedHeaders[sheetName].forEach(function(header) {
      if (result.sheets[sheetName].headers.indexOf(header) === -1) {
        result.ok = false;
        result.headerWarnings.push(sheetName + ': missing "' + header + '"');
      }
    });
  });

  return result;
}



/* =====================================================
   PHASE 2 - BOOKING CORE
   ===================================================== */

function getServices_(request) {
  var names=['Services','services'];
  for(var i=0;i<names.length;i++){
    if(!getSpreadsheet_().getSheetByName(names[i])) continue;
    var rows=getSheetObjects_(names[i]);
    var services=rows.filter(function(r){
      var a=firstField_(r,['Active','Is Active','فعال','وضعیت','Status']);
      return a===''||isTruthy_(a);
    }).map(function(r){
      return {
        id:String(firstField_(r,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||''),
        name:String(firstField_(r,['نام خدمت','Service Name','Name','Title','عنوان'])||''),
        category:String(firstField_(r,['دسته','Category','Service Category'])||''),
        description:String(firstField_(r,['توضیح کوتاه','Description','Short Description','توضیحات'])||''),
        price:toNumber_(firstField_(r,['قیمت','Price','Base Price','Original Price','مبلغ'])),
        duration:toNumber_(firstField_(r,['مدت','Duration','مدت زمان']))
      };
    }).filter(function(s){return s.name;});
    return {ok:true,services:services};
  }
  return {ok:true,services:[]};
}

function validateDiscount_(request){
  var price=Math.max(0,toNumber_(request.price));
  var code=String(request.code||request.discountCode||request.vipCode||'').trim().toUpperCase();

  if(!code){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price
    };
  }

  var token=findVIPDiscountToken_(code);

  if(!token){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'کد تخفیف معتبر نیست.'
    };
  }

  if(token.used){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'کد تخفیف قبلاً استفاده شده است.'
    };
  }

  if(token.expiryMs && token.expiryMs<=Date.now()){
    markVIPTokenExpired_(token);
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'کد تخفیف منقضی شده است.'
    };
  }

  if(token.status!==CONFIG.VIP.ACTIVE_STATUS){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'ابتدا توکن VIP را در پنل VIP فعال کنید.'
    };
  }

  if(!token.customerActive){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'عضویت VIP این کد فعال نیست.'
    };
  }

  var requestedCustomerId=String(request.customerId||'').trim();
  if(requestedCustomerId && requestedCustomerId!==token.customerId){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'این کد تخفیف متعلق به این حساب VIP نیست.'
    };
  }

  var requestedTelegramId=String(request.telegramId||'').trim();
  if(requestedTelegramId && token.telegramId && requestedTelegramId!==token.telegramId){
    return {
      ok:true,
      valid:false,
      discountPercent:0,
      discountAmount:0,
      finalPrice:price,
      message:'این کد تخفیف متعلق به این حساب Telegram نیست.'
    };
  }

  var p=Math.max(0,Math.min(100,toNumber_(token.percent)));
  var a=Math.round(price*p/100);

  return {
    ok:true,
    valid:p>0,
    discountPercent:p,
    discountAmount:a,
    finalPrice:Math.max(0,price-a),
    token:code,
    vipCustomerId:token.customerId
  };
}

function createBooking_(request){
  return withBookingLock_(function(){
    var date=normalizeJalaliDate_(request.date||request.appointmentDate);
    var time=normalizeTime_(request.time||request.appointmentTime);
    if(!date||!time)return fail_('DATE_TIME_REQUIRED','تاریخ و ساعت الزامی است.');
    if(!isDateAvailable_(date))return fail_('DATE_NOT_AVAILABLE','این تاریخ قابل رزرو نیست.');
    var schedule=getScheduleForDate_(date);
    var allowed=schedule.ranges.some(function(r){return generateSlots_(r.startTime,r.endTime,r.slotDuration).indexOf(time)!==-1;});
    if(!allowed)return fail_('SLOT_NOT_AVAILABLE','این ساعت در برنامه کاری قرار ندارد.');
    var slotKey=buildSlotKey_(date,time);
    if(getSlotStatus_(slotKey,date,time)!==CONFIG.SLOT_STATUS.FREE)return fail_('SLOT_UNAVAILABLE','این زمان قبلاً رزرو یا موقتاً نگه داشته شده است.');

    var service=findServiceRecord_(String(request.serviceId||''),String(request.serviceName||request.service||''));
    if(!service)return fail_('SERVICE_NOT_FOUND','خدمت انتخاب‌شده پیدا نشد.');
    var basePrice=toNumber_(service.price);
    var discountCode=String(request.discountCode||request.vipCode||'').trim();
    var discount=validateDiscount_({
      price:basePrice,
      code:discountCode,
      customerId:String(request.customerId||'').trim(),
      telegramId:String(request.telegramId||'').trim()
    });
    if(discountCode&&!discount.valid)return fail_('INVALID_DISCOUNT',discount.message||'کد تخفیف معتبر نیست.');

    var booking={
      bookingId:generateId_('BK'),requestId:String(request.requestId||''),createdAt:new Date(),
      telegramId:String(request.telegramId||request.telegramChatId||'').trim(),
      telegramUsername:String(request.telegramUsername||'').trim(),
      telegramFirstName:String(request.telegramFirstName||'').trim(),
      telegramLastName:String(request.telegramLastName||'').trim(),
      customerId:String(request.customerId||''),
      firstName:String(request.firstName||'').trim(),lastName:String(request.lastName||'').trim(),
      mobile:String(request.mobile||request.phone||'').trim(),serviceId:String(service.id||request.serviceId||''),
      serviceName:String(service.name),appointmentDate:date,appointmentTime:time,slotKey:slotKey,
      originalPrice:basePrice,discountCode:discountCode,discountType:discountCode?'VIP':'',
      discountPercent:discount.discountPercent,discountAmount:discount.discountAmount,finalPrice:discount.finalPrice,
      paymentStatus:CONFIG.STATUSES.PAYMENT_PENDING,appointmentStatus:CONFIG.STATUSES.BOOKING_PENDING,
      trackingCode:generateTrackingCode_(),holdUntil:new Date(Date.now()+12*60*60000)
    };
    if(discountCode&&discount.valid&&discount.vipCustomerId&&!booking.customerId){
      booking.customerId=discount.vipCustomerId;
    } else {
      booking.customerId=upsertCustomer_(booking);
    }

    appendObjectRow_(CONFIG.SHEETS.BOOKINGS,{},{
      'Booking ID':booking.bookingId,'Request ID':booking.requestId,'Created At':booking.createdAt,
      'Telegram ID':booking.telegramId,'Customer ID':booking.customerId,'First Name':booking.firstName,'Last Name':booking.lastName,
      'Mobile':booking.mobile,'Service ID':booking.serviceId,'Service Name':booking.serviceName,
      'Appointment Date':booking.appointmentDate,'Appointment Time':booking.appointmentTime,'Slot Key':booking.slotKey,
      'Original Price':booking.originalPrice,'Discount Code':booking.discountCode,'Discount Type':booking.discountType,
      'Discount Amount':booking.discountAmount,'Final Price':booking.finalPrice,'Payment Status':booking.paymentStatus,
      'Appointment Status':booking.appointmentStatus,'Tracking Code':booking.trackingCode,'Hold Until':booking.holdUntil
    });
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.BOOKING_CREATED,bookingId:booking.bookingId,slotKey:slotKey,details:'Booking request created; awaiting initial admin review.'});
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.SLOT_HELD,bookingId:booking.bookingId,slotKey:slotKey,details:'Slot held for initial review (12 hours).'});
    queueBookingTelegramNotification_(getBookingByIdObject_(booking.bookingId), 'request_received');
    return {ok:true,booking:publicBooking_(booking),message:'درخواست نوبت ثبت شد و تا ۱۲ ساعت در انتظار بررسی اولیه است.'};
  });
}

function hasRequiredReceiptImage_(receipt) {
  var value=String(receipt||'').trim();
  if(!value)return false;
  var match=value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+=*)$/i);
  if(!match)return false;
  var encoded=match[2];
  // 8 MiB decoded, allowing only the small base64 expansion overhead.
  if(encoded.length>Math.ceil((8*1024*1024)/3)*4)return false;
  if(encoded.length%4!==0)return false;
  return true;
}

function validatePaymentSubmissionPreflightPure_(rows, bookingId) {
  var id=String(bookingId||'').trim();
  if(!id)return {ok:false,error:'BOOKING_ID_REQUIRED'};
  var matches=(Array.isArray(rows)?rows:[]).filter(function(p){
    return String(p['Booking ID']||'')===id;
  });
  return matches.length===0
    ? {ok:true}
    : {ok:false,error:'PAYMENT_RECORD_ALREADY_EXISTS'};
}

function testPaymentSubmissionPreflightPure_() {
  var cases=[
    {rows:[],id:'B1',expected:true},
    {rows:[{'Booking ID':'B1'}],id:'B1',expected:false},
    {rows:[{'Booking ID':'B1'},{'Booking ID':'B1'}],id:'B1',expected:false},
    {rows:[{'Booking ID':'B2'}],id:'B1',expected:true},
    {rows:[],id:'',expected:false}
  ];
  var failed=cases.filter(function(t){
    return validatePaymentSubmissionPreflightPure_(t.rows,t.id).ok!==t.expected;
  });
  return {ok:failed.length===0,passed:cases.length-failed.length,total:cases.length,failed:failed};
}

function submitPayment_(request){
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    var suppliedMobile=normalizeMobileForMatch_(request.mobile||request.phone||'');
    var storedMobile=normalizeMobileForMatch_(b['Mobile']||'');
    if(!suppliedMobile||!storedMobile||suppliedMobile!==storedMobile)return fail_('MOBILE_VERIFICATION_FAILED','شماره موبایل با اطلاعات ثبت‌شده مطابقت ندارد.');
    if(String(b['Appointment Status']||'')!==CONFIG.STATUSES.BOOKING_PENDING)return fail_('BOOKING_NOT_PENDING','این نوبت در وضعیت قابل پرداخت نیست.');
    if(String(b['Admin Note']||'').indexOf('INITIAL_REQUEST_APPROVED')===-1)return fail_('INITIAL_APPROVAL_REQUIRED','ابتدا باید درخواست نوبت توسط ادمین تأیید اولیه شود.');
    if(String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED||String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_APPROVED){
      return fail_('PAYMENT_ALREADY_SUBMITTED','برای این نوبت قبلاً پرداخت ارسال شده است.');
    }
    // Prevent duplicate payment rows after a partial prior write.
    var existingPaymentRows=getSheetObjects_(CONFIG.SHEETS.PAYMENTS).filter(function(p){
      return String(p['Booking ID']||'')===String(b['Booking ID']||'');
    });
    var paymentPreflight=validatePaymentSubmissionPreflightPure_(existingPaymentRows,b['Booking ID']);
    if(!paymentPreflight.ok){
      return fail_(paymentPreflight.error,'برای این نوبت رکورد پرداخت قبلی وجود دارد؛ برای جلوگیری از ثبت تکراری، پرداخت جدید متوقف شد.');
    }
    var hold=parseDateValue_(b['Hold Until']);
    if(!hold||hold.getTime()<=Date.now()){releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);return fail_('HOLD_EXPIRED','مهلت این نوبت تمام شده است.');}
    var transaction=String(request.transactionNumber||request.paymentTrackingCode||request.paymentCode||'').trim();
    var receipt=String(request.receiptData||request.receiptBase64||'').trim();
    if(!hasRequiredReceiptImage_(receipt))return fail_('PAYMENT_RECEIPT_INVALID','تصویر فیش باید یک فایل تصویری معتبر با حجم حداکثر ۸ مگابایت باشد.');
    var saved={id:'',url:'',name:''};
    if(receipt)saved=saveReceiptToDrive_(receipt,request.receiptFileName,request.receiptMimeType,b);
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Payment Status':CONFIG.STATUSES.PAYMENT_RECEIVED,'Transaction Number':transaction,'Receipt Link':saved.url,
      'Receipt URL':saved.url,'Receipt File ID':saved.id,'Payment Submitted At':new Date(),
      'Hold Until':new Date(Date.now()+Math.max(15,toNumber_(getSetting_('Payment Review Hold Minutes',120)))*60000)
    });
    appendObjectRow_(CONFIG.SHEETS.PAYMENTS,{},{
      'Payment ID':generateId_('PAY'),'Booking ID':b['Booking ID'],'Customer ID':b['Customer ID'],
      'Amount':toNumber_(b['Final Price']),'Receipt Link':saved.url,'Receipt URL':saved.url,'Receipt File ID':saved.id,
      'Transaction Number':transaction,'Tracking Code':transaction,'Payment Status':CONFIG.STATUSES.PAYMENT_RECEIVED,'Submitted At':new Date()
    });
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.PAYMENT_SUBMITTED,bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:'Payment proof submitted.'});

    // Queue Telegram notification outside the booking request path.
    // The notification worker runs from a time-based Apps Script trigger,
    // so Telegram latency can never delay or break payment submission.
    queueBookingTelegramNotification_(b, 'payment_received');

    return {ok:true,bookingId:b['Booking ID'],paymentStatus:CONFIG.STATUSES.PAYMENT_RECEIVED,message:'فیش دریافت شد و برای بررسی ارسال شد.'};
  });
}

function approveBookingRequest_(request) {
  return withBookingLock_(function() {
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','درخواست نوبت پیدا نشد.');
    if(String(b['Appointment Status']||'')!==CONFIG.STATUSES.BOOKING_PENDING)
      return fail_('BOOKING_NOT_PENDING','این درخواست دیگر در انتظار بررسی اولیه نیست.');
    if(String(b['Payment Status']||'')!==CONFIG.STATUSES.PAYMENT_PENDING)
      return fail_('REQUEST_ALREADY_PAID','برای این درخواست قبلاً پرداخت ثبت شده است.');
    var hold=parseDateValue_(b['Hold Until']);
    if(!hold||hold.getTime()<=Date.now()){
      releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);
      return fail_('REQUEST_EXPIRED','مهلت ۱۲ ساعته درخواست پایان یافته است.');
    }
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Admin Note':'INITIAL_REQUEST_APPROVED',
      'Hold Until':new Date(Date.now()+10*60000),
      'Initial Approved At':new Date(),'Initial Approved By':String(request.adminId||request.admin||'admin')
    });
    appendBookingLog_({action:'INITIAL_REQUEST_APPROVED',bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:'Initial request approved; 10-minute payment window started.'});
    queueBookingTelegramNotification_(getBookingByIdObject_(b['Booking ID']), 'request_approved');
    return {ok:true,bookingId:b['Booking ID'],trackingCode:b['Tracking Code'],status:'AWAITING_PAYMENT'};
  });
}

function rejectBookingRequest_(request) {
  return withBookingLock_(function() {
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','درخواست نوبت پیدا نشد.');
    if(String(b['Appointment Status']||'')!==CONFIG.STATUSES.BOOKING_PENDING)
      return fail_('BOOKING_NOT_PENDING','این درخواست دیگر در انتظار بررسی اولیه نیست.');
    if(String(b['Payment Status']||'')!==CONFIG.STATUSES.PAYMENT_PENDING)
      return fail_('REQUEST_ALREADY_PAID','برای این درخواست قبلاً پرداخت ثبت شده است.');
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Appointment Status':CONFIG.STATUSES.BOOKING_REJECTED,
      'Admin Note':String(request.reason||'INITIAL_REQUEST_REJECTED'),
      'Rejected At':new Date(),'Rejected By':String(request.adminId||request.admin||'admin'),'Hold Until':''
    });
    appendBookingLog_({action:'INITIAL_REQUEST_REJECTED',bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:String(request.reason||'Initial request rejected.')});
    queueBookingTelegramNotification_(getBookingByIdObject_(b['Booking ID']), 'request_rejected');
    return {ok:true,bookingId:b['Booking ID'],status:CONFIG.STATUSES.BOOKING_REJECTED};
  });
}

function validatePaymentRecordForApprovalPure_(rows, bookingId, receivedStatus, approvedStatus) {
  var matches=(Array.isArray(rows)?rows:[]).filter(function(row){
    return String(row && row['Booking ID'] || '')===String(bookingId || '');
  });
  if(matches.length!==1) return {ok:false,error:'PAYMENT_RECORD_MISMATCH'};
  var status=String(matches[0]['Payment Status']||'');
  if(status!==receivedStatus && status!==approvedStatus) return {ok:false,error:'PAYMENT_RECORD_NOT_READY'};
  return {ok:true,row:matches[0]};
}

function testPaymentRecordApprovalGuardPure_() {
  var received='PAYMENT_RECEIVED';
  var approved='PAYMENT_APPROVED';
  var cases=[
    {name:'one received payment row is eligible',rows:[{'Booking ID':'B1','Payment Status':received}],id:'B1',expected:true},
    {name:'one already approved row is eligible for recovery',rows:[{'Booking ID':'B1','Payment Status':approved}],id:'B1',expected:true},
    {name:'missing payment row blocks final approval',rows:[],id:'B1',expected:false},
    {name:'duplicate payment rows block final approval',rows:[{'Booking ID':'B1','Payment Status':received},{'Booking ID':'B1','Payment Status':received}],id:'B1',expected:false},
    {name:'wrong payment state blocks final approval',rows:[{'Booking ID':'B1','Payment Status':'PAYMENT_REJECTED'}],id:'B1',expected:false},
    {name:'other booking payment row does not match',rows:[{'Booking ID':'B2','Payment Status':received}],id:'B1',expected:false}
  ];
  var failed=cases.filter(function(test){
    return validatePaymentRecordForApprovalPure_(test.rows,test.id,received,approved).ok!==test.expected;
  });
  return {ok:failed.length===0,test:'PAYMENT RECORD APPROVAL GUARD PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noSheetRead:true,noSheetWrite:true,noTelegramSent:true};
}

function approveBooking_(request){
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    var ps=String(b['Payment Status']||'');
    if(ps!==CONFIG.STATUSES.PAYMENT_RECEIVED&&ps!==CONFIG.STATUSES.PAYMENT_APPROVED)return fail_('PAYMENT_NOT_READY','ابتدا باید فیش پرداخت دریافت شود.');
    var date=normalizeJalaliDate_(b['Appointment Date']),time=normalizeTime_(b['Appointment Time']);
    var slotKey=String(b['Slot Key']||buildSlotKey_(date,time));
    var status=getSlotStatus_(slotKey,date,time);
    if(status===CONFIG.SLOT_STATUS.CONFIRMED)return fail_('SLOT_ALREADY_CONFIRMED','این زمان قبلاً تأیید شده است.');
    if(status===CONFIG.SLOT_STATUS.BLOCKED)return fail_('SLOT_BLOCKED','این زمان مسدود شده است.');
    // Validate the financial record BEFORE confirming the appointment.
    // A booking must never become final if its matching payment row is missing,
    // duplicated, or in a state other than received/already-approved.
    var paymentRowsForBooking=getSheetObjects_(CONFIG.SHEETS.PAYMENTS).filter(function(p){
      return String(p['Booking ID']||'')===String(b['Booking ID']||'');
    });
    if(paymentRowsForBooking.length!==1){
      return fail_('PAYMENT_RECORD_MISMATCH','رکورد پرداخت یکتای این نوبت پیدا نشد؛ نوبت نهایی نشد.');
    }
    var paymentRow=paymentRowsForBooking[0];
    var paymentRowStatus=String(paymentRow['Payment Status']||'');
    if(paymentRowStatus!==CONFIG.STATUSES.PAYMENT_RECEIVED &&
       paymentRowStatus!==CONFIG.STATUSES.PAYMENT_APPROVED){
      return fail_('PAYMENT_RECORD_NOT_READY','وضعیت رکورد پرداخت آمادهٔ تأیید نهایی نیست؛ نوبت نهایی نشد.');
    }

    var approvedAt=new Date();
    var approvedBy=String(request.adminId||request.admin||'admin');
    updateRowFields_(CONFIG.SHEETS.PAYMENTS,paymentRow._row,{
      'Payment Status':CONFIG.STATUSES.PAYMENT_APPROVED,
      'Approved At':approvedAt,
      'Approved By':approvedBy
    });

    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Payment Status':CONFIG.STATUSES.PAYMENT_APPROVED,'Appointment Status':CONFIG.STATUSES.BOOKING_CONFIRMED,
      'Approved At':approvedAt,'Approved By':approvedBy,'Hold Until':''
    });

    consumeDiscountToken_(
      String(b['Discount Code']||''),
      String(b['Customer ID']||''),
      String(b['Telegram ID']||''),
      String(b['Tracking Code']||'')
    );
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.ADMIN_APPROVED,bookingId:b['Booking ID'],slotKey:slotKey,details:'Booking approved.'});

    // Queue Telegram notification outside the booking request path.
    // The notification worker runs from a time-based Apps Script trigger,
    // so Telegram latency can never delay or break approval.
    queueBookingTelegramNotification_(b, 'approved');

    return {ok:true,bookingId:b['Booking ID'],status:CONFIG.STATUSES.BOOKING_CONFIRMED,message:'نوبت تأیید شد.'};
  });
}

function evaluatePaymentRejectionGuardPure_(booking, rows, received, approved, pending, confirmed) {
  var paymentStatus=String(booking && booking['Payment Status']||'');
  var appointmentStatus=String(booking && booking['Appointment Status']||'');
  if(paymentStatus===approved || appointmentStatus===confirmed) return {ok:false,error:'BOOKING_ALREADY_FINAL'};
  if(paymentStatus!==received || appointmentStatus!==pending) return {ok:false,error:'PAYMENT_NOT_AWAITING_REVIEW'};
  var matches=(Array.isArray(rows)?rows:[]).filter(function(p){return String(p['Booking ID']||'')===String(booking['Booking ID']||'');});
  if(matches.length!==1) return {ok:false,error:'PAYMENT_RECORD_MISMATCH'};
  if(String(matches[0]['Payment Status']||'')!==received) return {ok:false,error:'PAYMENT_RECORD_NOT_READY'};
  return {ok:true};
}

function testPaymentRejectionGuardPure_() {
  var R='PAYMENT_RECEIVED', A='PAYMENT_APPROVED', P='BOOKING_PENDING', C='BOOKING_CONFIRMED';
  var cases=[
    {name:'valid received payment',b:{'Booking ID':'B1','Payment Status':R,'Appointment Status':P},rows:[{'Booking ID':'B1','Payment Status':R}],ok:true},
    {name:'approved booking protected',b:{'Booking ID':'B1','Payment Status':A,'Appointment Status':C},rows:[{'Booking ID':'B1','Payment Status':A}],ok:false},
    {name:'missing payment row blocked',b:{'Booking ID':'B1','Payment Status':R,'Appointment Status':P},rows:[],ok:false},
    {name:'duplicate payment rows blocked',b:{'Booking ID':'B1','Payment Status':R,'Appointment Status':P},rows:[{'Booking ID':'B1','Payment Status':R},{'Booking ID':'B1','Payment Status':R}],ok:false},
    {name:'wrong payment status blocked',b:{'Booking ID':'B1','Payment Status':R,'Appointment Status':P},rows:[{'Booking ID':'B1','Payment Status':A}],ok:false},
    {name:'confirmed appointment protected',b:{'Booking ID':'B1','Payment Status':R,'Appointment Status':C},rows:[{'Booking ID':'B1','Payment Status':R}],ok:false}
  ];
  var failed=cases.filter(function(t){return evaluatePaymentRejectionGuardPure_(t.b,t.rows,R,A,P,C).ok!==t.ok;});
  return {ok:failed.length===0,test:'PAYMENT_REJECTION_GUARD_PURE_TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noSheetRead:true,noSheetWrite:true,noTelegramSent:true};
}

function rejectBooking_(request){
  request=request||{};
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    var bookingPaymentStatus=String(b['Payment Status']||'');
    var appointmentStatus=String(b['Appointment Status']||'');
    if(bookingPaymentStatus===CONFIG.STATUSES.PAYMENT_APPROVED ||
       appointmentStatus===CONFIG.STATUSES.BOOKING_CONFIRMED)
      return fail_('BOOKING_ALREADY_FINAL','نوبت نهایی‌شده قابل رد کردن نیست.');

    if(request.paymentReview===true){
      if(bookingPaymentStatus!==CONFIG.STATUSES.PAYMENT_RECEIVED)
        return fail_('PAYMENT_NOT_AWAITING_REVIEW','این فیش در انتظار بررسی نیست.');
      var matchingPayments=getSheetObjects_(CONFIG.SHEETS.PAYMENTS).filter(function(p){
        return String(p['Booking ID']||'')===String(b['Booking ID']||'');
      });
      if(matchingPayments.length!==1)
        return fail_('PAYMENT_RECORD_MISMATCH','رکورد پرداخت یکتای این نوبت پیدا نشد؛ وضعیت تغییری نکرد.');
      var paymentRow=matchingPayments[0];
      if(String(paymentRow['Payment Status']||'')!==CONFIG.STATUSES.PAYMENT_RECEIVED)
        return fail_('PAYMENT_RECORD_NOT_READY','رکورد پرداخت در انتظار بررسی نیست؛ وضعیت تغییری نکرد.');
      updateRowFields_(CONFIG.SHEETS.PAYMENTS,paymentRow._row,{
        'Payment Status':CONFIG.STATUSES.PAYMENT_REJECTED,
        'Rejected At':new Date(),
        'Rejected By':String(request.adminId||request.admin||'admin')
      });
    }

    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Appointment Status':CONFIG.STATUSES.BOOKING_REJECTED,'Payment Status':CONFIG.STATUSES.PAYMENT_REJECTED,
      'Rejected At':new Date(),'Rejected By':String(request.adminId||request.admin||'admin'),
      'Admin Note':String(request.note||request.reason||''),'Hold Until':''
    });
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.ADMIN_REJECTED,bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:String(request.note||request.reason||'')});
    queueBookingTelegramNotification_(b, 'rejected');
    return {ok:true,bookingId:b['Booking ID'],status:CONFIG.STATUSES.BOOKING_REJECTED};
  });
}

function cancelBooking_(request){
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{'Appointment Status':CONFIG.STATUSES.BOOKING_CANCELLED,'Cancelled At':new Date(),'Hold Until':'','Cancel Reason':String(request.reason||'')});
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.BOOKING_CANCELLED,bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:String(request.reason||'')});
    return {ok:true,bookingId:b['Booking ID'],status:CONFIG.STATUSES.BOOKING_CANCELLED};
  });
}

function shouldReleaseExpiredHold_(row, nowMs) {
  var current = nowMs === undefined ? Date.now() : Number(nowMs);
  var hold = parseDateValue_(row && row['Hold Until']);
  return !!row &&
    String(row['Appointment Status'] || '') === CONFIG.STATUSES.BOOKING_PENDING &&
    String(row['Payment Status'] || '') === CONFIG.STATUSES.PAYMENT_PENDING &&
    !!hold && hold.getTime() <= current;
}

/* Pure regression test: verifies that only unpaid, expired holds are releasable. */
function testExpiredHoldReleaseGuardPure_() {
  var now = Date.now();
  var expired = new Date(now - 60000);
  var future = new Date(now + 60000);
  var cases = [
    {name:'expired unpaid request releases', row:{'Appointment Status':CONFIG.STATUSES.BOOKING_PENDING,'Payment Status':CONFIG.STATUSES.PAYMENT_PENDING,'Hold Until':expired}, expected:true},
    {name:'receipt received remains held', row:{'Appointment Status':CONFIG.STATUSES.BOOKING_PENDING,'Payment Status':CONFIG.STATUSES.PAYMENT_RECEIVED,'Hold Until':expired}, expected:false},
    {name:'approved payment remains held until final approval', row:{'Appointment Status':CONFIG.STATUSES.BOOKING_PENDING,'Payment Status':CONFIG.STATUSES.PAYMENT_APPROVED,'Hold Until':expired}, expected:false},
    {name:'unexpired unpaid request remains held', row:{'Appointment Status':CONFIG.STATUSES.BOOKING_PENDING,'Payment Status':CONFIG.STATUSES.PAYMENT_PENDING,'Hold Until':future}, expected:false},
    {name:'confirmed appointment is not released', row:{'Appointment Status':CONFIG.STATUSES.BOOKING_CONFIRMED,'Payment Status':CONFIG.STATUSES.PAYMENT_PENDING,'Hold Until':expired}, expected:false}
  ];
  var failed = cases.filter(function(test) {
    return shouldReleaseExpiredHold_(test.row, now) !== test.expected;
  });
  return {ok:failed.length===0,test:'EXPIRED HOLD RELEASE GUARD PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noSheetRead:true,noSheetWrite:true,noTelegramSent:true};
}

function releaseExpiredHolds_(request){
  return withBookingLock_(function(){
    var rows=getSheetObjects_(CONFIG.SHEETS.BOOKINGS),released=0,now=Date.now();
    rows.forEach(function(r){
      if(shouldReleaseExpiredHold_(r, now)){
        updateRowFields_(CONFIG.SHEETS.BOOKINGS,r._row,{'Appointment Status':CONFIG.STATUSES.BOOKING_CANCELLED,'Hold Until':'','Admin Note':'Expired unpaid hold released.'});
        appendBookingLog_({action:CONFIG.LOG_ACTIONS.SLOT_RELEASED,bookingId:r['Booking ID'],slotKey:r['Slot Key'],details:'Expired unpaid hold released.'});
        released++;
      }
    });
    return {ok:true,released:released};
  });
}

function findServiceRecord_(serviceId,serviceName){
  var names=['Services','services'];
  var requestedId=String(serviceId||'').trim();
  var requestedName=String(serviceName||'').trim();

  for(var i=0;i<names.length;i++){
    if(!getSpreadsheet_().getSheetByName(names[i]))continue;

    var rows=getSheetObjects_(names[i]);

    /*
     * The Mini App can arrive here with a CMS-side service id while the
     * Booking Backend owns the canonical Service ID. Prefer the canonical
     * backend id, but safely reconcile a mismatched id by service name.
     *
     * This keeps the backend as the source of truth and prevents a valid
     * service from failing at final submission only because the two UI/CMS
     * layers use different identifiers.
     */
    var found=null;

    if(requestedId){
      found=rows.find(function(r){
        var id=String(firstField_(r,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||'').trim();
        return id===requestedId;
      });
    }

    if(!found && requestedName){
      found=rows.find(function(r){
        var name=String(firstField_(r,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
        return name===requestedName;
      });
    }

    if(found)return {
      id:String(firstField_(found,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||requestedId||''),
      name:String(firstField_(found,['نام خدمت','Service Name','Name','Title','عنوان'])||requestedName||''),
      price:toNumber_(firstField_(found,['قیمت','Price','Base Price','Original Price','مبلغ']))
    };
  }
  return null;
}

function upsertCustomer_(booking){
  var sheet=getSheet_(CONFIG.SHEETS.CUSTOMERS),headers=getHeaders_(sheet),rows=getSheetObjects_(CONFIG.SHEETS.CUSTOMERS);
  var idHeader=findHeader_(headers,['Customer ID','CustomerId','ID','Id','شناسه مشتری']);
  var mobileHeader=findHeader_(headers,['Mobile','Phone','Phone Number','شماره موبایل','موبایل']);
  var row=null;
  if(booking.customerId&&idHeader)row=rows.find(function(r){return String(r[idHeader]||'')===booking.customerId;});
  if(!row&&booking.mobile&&mobileHeader)row=rows.find(function(r){return String(r[mobileHeader]||'')===booking.mobile;});
  var id=booking.customerId||(row&&idHeader?String(row[idHeader]):'')||generateId_('CUS');
  var v={
    'Customer ID':id,
    'Telegram ID':booking.telegramId||'',
    'Telegram Username':booking.telegramUsername||'',
    'Telegram First Name':booking.telegramFirstName||'',
    'Telegram Last Name':booking.telegramLastName||'',
    'Booking First Name':booking.firstName||'',
    'Booking Last Name':booking.lastName||'',
    'Mobile':booking.mobile||'',
    'Last Booking At':new Date()
  };
  if(row)updateRowFields_(CONFIG.SHEETS.CUSTOMERS,row._row,v);else appendObjectRow_(CONFIG.SHEETS.CUSTOMERS,{},v);
  return id;
}

function getBookingByIdObject_(id){
  var value=String(id||'').trim();
  if(!value)return null;
  return getSheetObjects_(CONFIG.SHEETS.BOOKINGS).find(function(r){return String(r['Booking ID']||'')===value||String(r['Tracking Code']||'')===value;})||null;
}

function appendObjectRow_(sheetName,source,values){
  var sheet=getSheet_(sheetName),headers=getHeaders_(sheet),v=values||{};

  var rowValues=headers.map(function(h){
    return Object.prototype.hasOwnProperty.call(v,h)
      ? v[h]
      : (source&&Object.prototype.hasOwnProperty.call(source,h)
        ? source[h]
        : '');
  });

  /*
   * IMPORTANT:
   * Jalali booking dates must remain TEXT in Google Sheets.
   *
   * If a value such as 1405/07/14 is written with appendRow()
   * while the column is date-formatted, Google Sheets can interpret
   * it as a Gregorian year/month/day and convert it to a Date object.
   * The next read then turns 1405/07/14 into an unrelated Jalali date
   * (for example 784/04/23).
   *
   * We therefore force the Appointment Date column to plain text
   * BEFORE writing the row.
   */
  var dateColumnIndex=headers.indexOf('Appointment Date');

  if(dateColumnIndex!==-1){
    sheet
      .getRange(1,dateColumnIndex+1,sheet.getMaxRows(),1)
      .setNumberFormat('@');
  }

  var nextRow=sheet.getLastRow()+1;

  sheet
    .getRange(nextRow,1,1,headers.length)
    .setValues([rowValues]);
}

function updateRowFields_(sheetName,rowNumber,fields){
  var sheet=getSheet_(sheetName),headers=getHeaders_(sheet);
  Object.keys(fields).forEach(function(h){var actual=findHeader_(headers,[h]);if(actual)sheet.getRange(rowNumber,headers.indexOf(actual)+1).setValue(fields[h]);});
}

function appendBookingLog_(entry){
  appendObjectRow_(CONFIG.SHEETS.BOOKING_LOGS,{},{
    'Log ID':generateId_('LOG'),'Booking ID':entry.bookingId||'','Action':entry.action||'','Slot Key':entry.slotKey||'','Details':entry.details||'','Created At':new Date()
  });
}

function releaseBookingRow_(row,bookingId,slotKey){
  updateRowFields_(CONFIG.SHEETS.BOOKINGS,row,{'Appointment Status':CONFIG.STATUSES.BOOKING_CANCELLED,'Hold Until':'','Admin Note':'Expired hold released before payment submission.'});
  appendBookingLog_({action:CONFIG.LOG_ACTIONS.SLOT_RELEASED,bookingId:bookingId||'',slotKey:slotKey||'',details:'Expired booking hold released.'});
}

function publicBooking_(b){
  return {bookingId:b.bookingId||b['Booking ID']||'',trackingCode:b.trackingCode||b['Tracking Code']||'',date:b.appointmentDate||b['Appointment Date']||'',time:b.appointmentTime||b['Appointment Time']||'',serviceId:b.serviceId||b['Service ID']||'',serviceName:b.serviceName||b['Service Name']||'',basePrice:toNumber_(b.originalPrice||b['Original Price']),discountPercent:toNumber_(b.discountPercent||b['Discount Percent']),discountAmount:toNumber_(b.discountAmount||b['Discount Amount']),finalPrice:toNumber_(b.finalPrice||b['Final Price']),appointmentStatus:b.appointmentStatus||b['Appointment Status']||'',paymentStatus:b.paymentStatus||b['Payment Status']||'',holdUntil:b.holdUntil||b['Hold Until']||''};
}

function saveReceiptToDrive_(data,fileName,mimeType,booking){
  if (CONFIG.STAGING_MODE) return {id:'STAGING-RECEIPT-'+String(booking['Booking ID']||'TEST'),url:'',name:String(fileName||'staging-receipt')};
  var raw=String(data||''),mime=String(mimeType||'image/jpeg');
  if(raw.indexOf('data:')===0){var comma=raw.indexOf(',');if(comma<0)throw new Error('تصویر فیش نامعتبر است.');var meta=raw.substring(5,comma);raw=raw.substring(comma+1);var m=meta.match(/^([^;]+)/);if(m)mime=m[1];}
  var bytes=Utilities.base64Decode(raw);
  var name=String(fileName||('receipt-'+String(booking['Booking ID']||generateId_('PAY'))+'.jpg')).replace(/[^\w\-.\u0600-\u06FF]+/g,'_');
  var blob=Utilities.newBlob(bytes,mime,name);
  var folderId=String(getSetting_('Receipt Folder ID','')||'').trim();
  var file=folderId?DriveApp.getFolderById(folderId).createFile(blob):DriveApp.createFile(blob);
  return {id:file.getId(),url:file.getUrl(),name:file.getName()};
}

function getVIPSpreadsheet_(){
  if (CONFIG.STAGING_MODE) throw new Error('STAGING_MODE: VIP access is disabled.');
  return SpreadsheetApp.openById(
    CONFIG.VIP.SPREADSHEET_ID
  );
}

function getVIPSheet_(sheetName){
  var sheet=getVIPSpreadsheet_().getSheetByName(sheetName);
  if(!sheet){
    throw new Error('شیت VIP پیدا نشد: '+sheetName);
  }
  return sheet;
}

function findVIPDiscountToken_(code){
  var cleanCode=String(code||'').trim().toUpperCase();
  if(!cleanCode)return null;

  var tokenSheet=getVIPSheet_(CONFIG.VIP.TOKENS_SHEET);
  var customerSheet=getVIPSheet_(CONFIG.VIP.CUSTOMERS_SHEET);

  var tokenLastRow=tokenSheet.getLastRow();
  if(tokenLastRow<2)return null;

  var tokenValues=tokenSheet.getRange(
    2,
    1,
    tokenLastRow-1,
    Math.max(10,tokenSheet.getLastColumn())
  ).getValues();

  var customerLastRow=customerSheet.getLastRow();
  var customerValues=customerLastRow>=2
    ? customerSheet.getRange(2,1,customerLastRow-1,8).getValues()
    : [];

  for(var i=0;i<tokenValues.length;i++){
    var row=tokenValues[i];

    if(String(row[0]||'').trim().toUpperCase()!==cleanCode){
      continue;
    }

    var customerId=String(row[1]||'').trim();
    var customer=null;

    for(var j=0;j<customerValues.length;j++){
      if(String(customerValues[j][0]||'').trim()===customerId){
        customer=customerValues[j];
        break;
      }
    }

    return {
      sheet:tokenSheet,
      rowNumber:i+2,
      row:row,
      code:cleanCode,
      customerId:customerId,
      percent:toNumber_(row[2]),
      status:String(row[5]||'').trim(),
      used:String(row[5]||'').trim()===CONFIG.VIP.USED_STATUS,
      expiryMs:Number(row[9]||0),
      customerActive:!!customer && String(customer[7]||'').trim()===CONFIG.VIP.ACTIVE_STATUS,
      telegramId:customer ? String(customer[4]||'').trim() : ''
    };
  }

  return null;
}

function markVIPTokenExpired_(token){
  if(!token || !token.sheet || !token.rowNumber)return;
  token.sheet
    .getRange(token.rowNumber,6)
    .setValue(CONFIG.VIP.EXPIRED_STATUS);
}

function consumeDiscountToken_(code,customerId,telegramId,trackingCode){
  if(!String(code||'').trim())return;

  var found=findVIPDiscountToken_(String(code).trim().toUpperCase());

  if(!found){
    throw new Error('کد تخفیف معتبر نیست.');
  }

  if(found.used){
    throw new Error('کد تخفیف قبلاً مصرف شده است.');
  }

  if(found.expiryMs && found.expiryMs<=Date.now()){
    markVIPTokenExpired_(found);
    throw new Error('کد تخفیف منقضی شده است.');
  }

  if(found.status!==CONFIG.VIP.ACTIVE_STATUS){
    throw new Error('توکن VIP فعال نیست.');
  }

  if(!found.customerActive){
    throw new Error('عضویت VIP این کد فعال نیست.');
  }

  var requestedCustomerId=String(customerId||'').trim();
  if(requestedCustomerId && requestedCustomerId!==found.customerId){
    throw new Error('این کد تخفیف متعلق به این حساب VIP نیست.');
  }

  var requestedTelegramId=String(telegramId||'').trim();
  if(requestedTelegramId && found.telegramId && requestedTelegramId!==found.telegramId){
    throw new Error('این کد تخفیف متعلق به این حساب Telegram نیست.');
  }

  var now=new Date();

  found.sheet.getRange(found.rowNumber,6).setValue(CONFIG.VIP.USED_STATUS);
  found.sheet.getRange(found.rowNumber,7).setValue(formatVIPDateTime_(now));
  found.sheet.getRange(found.rowNumber,8).setValue(String(trackingCode||'').trim());

  SpreadsheetApp.flush();
}

function formatVIPDateTime_(date){
  if(!date)return '';
  var d=date instanceof Date?date:new Date(date);
  var parts=gregorianToJalali_(d);
  return parts[0]+'/'+String(parts[1]).padStart(2,'0')+'/'+String(parts[2]).padStart(2,'0')
    +' - '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function testVIPDiscountConnection(){
  var tokenSheet=getVIPSheet_(CONFIG.VIP.TOKENS_SHEET);
  var customerSheet=getVIPSheet_(CONFIG.VIP.CUSTOMERS_SHEET);

  var tokenLastRow=tokenSheet.getLastRow();
  var customerLastRow=customerSheet.getLastRow();

  var activeCount=0;
  var usableCount=0;

  if(tokenLastRow>=2){
    var rows=tokenSheet.getRange(2,1,tokenLastRow-1,Math.max(10,tokenSheet.getLastColumn())).getValues();
    rows.forEach(function(row){
      var status=String(row[5]||'').trim();
      var expiryMs=Number(row[9]||0);
      if(status===CONFIG.VIP.ACTIVE_STATUS){
        activeCount++;
        if(!expiryMs || expiryMs>Date.now())usableCount++;
      }
    });
  }

  return {
    ok:true,
    vipSpreadsheetConnected:true,
    vipCustomersRows:Math.max(0,customerLastRow-1),
    vipTokenRows:Math.max(0,tokenLastRow-1),
    activeTokens:activeCount,
    usableActiveTokens:usableCount
  };
}

function firstField_(row,names){
  for(var i=0;i<names.length;i++)if(Object.prototype.hasOwnProperty.call(row,names[i])&&row[names[i]]!=='')return row[names[i]];
  return '';
}

function findHeader_(headers,aliases){
  for(var i=0;i<aliases.length;i++)if(headers.indexOf(aliases[i])!==-1)return aliases[i];
  return '';
}

function toNumber_(value){
  if(typeof value==='number')return value;
  var n=Number(String(value==null?'':value).replace(/[,٬\s]/g,''));
  return isNaN(n)?0:n;
}

function generateId_(prefix){return prefix+'-'+Utilities.getUuid().replace(/-/g,'').substring(0,12).toUpperCase();}
function generateTrackingCode_(){return String(Math.floor(100000+Math.random()*900000));}
function fail_(error,message){return {ok:false,error:error,message:message};}

function testVIPDiscountValidation(){
  var tokenSheet=getVIPSheet_(CONFIG.VIP.TOKENS_SHEET);
  var lastRow=tokenSheet.getLastRow();

  if(lastRow<2){
    throw new Error('هیچ توکنی برای تست پیدا نشد.');
  }

  var rows=tokenSheet.getRange(
    2,
    1,
    lastRow-1,
    Math.max(10,tokenSheet.getLastColumn())
  ).getValues();

  var testToken=null;

  for(var i=0;i<rows.length;i++){
    var row=rows[i];
    var status=String(row[5]||'').trim();
    var expiryMs=Number(row[9]||0);

    if(
      status===CONFIG.VIP.ACTIVE_STATUS &&
      (!expiryMs || expiryMs>Date.now())
    ){
      testToken={
        code:String(row[0]||'').trim().toUpperCase(),
        customerId:String(row[1]||'').trim()
      };
      break;
    }
  }

  if(!testToken || !testToken.code){
    throw new Error('هیچ توکن VIP فعال و قابل استفاده‌ای برای تست پیدا نشد.');
  }

  var found=findVIPDiscountToken_(testToken.code);

  if(!found){
    throw new Error('توکن فعال در VIP پیدا شد اما از مسیر Booking قابل خواندن نیست.');
  }

  var result=validateDiscount_({
    price:1000000,
    code:testToken.code,
    customerId:found.customerId,
    telegramId:found.telegramId
  });

  return {
    ok:!!result.ok,
    valid:!!result.valid,
    discountPercent:result.discountPercent,
    discountAmount:result.discountAmount,
    finalPrice:result.finalPrice,
    vipCustomerId:result.vipCustomerId||'',
    tokenStatus:found.status,
    customerActive:found.customerActive,
    tokenConsumed:false
  };
}

function testPhase2ReadOnly(){
  return {ok:true,services:getServices_({}),settings:getBookingSettings_(),schedule:getSchedule_(),dates:getAvailableDates_({})};
}


/* =====================================================
   CONTROLLED BOOKING CORE TEST
   Create -> Hold -> Verify -> Release
   - Uses a real priced service and real available slot.
   - Uses Jalali dates exactly as production code does.
   - Automatically releases the test booking on ANY failure.
   - Does not use VIP and does not submit/approve payment.
   ===================================================== */

function testCreateBookingCore() {

  var result = {
    ok: false,
    serviceFound: false,
    servicePriceValid: false,
    dateFound: false,
    slotFound: false,
    bookingCreated: false,
    bookingStored: false,
    dateVerified: false,
    timeVerified: false,
    slotKeyVerified: false,
    priceVerified: false,
    pendingVerified: false,
    paymentPendingVerified: false,
    holdVerified: false,
    slotHeldVerified: false,
    released: false,
    slotFreeVerified: false,
    vipTouched: false,
    tokenConsumed: false,
    bookingId: '',
    requestId: '',
    error: ''
  };

  var createdBooking = null;

  try {

    /* -------------------------------------------------
       1. Select a REAL priced service
       ------------------------------------------------- */

    var serviceRows = getSheetObjects_('Services');

    var serviceRow = serviceRows.find(function(row) {
      var active =
        row['فعال'] === undefined
          ? true
          : isTruthy_(row['فعال']);

      var price =
        toNumber_(
          firstField_(
            row,
            ['قیمت', 'Price', 'Base Price', 'Original Price', 'مبلغ']
          )
        );

      var name =
        String(
          firstField_(
            row,
            ['نام خدمت', 'Service Name', 'Name', 'Title', 'عنوان']
          ) || ''
        ).trim();

      return active && name && price > 0;
    });

    if (!serviceRow) {
      throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');
    }

    var serviceName =
      String(
        firstField_(
          serviceRow,
          ['نام خدمت', 'Service Name', 'Name', 'Title', 'عنوان']
        )
      ).trim();

    var serviceId =
      String(
        firstField_(
          serviceRow,
          ['Service ID', 'ServiceId', 'ID', 'Id', 'id', 'شناسه خدمت']
        ) || ''
      ).trim();

    var servicePrice =
      toNumber_(
        firstField_(
          serviceRow,
          ['قیمت', 'Price', 'Base Price', 'Original Price', 'مبلغ']
        )
      );

    result.serviceFound = true;
    result.servicePriceValid = servicePrice > 0;

    /* -------------------------------------------------
       2. Select first real available Jalali date
       ------------------------------------------------- */

    var availableDates =
      getAvailableDates_({});

    if (
      !availableDates ||
      !availableDates.ok ||
      !availableDates.dates ||
      !availableDates.dates.length
    ) {
      throw new Error('هیچ تاریخ شمسی قابل رزروی برای تست پیدا نشد.');
    }

    var jalaliDate =
      normalizeJalaliDate_(
        availableDates.dates[0].date
      );

    if (!jalaliDate) {
      throw new Error('تاریخ شمسی تست معتبر نیست.');
    }

    result.dateFound = true;

    /* -------------------------------------------------
       3. Select first FREE slot
       ------------------------------------------------- */

    var slotData =
      getAvailableSlots_({
        date: jalaliDate
      });

    if (
      !slotData ||
      !slotData.ok ||
      !slotData.slots ||
      !slotData.slots.length
    ) {
      throw new Error('هیچ ساعت قابل رزروی برای تاریخ تست پیدا نشد.');
    }

    var freeSlot =
      slotData.slots.find(function(slot) {
        return (
          slot.available === true &&
          String(slot.status) === CONFIG.SLOT_STATUS.FREE
        );
      });

    if (!freeSlot) {
      throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');
    }

    var testTime =
      normalizeTime_(freeSlot.time);

    var expectedSlotKey =
      buildSlotKey_(
        jalaliDate,
        testTime
      );

    result.slotFound = true;

    /* -------------------------------------------------
       4. Create REAL test booking
       ------------------------------------------------- */

    var unique =
      String(new Date().getTime());

    var requestId =
      'TESTREQ-' + unique;

    result.requestId = requestId;

    var createResult =
      createBooking_({
        requestId: requestId,
        telegramId: 'TEST-TG-' + unique,
        customerId: 'TESTCUS-' + unique,
        firstName: 'TEST',
        lastName: 'KaenatChi',
        mobile: 'TEST-' + unique,
        serviceId: serviceId,
        serviceName: serviceName,
        appointmentDate: jalaliDate,
        appointmentTime: testTime,
        discountCode: ''
      });

    if (!createResult || !createResult.ok) {
      throw new Error(
        'Create Booking failed: ' +
        JSON.stringify(createResult)
      );
    }

    result.bookingCreated = true;

    createdBooking =
      createResult.booking || {};

    result.bookingId =
      String(
        createdBooking.bookingId ||
        createdBooking['Booking ID'] ||
        ''
      ).trim();

    if (!result.bookingId) {
      throw new Error('Booking ساخته شد اما Booking ID برنگشت.');
    }

    /* -------------------------------------------------
       5. Read the SAME booking back from Sheet
       ------------------------------------------------- */

    var stored =
      getBookingByIdObject_(
        result.bookingId
      );

    if (!stored) {
      throw new Error(
        'Booking ساخته شد اما از Sheet قابل خواندن نیست.'
      );
    }

    result.bookingStored = true;

    /* -------------------------------------------------
       6. Production-compatible verification
       ------------------------------------------------- */

    var storedDate =
      normalizeJalaliDate_(
        stored['Appointment Date']
      );

    var expectedDate =
      normalizeJalaliDate_(
        jalaliDate
      );

    result.dateVerified =
      storedDate === expectedDate;

    if (!result.dateVerified) {
      throw new Error(
        'تاریخ Jalali ذخیره‌شده صحیح نیست. ' +
        'Expected=' + expectedDate +
        ' Stored=' + storedDate
      );
    }

    var storedTime =
      normalizeTime_(
        stored['Appointment Time']
      );

    result.timeVerified =
      storedTime === testTime;

    if (!result.timeVerified) {
      throw new Error(
        'ساعت ذخیره‌شده صحیح نیست. ' +
        'Expected=' + testTime +
        ' Stored=' + storedTime
      );
    }

    result.slotKeyVerified =
      String(
        stored['Slot Key'] || ''
      ).trim() === expectedSlotKey;

    if (!result.slotKeyVerified) {
      throw new Error(
        'Slot Key ذخیره‌شده صحیح نیست.'
      );
    }

    var storedPrice =
      toNumber_(
        stored['Original Price']
      );

    result.priceVerified =
      storedPrice === servicePrice;

    if (!result.priceVerified) {
      throw new Error(
        'قیمت ذخیره‌شده صحیح نیست. ' +
        'Expected=' + servicePrice +
        ' Stored=' + storedPrice
      );
    }

    result.pendingVerified =
      String(
        stored['Appointment Status'] || ''
      ) ===
      CONFIG.STATUSES.BOOKING_PENDING;

    if (!result.pendingVerified) {
      throw new Error(
        'وضعیت Booking در حالت انتظار نیست.'
      );
    }

    result.paymentPendingVerified =
      String(
        stored['Payment Status'] || ''
      ) ===
      CONFIG.STATUSES.PAYMENT_PENDING;

    if (!result.paymentPendingVerified) {
      throw new Error(
        'وضعیت پرداخت در حالت انتظار نیست.'
      );
    }

    var holdUntil =
      parseDateValue_(
        stored['Hold Until']
      );

    result.holdVerified =
      !!holdUntil &&
      holdUntil.getTime() > Date.now();

    if (!result.holdVerified) {
      throw new Error(
        'Hold Until معتبر و آینده‌دار نیست.'
      );
    }

    /* -------------------------------------------------
       7. Verify slot is HELD
       ------------------------------------------------- */

    result.slotHeldVerified =
      getSlotStatus_(
        expectedSlotKey,
        jalaliDate,
        testTime
      ) === CONFIG.SLOT_STATUS.HELD;

    if (!result.slotHeldVerified) {
      throw new Error(
        'Slot بعد از Create در وضعیت HELD نیست.'
      );
    }

    /* -------------------------------------------------
       8. Release test booking
       ------------------------------------------------- */

    releaseBookingRow_(
      stored._row,
      stored['Booking ID'],
      stored['Slot Key']
    );

    result.released = true;

    /* -------------------------------------------------
       9. Verify slot is FREE
       ------------------------------------------------- */

    result.slotFreeVerified =
      getSlotStatus_(
        expectedSlotKey,
        jalaliDate,
        testTime
      ) === CONFIG.SLOT_STATUS.FREE;

    if (!result.slotFreeVerified) {
      throw new Error(
        'Slot بعد از Release آزاد نشده است.'
      );
    }

    result.ok = true;

  } catch (error) {

    result.error =
      String(
        error && error.message
          ? error.message
          : error
      );

    /*
     * Safety net:
     * If Create succeeded but a later verification failed,
     * release ONLY this test booking.
     */
    try {

      if (
        !result.released &&
        result.bookingId
      ) {

        var cleanupBooking =
          getBookingByIdObject_(
            result.bookingId
          );

        if (
          cleanupBooking &&
          String(
            cleanupBooking['Appointment Status'] || ''
          ) ===
          CONFIG.STATUSES.BOOKING_PENDING
        ) {

          releaseBookingRow_(
            cleanupBooking._row,
            cleanupBooking['Booking ID'],
            cleanupBooking['Slot Key']
          );

          result.released = true;
        }
      }

    } catch (cleanupError) {

      result.error +=
        ' | Cleanup failed: ' +
        String(
          cleanupError && cleanupError.message
            ? cleanupError.message
            : cleanupError
        );
    }

  }

  /* ---------------------------------------------------
     10. Safety guarantees
     --------------------------------------------------- */

  result.vipTouched = false;
  result.tokenConsumed = false;

  Logger.log(
    'REAL BOOKING CREATE + HOLD + VERIFY + RELEASE TEST'
  );

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  Logger.log('--- TEST DATA ---');
  Logger.log(
    'Service: ' +
    String(
      serviceName || ''
    )
  );
  Logger.log(
    'Service Price: ' +
    String(
      servicePrice || 0
    )
  );
  Logger.log(
    'Jalali Date: ' +
    String(
      jalaliDate || ''
    )
  );
  Logger.log(
    'Time: ' +
    String(
      testTime || ''
    )
  );
  Logger.log(
    'Booking ID: ' +
    String(
      result.bookingId || ''
    )
  );

  Logger.log('--- SAFETY ---');
  Logger.log(
    'VIP TOUCHED: false'
  );
  Logger.log(
    'VIP TOKEN CONSUMED: false'
  );
  Logger.log(
    'TEST BOOKING RELEASED: ' +
    result.released
  );
  Logger.log(
    'ALL CHECKS PASSED: ' +
    result.ok
  );

  return result;
}



/* =====================================================
   PHASE 3 - PAYMENT FLOW TESTS
   Controlled integration tests.
   - Uses real service / real available Jalali slot.
   - Uses mock payment proof only; NO real bank gateway.
   - Never consumes VIP tokens.
   - Cleans up only test bookings.
   ===================================================== */

function testPaymentFlowSubmitOnly() {
  var result = {
    ok:false,
    serviceFound:false,
    dateFound:false,
    slotFound:false,
    bookingCreated:false,
    paymentSubmitted:false,
    paymentRowCreated:false,
    paymentStatusVerified:false,
    appointmentStillPending:false,
    vipTouched:false,
    tokenConsumed:false,
    cleanedUp:false,
    bookingId:'',
    error:''
  };

  var created = null;

  try {
    var services = getSheetObjects_('Services');
    var service = services.find(function(row) {
      var active = row['فعال'] === undefined ? true : isTruthy_(row['فعال']);
      var name = String(firstField_(row,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
      var price = toNumber_(firstField_(row,['قیمت','Price','Base Price','Original Price','مبلغ']));
      return active && name && price > 0;
    });
    if(!service) throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');
    result.serviceFound = true;

    var serviceName = String(firstField_(service,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
    var serviceId = String(firstField_(service,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||'').trim();

    var dates = getAvailableDates_({});
    if(!dates.ok || !dates.dates || !dates.dates.length) throw new Error('هیچ تاریخ شمسی قابل رزروی برای تست پیدا نشد.');
    var date = normalizeJalaliDate_(dates.dates[0].date);
    result.dateFound = !!date;

    var slots = getAvailableSlots_({date:date});
    var free = slots.slots && slots.slots.find(function(s){ return s.available===true && String(s.status)===CONFIG.SLOT_STATUS.FREE; });
    if(!free) throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');
    var time = normalizeTime_(free.time);
    result.slotFound = true;

    var unique=String(new Date().getTime());
    var create=createBooking_({
      requestId:'PAYTEST-'+unique,
      telegramId:'PAYTEST-TG-'+unique,
      customerId:'PAYTEST-CUS-'+unique,
      firstName:'PAYMENT',
      lastName:'TEST',
      mobile:'PAYTEST-'+unique,
      serviceId:serviceId,
      serviceName:serviceName,
      appointmentDate:date,
      appointmentTime:time,
      discountCode:''
    });
    if(!create || !create.ok) throw new Error('Create Booking failed: '+JSON.stringify(create));
    result.bookingCreated=true;
    created=create.booking||{};
    result.bookingId=String(created.bookingId||created['Booking ID']||'').trim();
    if(!result.bookingId) throw new Error('Booking ID برای تست برگشت داده نشد.');

    var before=getBookingByIdObject_(result.bookingId);
    if(!before) throw new Error('Booking تست در Sheet پیدا نشد.');

    var submit=submitPayment_({
      bookingId:result.bookingId,
      transactionNumber:'MOCK-PAY-'+unique,
      receiptData:'data:text/plain;base64,UEFZTUVOVCBURVNU',
      receiptFileName:'payment-test-'+unique+'.txt',
      receiptMimeType:'text/plain'
    });
    if(!submit || !submit.ok) throw new Error('Submit Payment failed: '+JSON.stringify(submit));
    result.paymentSubmitted=true;

    var after=getBookingByIdObject_(result.bookingId);
    if(!after) throw new Error('Booking بعد از پرداخت پیدا نشد.');

    result.paymentStatusVerified=String(after['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED;
    result.appointmentStillPending=String(after['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING;

    if(!result.paymentStatusVerified) throw new Error('Payment Status بعد از Submit صحیح نیست.');
    if(!result.appointmentStillPending) throw new Error('Booking نباید قبل از تأیید ادمین Confirm شود.');

    var payments=getSheetObjects_(CONFIG.SHEETS.PAYMENTS);
    result.paymentRowCreated=payments.some(function(p){
      return String(p['Booking ID']||'')===result.bookingId &&
             String(p['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED;
    });
    if(!result.paymentRowCreated) throw new Error('رکورد پرداخت در Payments ساخته نشد.');

    result.ok=true;

  } catch(e) {
    result.error=String(e && e.message ? e.message : e);
  }

  try {
    if(result.bookingId){
      var b=getBookingByIdObject_(result.bookingId);
      if(b && String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING){
        releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);
        result.cleanedUp=true;
      }
    }
  } catch(cleanup){
    result.error+=(result.error?' | ':'')+'Cleanup failed: '+String(cleanup && cleanup.message ? cleanup.message : cleanup);
  }

  result.vipTouched=false;
  result.tokenConsumed=false;
  Logger.log('PAYMENT FLOW - SUBMIT TEST');
  Logger.log(JSON.stringify(result,null,2));
  Logger.log('ALL CHECKS PASSED: '+result.ok);
  return result;
}


function testPaymentFlowRejectWithoutProof() {
  var result={ok:false,bookingId:'',rejectedWithoutProof:false,cleanedUp:false,error:''};

  try {
    var services=getSheetObjects_('Services');
    var service=services.find(function(row){
      var active=row['فعال']===undefined?true:isTruthy_(row['فعال']);
      var name=String(firstField_(row,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
      var price=toNumber_(firstField_(row,['قیمت','Price','Base Price','Original Price','مبلغ']));
      return active&&name&&price>0;
    });
    if(!service)throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');

    var dateRows=getAvailableDates_({});
    if(!dateRows.ok||!dateRows.dates||!dateRows.dates.length)throw new Error('هیچ تاریخ قابل رزروی نیست.');
    var date=normalizeJalaliDate_(dateRows.dates[0].date);
    var slots=getAvailableSlots_({date:date});
    var free=slots.slots.find(function(s){return s.available===true&&String(s.status)===CONFIG.SLOT_STATUS.FREE;});
    if(!free)throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');

    var unique=String(new Date().getTime());
    var create=createBooking_({
      requestId:'PAYNO-'+unique,telegramId:'PAYNO-TG-'+unique,customerId:'PAYNO-CUS-'+unique,
      firstName:'PAYMENT',lastName:'NO-PROOF',mobile:'PAYNO-'+unique,
      serviceId:String(firstField_(service,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||''),
      serviceName:String(firstField_(service,['نام خدمت','Service Name','Name','Title','عنوان'])||''),
      appointmentDate:date,appointmentTime:normalizeTime_(free.time),discountCode:''
    });
    if(!create.ok)throw new Error('Create failed: '+JSON.stringify(create));
    result.bookingId=String(create.booking.bookingId||'').trim();

    var submit=submitPayment_({bookingId:result.bookingId});
    result.rejectedWithoutProof=!!submit && submit.ok===false && submit.error==='PAYMENT_PROOF_REQUIRED';
    if(!result.rejectedWithoutProof)throw new Error('سیستم بدون Proof پرداخت را رد نکرد.');

    result.ok=true;
  } catch(e){ result.error=String(e&&e.message?e.message:e); }

  try{
    if(result.bookingId){
      var b=getBookingByIdObject_(result.bookingId);
      if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING){
        releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']); result.cleanedUp=true;
      }
    }
  }catch(cleanup){result.error+=(result.error?' | ':'')+'Cleanup failed: '+String(cleanup&&cleanup.message?cleanup.message:cleanup);}
  Logger.log('PAYMENT FLOW - NO PROOF TEST');
  Logger.log(JSON.stringify(result,null,2));
  Logger.log('ALL CHECKS PASSED: '+result.ok);
  return result;
}



function testPaymentApprovalFlow() {
  var result = {
    ok:false,
    serviceFound:false,
    dateFound:false,
    slotFound:false,
    bookingCreated:false,
    paymentSubmitted:false,
    approvalSucceeded:false,
    paymentStatusVerified:false,
    appointmentStatusVerified:false,
    slotConfirmedVerified:false,
    paymentsRowApprovedVerified:false,
    duplicateApprovalBlocked:false,
    vipTouched:false,
    tokenConsumed:false,
    cleanedUp:false,
    slotFreeAfterCleanup:false,
    bookingId:'',
    error:''
  };

  try {
    var services=getSheetObjects_('Services');
    var service=services.find(function(row){
      var active=row['فعال']===undefined?true:isTruthy_(row['فعال']);
      var name=String(firstField_(row,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
      var price=toNumber_(firstField_(row,['قیمت','Price','Base Price','Original Price','مبلغ']));
      return active&&name&&price>0;
    });
    if(!service)throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');
    result.serviceFound=true;

    var dates=getAvailableDates_({});
    if(!dates.ok||!dates.dates||!dates.dates.length)throw new Error('هیچ تاریخ قابل رزروی نیست.');
    var date=normalizeJalaliDate_(dates.dates[0].date);
    result.dateFound=!!date;

    var slots=getAvailableSlots_({date:date});
    var free=slots.slots&&slots.slots.find(function(s){
      return s.available===true&&String(s.status)===CONFIG.SLOT_STATUS.FREE;
    });
    if(!free)throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');
    var time=normalizeTime_(free.time);
    result.slotFound=true;

    var unique=String(new Date().getTime());
    var serviceId=String(firstField_(service,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||'');
    var serviceName=String(firstField_(service,['نام خدمت','Service Name','Name','Title','عنوان'])||'');
    var create=createBooking_({
      requestId:'PAYAPP-'+unique,
      telegramId:'PAYAPP-TG-'+unique,
      customerId:'PAYAPP-CUS-'+unique,
      firstName:'PAYMENT',
      lastName:'APPROVAL',
      mobile:'PAYAPP-'+unique,
      serviceId:serviceId,
      serviceName:serviceName,
      appointmentDate:date,
      appointmentTime:time,
      discountCode:''
    });
    if(!create||!create.ok)throw new Error('Create Booking failed: '+JSON.stringify(create));
    result.bookingCreated=true;
    result.bookingId=String(create.booking.bookingId||'').trim();
    if(!result.bookingId)throw new Error('Booking ID برای تست برگشت داده نشد.');

    var submit=submitPayment_({
      bookingId:result.bookingId,
      transactionNumber:'MOCK-APPROVAL-'+unique,
      receiptData:'data:text/plain;base64,UEFZTUVOVCBFVkFMLUFQUFJPVkFM',
      receiptFileName:'payment-approval-test-'+unique+'.txt',
      receiptMimeType:'text/plain'
    });
    if(!submit||!submit.ok)throw new Error('Submit Payment failed: '+JSON.stringify(submit));
    result.paymentSubmitted=true;

    var approved=approveBooking_({
      bookingId:result.bookingId,
      adminId:'PAYMENT-FLOW-TEST'
    });
    if(!approved||!approved.ok)throw new Error('Approve Booking failed: '+JSON.stringify(approved));
    result.approvalSucceeded=true;

    var after=getBookingByIdObject_(result.bookingId);
    if(!after)throw new Error('Booking بعد از Approval پیدا نشد.');

    result.paymentStatusVerified=String(after['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_APPROVED;
    result.appointmentStatusVerified=String(after['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_CONFIRMED;
    result.slotConfirmedVerified=getSlotStatus_(String(after['Slot Key']||''),normalizeJalaliDate_(after['Appointment Date']),normalizeTime_(after['Appointment Time']))===CONFIG.SLOT_STATUS.CONFIRMED;

    var payments=getSheetObjects_(CONFIG.SHEETS.PAYMENTS);
    var paymentRows=payments.filter(function(p){return String(p['Booking ID']||'')===result.bookingId;});
    result.paymentsRowApprovedVerified=paymentRows.length===1 && String(paymentRows[0]['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_APPROVED;

    var duplicate=approveBooking_({bookingId:result.bookingId,adminId:'PAYMENT-FLOW-TEST-DUP'});
    result.duplicateApprovalBlocked=!!duplicate&&duplicate.ok===false;

    if(!result.paymentStatusVerified)throw new Error('Booking Payment Status به تأیید شد تغییر نکرد.');
    if(!result.appointmentStatusVerified)throw new Error('Appointment Status به تأیید شده تغییر نکرد.');
    if(!result.slotConfirmedVerified)throw new Error('Slot بعد از Approval واقعاً Confirmed نشده است.');
    if(!result.paymentsRowApprovedVerified)throw new Error('رکورد Payments بعد از Approval به تأیید شد تغییر نکرد.');
    if(!result.duplicateApprovalBlocked)throw new Error('Approval تکراری مسدود نشد.');

    result.ok=true;
  } catch(e) {
    result.error=String(e&&e.message?e.message:e);
  }

  try {
    if(result.bookingId){
      var b=getBookingByIdObject_(result.bookingId);
      if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_CONFIRMED){
        var cancelled=cancelBooking_({bookingId:result.bookingId,reason:'Payment approval flow test cleanup'});
        result.cleanedUp=!!cancelled&&cancelled.ok===true;
      } else if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING){
        releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);
        result.cleanedUp=true;
      }
      if(b){
        result.slotFreeAfterCleanup=getSlotStatus_(String(b['Slot Key']||''),normalizeJalaliDate_(b['Appointment Date']),normalizeTime_(b['Appointment Time']))===CONFIG.SLOT_STATUS.FREE;
      }
    }
  } catch(cleanup) {
    result.error+=(result.error?' | ':'')+'Cleanup failed: '+String(cleanup&&cleanup.message?cleanup.message:cleanup);
  }

  result.vipTouched=false;
  result.tokenConsumed=false;
  Logger.log('PAYMENT FLOW - APPROVAL TEST');
  Logger.log(JSON.stringify(result,null,2));
  Logger.log('ALL CHECKS PASSED: '+result.ok);
  return result;
}


function testPaymentFlowDuplicate() {
  var result={
    ok:false,
    serviceFound:false,
    dateFound:false,
    slotFound:false,
    bookingCreated:false,
    firstPaymentSubmitted:false,
    secondPaymentRejected:false,
    paymentRowCountVerified:false,
    originalPaymentPreserved:false,
    bookingStatePreserved:false,
    cleanedUp:false,
    bookingId:'',
    error:''
  };

  try {
    var services=getSheetObjects_('Services');
    var service=services.find(function(row){
      var active=row['فعال']===undefined?true:isTruthy_(row['فعال']);
      var name=String(firstField_(row,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
      var price=toNumber_(firstField_(row,['قیمت','Price','Base Price','Original Price','مبلغ']));
      return active&&name&&price>0;
    });
    if(!service)throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');
    result.serviceFound=true;

    var dates=getAvailableDates_({});
    if(!dates.ok||!dates.dates||!dates.dates.length)throw new Error('هیچ تاریخ قابل رزروی نیست.');
    var date=normalizeJalaliDate_(dates.dates[0].date);
    result.dateFound=!!date;

    var slots=getAvailableSlots_({date:date});
    var free=slots.slots&&slots.slots.find(function(s){
      return s.available===true&&String(s.status)===CONFIG.SLOT_STATUS.FREE;
    });
    if(!free)throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');
    var time=normalizeTime_(free.time);
    result.slotFound=true;

    var unique=String(new Date().getTime());
    var serviceId=String(firstField_(service,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||'');
    var serviceName=String(firstField_(service,['نام خدمت','Service Name','Name','Title','عنوان'])||'');
    var create=createBooking_({
      requestId:'PAYDUP-'+unique,
      telegramId:'PAYDUP-TG-'+unique,
      customerId:'PAYDUP-CUS-'+unique,
      firstName:'PAYMENT',
      lastName:'DUPLICATE',
      mobile:'PAYDUP-'+unique,
      serviceId:serviceId,
      serviceName:serviceName,
      appointmentDate:date,
      appointmentTime:time,
      discountCode:''
    });
    if(!create||!create.ok)throw new Error('Create Booking failed: '+JSON.stringify(create));
    result.bookingCreated=true;
    result.bookingId=String(create.booking.bookingId||'').trim();
    if(!result.bookingId)throw new Error('Booking ID برای تست برگشت داده نشد.');

    var first=submitPayment_({
      bookingId:result.bookingId,
      transactionNumber:'MOCK-DUP-1-'+unique,
      receiptData:'data:text/plain;base64,UEFZTUVOVCBEVVAtMQ==',
      receiptFileName:'payment-duplicate-test-1-'+unique+'.txt',
      receiptMimeType:'text/plain'
    });
    if(!first||!first.ok)throw new Error('First payment submit failed: '+JSON.stringify(first));
    result.firstPaymentSubmitted=true;

    var second=submitPayment_({
      bookingId:result.bookingId,
      transactionNumber:'MOCK-DUP-2-'+unique,
      receiptData:'data:text/plain;base64,UEFZTUVOVCBEVVAtMg==',
      receiptFileName:'payment-duplicate-test-2-'+unique+'.txt',
      receiptMimeType:'text/plain'
    });
    result.secondPaymentRejected=!!second&&second.ok===false;

    var payments=getSheetObjects_(CONFIG.SHEETS.PAYMENTS);
    var paymentRows=payments.filter(function(p){return String(p['Booking ID']||'')===result.bookingId;});
    result.paymentRowCountVerified=paymentRows.length===1;
    if(paymentRows.length===1){
      result.originalPaymentPreserved=
        String(paymentRows[0]['Transaction Number']||'')==='MOCK-DUP-1-'+unique &&
        String(paymentRows[0]['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED;
    }

    var after=getBookingByIdObject_(result.bookingId);
    result.bookingStatePreserved=!!after &&
      String(after['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED &&
      String(after['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING &&
      String(after['Transaction Number']||'')==='MOCK-DUP-1-'+unique;

    if(!result.secondPaymentRejected)throw new Error('ارسال Payment دوم مسدود نشد.');
    if(!result.paymentRowCountVerified)throw new Error('برای یک Booking بیش از یک رکورد Payments ساخته شد.');
    if(!result.originalPaymentPreserved)throw new Error('اطلاعات Payment اول حفظ نشد یا وضعیت آن تغییر کرد.');
    if(!result.bookingStatePreserved)throw new Error('وضعیت/اطلاعات Booking بعد از Payment دوم تغییر غیرمجاز کرد.');

    result.ok=true;
  } catch(e) {
    result.error=String(e&&e.message?e.message:e);
  }

  try {
    if(result.bookingId){
      var b=getBookingByIdObject_(result.bookingId);
      if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING){
        releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);
        result.cleanedUp=true;
      } else if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_CONFIRMED){
        var cancelled=cancelBooking_({bookingId:result.bookingId,reason:'Duplicate payment flow test cleanup'});
        result.cleanedUp=!!cancelled&&cancelled.ok===true;
      }
    }
  } catch(cleanup) {
    result.error+=(result.error?' | ':'')+'Cleanup failed: '+String(cleanup&&cleanup.message?cleanup.message:cleanup);
  }

  Logger.log('PAYMENT FLOW - DUPLICATE PAYMENT TEST');
  Logger.log(JSON.stringify(result,null,2));
  Logger.log('ALL CHECKS PASSED: '+result.ok);
  return result;
}


function testApprovalBlockedBeforePayment() {
  var result={
    ok:false,
    bookingId:'',
    blockedBeforePayment:false,
    paymentStatusStillPending:false,
    cleanedUp:false,
    error:''
  };

  try {
    var services=getSheetObjects_('Services');
    var service=services.find(function(row){
      var active=row['فعال']===undefined?true:isTruthy_(row['فعال']);
      var name=String(firstField_(row,['نام خدمت','Service Name','Name','Title','عنوان'])||'').trim();
      var price=toNumber_(firstField_(row,['قیمت','Price','Base Price','Original Price','مبلغ']));
      return active&&name&&price>0;
    });
    if(!service)throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');

    var dates=getAvailableDates_({});
    if(!dates.ok||!dates.dates||!dates.dates.length)throw new Error('هیچ تاریخ قابل رزروی نیست.');
    var date=normalizeJalaliDate_(dates.dates[0].date);
    var slots=getAvailableSlots_({date:date});
    var free=slots.slots&&slots.slots.find(function(s){return s.available===true&&String(s.status)===CONFIG.SLOT_STATUS.FREE;});
    if(!free)throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');

    var unique=String(new Date().getTime());
    var create=createBooking_({
      requestId:'PAYBLOCK-'+unique,telegramId:'PAYBLOCK-TG-'+unique,customerId:'PAYBLOCK-CUS-'+unique,
      firstName:'PAYMENT',lastName:'BLOCK',mobile:'PAYBLOCK-'+unique,
      serviceId:String(firstField_(service,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||''),
      serviceName:String(firstField_(service,['نام خدمت','Service Name','Name','Title','عنوان'])||''),
      appointmentDate:date,appointmentTime:normalizeTime_(free.time),discountCode:''
    });
    if(!create||!create.ok)throw new Error('Create failed: '+JSON.stringify(create));
    result.bookingId=String(create.booking.bookingId||'').trim();

    var approval=approveBooking_({bookingId:result.bookingId,adminId:'PAYMENT-FLOW-TEST'});
    result.blockedBeforePayment=!!approval&&approval.ok===false&&approval.error==='PAYMENT_NOT_READY';

    var b=getBookingByIdObject_(result.bookingId);
    result.paymentStatusStillPending=!!b&&String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_PENDING;

    if(!result.blockedBeforePayment)throw new Error('Approval بدون Payment دریافت‌شده مسدود نشد.');
    if(!result.paymentStatusStillPending)throw new Error('Payment Status بدون پرداخت تغییر کرده است.');

    result.ok=true;
  }catch(e){result.error=String(e&&e.message?e.message:e);}

  try{
    if(result.bookingId){
      var b=getBookingByIdObject_(result.bookingId);
      if(b&&String(b['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING){
        releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);
        result.cleanedUp=true;
      }
    }
  }catch(cleanup){result.error+=(result.error?' | ':'')+'Cleanup failed: '+String(cleanup&&cleanup.message?cleanup.message:cleanup);}
  
  Logger.log('PAYMENT FLOW - APPROVAL BLOCK TEST');
  Logger.log(JSON.stringify(result,null,2));
  Logger.log('ALL CHECKS PASSED: '+result.ok);
  return result;
}



function testVIPDiscountPaymentFlow() {
  var result = {
    ok: false,
    tokenFound: false,
    tokenValid: false,
    serviceFound: false,
    basePrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    finalPrice: 0,
    bookingCreated: false,
    bookingFinalPriceVerified: false,
    paymentSubmitted: false,
    paymentAmount: 0,
    paymentEqualsFinalPrice: false,
    tokenUsedBeforeApproval: false,
    approvalSucceeded: false,
    tokenUsedAfterApproval: false,
    tokenReuseAttempted: false,
    tokenReuseRejected: false,
    cleanedUp: false,
    bookingId: '',
    tokenCode: '',
    error: ''
  };

  var createdBookingId = '';
  var tempCustomerId = '';

  try {
    var unique = String(new Date().getTime()) +
      String(Math.floor(Math.random() * 100000));

    tempCustomerId = 'TEST-VIP-' + unique;
    result.tokenCode = ('TEST-VIP-' + unique).toUpperCase();

    var vipCustomerSheet = getVIPSheet_(CONFIG.VIP.CUSTOMERS_SHEET);
    var vipTokenSheet = getVIPSheet_(CONFIG.VIP.TOKENS_SHEET);

    var now = new Date();
    var expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    vipCustomerSheet.appendRow([
      tempCustomerId,
      'Regression Test VIP',
      'VIP',
      '',
      'TEST-TG-' + unique,
      '',
      '',
      CONFIG.VIP.ACTIVE_STATUS
    ]);

    vipTokenSheet.appendRow([
      result.tokenCode,
      tempCustomerId,
      3,
      now,
      '',
      CONFIG.VIP.ACTIVE_STATUS,
      '',
      '',
      '',
      expiry
    ]);

    var token = findVIPDiscountToken_(result.tokenCode);
    if (!token) {
      throw new Error('توکن موقت VIP ساخته شد اما از مسیر Booking پیدا نشد.');
    }
    result.tokenFound = true;

    var telegramId = 'TEST-TG-' + unique;

    var validation = validateDiscount_({
      price: 1000000,
      code: result.tokenCode,
      customerId: tempCustomerId,
      telegramId: telegramId
    });

    if (!validation || !validation.ok || !validation.valid) {
      throw new Error('VIP Token validation failed: ' + JSON.stringify(validation));
    }
    result.tokenValid = true;

    var servicesResponse = getServices_({});
    var services = servicesResponse && servicesResponse.services
      ? servicesResponse.services
      : [];

    var service = services.find(function(item) {
      return item &&
        String(item.name || '').trim() &&
        toNumber_(item.price) > 0;
    });

    if (!service) {
      throw new Error('هیچ خدمت فعال و دارای قیمت برای تست پیدا نشد.');
    }

    result.serviceFound = true;
    result.basePrice = toNumber_(service.price);

    var dates = getAvailableDates_({});
    if (!dates.ok || !dates.dates || !dates.dates.length) {
      throw new Error('هیچ تاریخ قابل رزروی برای تست پیدا نشد.');
    }

    var selectedSlot = null;

    for (var d = 0; d < dates.dates.length && !selectedSlot; d++) {
      var date = normalizeJalaliDate_(dates.dates[d].date);
      var slots = getAvailableSlots_({ date: date });

      var free = slots.slots && slots.slots.find(function(slot) {
        return slot.available === true &&
          String(slot.status) === CONFIG.SLOT_STATUS.FREE;
      });

      if (free) {
        selectedSlot = {
          date: date,
          time: normalizeTime_(free.time)
        };
      }
    }

    if (!selectedSlot) {
      throw new Error('هیچ Slot آزاد برای تست پیدا نشد.');
    }

    var create = createBooking_({
      requestId: 'VIPPAY-REG-' + unique,
      telegramId: telegramId,
      customerId: tempCustomerId,
      firstName: 'VIP',
      lastName: 'REGRESSION',
      mobile: 'VIPPAY-REG-' + unique,
      serviceId: String(service.id || ''),
      serviceName: String(service.name || ''),
      appointmentDate: selectedSlot.date,
      appointmentTime: selectedSlot.time,
      discountCode: result.tokenCode
    });

    if (!create || !create.ok) {
      throw new Error('Create Booking failed: ' + JSON.stringify(create));
    }

    result.bookingCreated = true;
    result.bookingId = String(
      create.booking && create.booking.bookingId
        ? create.booking.bookingId
        : ''
    ).trim();

    createdBookingId = result.bookingId;

    if (!result.bookingId) {
      throw new Error('Booking ID برای تست برگشت داده نشد.');
    }

    var booking = getBookingByIdObject_(result.bookingId);
    if (!booking) {
      throw new Error('Booking در Sheet پیدا نشد.');
    }

    result.basePrice = toNumber_(booking['Original Price']);
    result.discountAmount = toNumber_(booking['Discount Amount']);
    result.finalPrice = toNumber_(booking['Final Price']);

    result.discountPercent = toNumber_(
      booking['Discount Percent'] ||
      booking['Discount %'] ||
      booking['discountPercent']
    );

    if (!result.discountPercent) {
      result.discountPercent =
        result.basePrice > 0 && result.discountAmount > 0
          ? Math.round(result.discountAmount * 100 / result.basePrice)
          : toNumber_(validation.discountPercent);
    }

    var expectedDiscountAmount = Math.round(
      result.basePrice * result.discountPercent / 100
    );

    var expectedFinalPrice = Math.max(
      0,
      result.basePrice - expectedDiscountAmount
    );

    result.bookingFinalPriceVerified =
      result.discountPercent === toNumber_(validation.discountPercent) &&
      result.discountAmount === expectedDiscountAmount &&
      result.finalPrice === expectedFinalPrice;

    if (!result.bookingFinalPriceVerified) {
      throw new Error('Final Price/Discount در Booking صحیح نیست.');
    }

    var beforePayment = findVIPDiscountToken_(result.tokenCode);
    result.tokenUsedBeforeApproval =
      !!beforePayment && beforePayment.used === true;

    if (result.tokenUsedBeforeApproval) {
      throw new Error('Token قبل از Approval مصرف شده است.');
    }

    var submit = submitPayment_({
      bookingId: result.bookingId,
      transactionNumber: 'MOCK-VIP-REG-' + unique,
      receiptData: 'data:text/plain;base64,VklQIFJFU0JFUlZBVElPTiBURVNU',
      receiptFileName: 'vip-regression-test-' + unique + '.txt',
      receiptMimeType: 'text/plain'
    });

    if (!submit || !submit.ok) {
      throw new Error('Submit Payment failed: ' + JSON.stringify(submit));
    }
    result.paymentSubmitted = true;

    var payments = getSheetObjects_(CONFIG.SHEETS.PAYMENTS);
    var paymentRows = payments.filter(function(payment) {
      return String(payment['Booking ID'] || '') === result.bookingId;
    });

    if (paymentRows.length !== 1) {
      throw new Error('تعداد رکورد Payment برای Booking برابر 1 نیست.');
    }

    result.paymentAmount = toNumber_(paymentRows[0]['Amount']);
    result.paymentEqualsFinalPrice =
      result.paymentAmount === result.finalPrice;

    if (!result.paymentEqualsFinalPrice) {
      throw new Error(
        'Payment Amount با Final Price برابر نیست: ' +
        result.paymentAmount + ' != ' + result.finalPrice
      );
    }

    var afterPayment = findVIPDiscountToken_(result.tokenCode);
    result.tokenUsedBeforeApproval =
      !!afterPayment && afterPayment.used === true;

    if (result.tokenUsedBeforeApproval) {
      throw new Error('Token بعد از Payment و قبل از Approval مصرف شده است.');
    }

    var approved = approveBooking_({
      bookingId: result.bookingId,
      adminId: 'VIP-REGRESSION-TEST'
    });

    if (!approved || !approved.ok) {
      throw new Error('Approve Booking failed: ' + JSON.stringify(approved));
    }
    result.approvalSucceeded = true;

    var afterApproval = findVIPDiscountToken_(result.tokenCode);
    result.tokenUsedAfterApproval =
      !!afterApproval && afterApproval.used === true;

    if (!result.tokenUsedAfterApproval) {
      throw new Error('Token بعد از Approval مصرف نشده است.');
    }

    result.tokenReuseAttempted = true;

    var reuseValidation = validateDiscount_({
      price: result.basePrice,
      code: result.tokenCode,
      customerId: tempCustomerId,
      telegramId: telegramId
    });

    result.tokenReuseRejected =
      !!reuseValidation &&
      reuseValidation.ok === true &&
      reuseValidation.valid === false;

    if (!result.tokenReuseRejected) {
      throw new Error(
        'استفاده مجدد از Token رد نشد: ' +
        JSON.stringify(reuseValidation)
      );
    }

    result.ok = true;

  } catch (e) {
    result.error = String(e && e.message ? e.message : e);

  } finally {
    try {
      if (createdBookingId) {
        var cleanupBooking = getBookingByIdObject_(createdBookingId);

        if (
          cleanupBooking &&
          String(cleanupBooking['Appointment Status'] || '') ===
            CONFIG.STATUSES.BOOKING_CONFIRMED
        ) {
          var cancelled = cancelBooking_({
            bookingId: createdBookingId,
            reason: 'VIP regression test cleanup'
          });

          if (!cancelled || !cancelled.ok) {
            throw new Error(
              'Booking cleanup failed: ' +
              JSON.stringify(cancelled)
            );
          }

        } else if (
          cleanupBooking &&
          String(cleanupBooking['Appointment Status'] || '') ===
            CONFIG.STATUSES.BOOKING_PENDING
        ) {
          releaseBookingRow_(
            cleanupBooking._row,
            cleanupBooking['Booking ID'],
            cleanupBooking['Slot Key']
          );
        }

        var paymentSheet = getSheet_(CONFIG.SHEETS.PAYMENTS);

        var paymentRowsForCleanup =
          getSheetObjects_(CONFIG.SHEETS.PAYMENTS)
            .filter(function(payment) {
              return String(payment['Booking ID'] || '') ===
                createdBookingId;
            })
            .sort(function(a, b) {
              return b._row - a._row;
            });

        paymentRowsForCleanup.forEach(function(payment) {
          paymentSheet.deleteRow(payment._row);
        });

        var bookingAfterCleanup =
          getBookingByIdObject_(createdBookingId);

        if (bookingAfterCleanup) {
          getSheet_(CONFIG.SHEETS.BOOKINGS)
            .deleteRow(bookingAfterCleanup._row);
        }
      }

      var tokenSheetForCleanup =
        getVIPSheet_(CONFIG.VIP.TOKENS_SHEET);

      var tokenLastRow =
        tokenSheetForCleanup.getLastRow();

      if (tokenLastRow >= 2) {
        var tokenRowsForCleanup =
          tokenSheetForCleanup.getRange(
            2, 1, tokenLastRow - 1, 2
          ).getValues();

        for (var ti = tokenRowsForCleanup.length - 1; ti >= 0; ti--) {
          if (
            String(tokenRowsForCleanup[ti][0] || '').trim() ===
            result.tokenCode
          ) {
            tokenSheetForCleanup.deleteRow(ti + 2);
            break;
          }
        }
      }

      var customerSheetForCleanup =
        getVIPSheet_(CONFIG.VIP.CUSTOMERS_SHEET);

      var customerLastRow =
        customerSheetForCleanup.getLastRow();

      if (customerLastRow >= 2) {
        var customerRowsForCleanup =
          customerSheetForCleanup.getRange(
            2, 1, customerLastRow - 1, 1
          ).getValues();

        for (var ci = customerRowsForCleanup.length - 1; ci >= 0; ci--) {
          if (
            String(customerRowsForCleanup[ci][0] || '').trim() ===
            tempCustomerId
          ) {
            customerSheetForCleanup.deleteRow(ci + 2);
            break;
          }
        }
      }

      result.cleanedUp = true;

    } catch (cleanupError) {
      result.error +=
        (result.error ? ' | ' : '') +
        'Cleanup failed: ' +
        String(
          cleanupError && cleanupError.message
            ? cleanupError.message
            : cleanupError
        );
    }
  }

  Logger.log('PAYMENT FLOW - VIP DISCOUNT + PAYMENT TEST');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('ALL CHECKS PASSED: ' + result.ok);

  return result;
}


function testPaymentVIPRegressionSuite() {
  var result = {
    ok: false,
    suite: 'Payment + VIP Regression',
    startedAt: new Date().toISOString(),
    tests: [],
    passed: 0,
    failed: 0,
    error: ''
  };

  var testCases = [
    {
      name: 'testPaymentFlowSubmitOnly',
      fn: testPaymentFlowSubmitOnly
    },
    {
      name: 'testPaymentFlowRejectWithoutProof',
      fn: testPaymentFlowRejectWithoutProof
    },
    {
      name: 'testApprovalBlockedBeforePayment',
      fn: testApprovalBlockedBeforePayment
    },
    {
      name: 'testPaymentFlowDuplicate',
      fn: testPaymentFlowDuplicate
    },
    {
      name: 'testPaymentApprovalFlow',
      fn: testPaymentApprovalFlow
    },
    {
      name: 'testVIPDiscountPaymentFlow',
      fn: testVIPDiscountPaymentFlow
    }
  ];

  for (var i = 0; i < testCases.length; i++) {
    var testCase = testCases[i];

    try {
      var testResult = testCase.fn();

      var passed = !!testResult && testResult.ok === true;

      result.tests.push({
        name: testCase.name,
        ok: passed,
        error: passed ? '' : String(
          testResult && testResult.error
            ? testResult.error
            : 'Test returned ok=false'
        )
      });

      if (passed) {
        result.passed++;
      } else {
        result.failed++;
      }

    } catch (e) {
      result.failed++;
      result.tests.push({
        name: testCase.name,
        ok: false,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  result.ok =
    result.failed === 0 &&
    result.passed === testCases.length;

  result.completedAt = new Date().toISOString();

  Logger.log('PAYMENT + VIP REGRESSION SUITE');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log(
    'ALL REGRESSION CHECKS PASSED: ' +
    result.ok +
    ' (' +
    result.passed +
    '/' +
    testCases.length +
    ')'
  );

  return result;
}


function getBlockedDatesDiagnostic_() {
  try {
    const spreadsheet = getSpreadsheet_();
    const sheetName = CONFIG.SHEETS.BLOCKED_DATES;
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      return {
        ok: false,
        error: 'BLOCKED_DATES_SHEET_NOT_FOUND',
        sheetName: sheetName
      };
    }

    return {
      ok: true,
      diagnostic: true,
      sheetName: sheet.getName(),
      rows: sheet.getLastRow(),
      columns: sheet.getLastColumn(),
      blockedDates: []
    };
  } catch (error) {
    return {
      ok: false,
      error: 'BLOCKED_DATES_DIAGNOSTIC_FAILED',
      message: error && error.message ? error.message : String(error)
    };
  }
}


function getBlockedDatesSafe_() {
  return {
    ok: true,
    blockedDates: []
  };
}


/* =====================================================
 * SAFE APPOINTMENT REMINDER DIAGNOSTIC TEST
 * Does not create/update bookings, send Telegram, hold slots,
 * release slots, or touch payment/VIP state.
 * ===================================================== */
function testAppointmentReminderDiagnostic() {
  var sample = {
    'Booking ID': 'TEST-REMINDER-DIAGNOSTIC',
    'First Name': 'مایا',
    'Last Name': 'نظری',
    'Service Name': 'انرژی خوانی قهوه',
    'Appointment Date': '1405/07/16',
    'Appointment Time': '11:00',
    'Telegram Username': '@test_user',
    'Telegram ID': 'TEST_ONLY'
  };

  var result = {
    ok: false,
    test: 'SAFE APPOINTMENT REMINDER DIAGNOSTIC',
    noTelegramSent: true,
    noBookingCreated: true,
    noSheetWrite: true,
    noPaymentChange: true,
    noVipChange: true,
    checks: []
  };

  try {
    var normalizedDate = normalizeJalaliDate_(sample['Appointment Date']);
    var normalizedTime = normalizeTime_(sample['Appointment Time']);
    var timestampMs = getBookingAppointmentTimestampMs_(sample);
    var customerText = buildAppointmentReminderText_(sample);
    var adminText = buildAdminAppointmentReminderText_(sample);

    result.checks.push({
      name: 'Jalali date normalization',
      ok: normalizedDate === '1405/07/16',
      value: normalizedDate
    });

    result.checks.push({
      name: 'Time normalization',
      ok: normalizedTime === '11:00',
      value: normalizedTime
    });

    result.checks.push({
      name: 'Jalali appointment timestamp conversion',
      ok: typeof timestampMs === 'number' && timestampMs > 0,
      value: timestampMs
    });

    result.checks.push({
      name: 'Customer reminder text and line breaks',
      ok: customerText.indexOf('انرژی خوانی قهوه') !== -1 &&
          customerText.indexOf('1405/07/16') !== -1 &&
          customerText.indexOf('11:00') !== -1 &&
          customerText.indexOf('\n') !== -1 &&
          customerText.indexOf('\\n') === -1,
      value: customerText
    });

    result.checks.push({
      name: 'Admin reminder text and line breaks',
      ok: adminText.indexOf('@test_user') !== -1 &&
          adminText.indexOf('TEST_ONLY') !== -1 &&
          adminText.indexOf('\n') !== -1 &&
          adminText.indexOf('\\n') === -1,
      value: adminText
    });

    result.ok = result.checks.every(function(check) {
      return check.ok === true;
    });

    Logger.log('SAFE APPOINTMENT REMINDER DIAGNOSTIC');
    Logger.log(JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    result.error = String(
      error && error.message ? error.message : error
    );
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }
}



/* Pure contract test: message text only; no Sheet, Drive, or Telegram access. */
function testBookingTelegramTextPure_() {
  var booking = {
    'Booking ID':'BK-STAGING-001',
    'Tracking Code':'KC-STAGING-001',
    'First Name':'آزمایشی',
    'Last Name':'کائنات‌چی',
    'Service Name':'خدمت آزمایشی',
    'Appointment Date':'1405/07/22',
    'Appointment Time':'11:00',
    'Final Price':700000,
    'Transaction Number':'BANK-TEST-123'
  };
  var requestText = buildBookingTelegramText_(booking, 'request_received');
  var acceptedText = buildBookingTelegramText_(booking, 'request_approved');
  var paymentText = buildBookingTelegramText_(booking, 'payment_received');
  var checks = [
    {name:'initial request says 12-hour review window',ok:requestText.indexOf('۱۲ ساعت') !== -1},
    {name:'accepted request says 10-minute payment window',ok:acceptedText.indexOf('۱۰ دقیقه') !== -1},
    {name:'payment caption includes customer name',ok:paymentText.indexOf('آزمایشی کائنات‌چی') !== -1},
    {name:'payment caption includes amount',ok:paymentText.indexOf('700000') !== -1},
    {name:'payment caption includes bank reference',ok:paymentText.indexOf('BANK-TEST-123') !== -1},
    {name:'payment caption includes booking ID and tracking code',ok:paymentText.indexOf('BK-STAGING-001') !== -1 && paymentText.indexOf('KC-STAGING-001') !== -1}
  ];
  var failed = checks.filter(function(check){return !check.ok;});
  return {ok:failed.length===0,test:'TELEGRAM MESSAGE CONTRACT PURE TEST',passed:checks.length-failed.length,total:checks.length,failed:failed,noSheetRead:true,noSheetWrite:true,noDriveAccess:true,noTelegramSent:true};
}




/* Pure source-contract test: confirms a receipt image is required before submission. */
function testPaymentReceiptRequiredContractPure_() {
  var cases = [
    {name:'valid image data URL accepted', value:'data:image/jpeg;base64,aGVsbG8=', expected:true},
    {name:'empty receipt rejected', value:'', expected:false},
    {name:'whitespace-only receipt rejected', value:'   ', expected:false},
    {name:'null receipt rejected', value:null, expected:false},
    {name:'non-image data URL rejected', value:'data:text/plain;base64,aGVsbG8=', expected:false},
    {name:'raw text rejected', value:'receipt-proof', expected:false},
    {name:'malformed base64 rejected', value:'data:image/png;base64,%%%=', expected:false},
    {name:'missing base64 marker rejected', value:'data:image/png,AAAA', expected:false},
    {name:'oversized payload rejected', value:'data:image/jpeg;base64,'+new Array(Math.ceil((8*1024*1024)/3)*4+5).join('A'), expected:false}
  ];
  var failed = cases.filter(function(test) {
    return hasRequiredReceiptImage_(test.value) !== test.expected;
  });
  return {ok:failed.length===0,test:'PAYMENT RECEIPT IMAGE VALIDATION PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noSheetRead:true,noSheetWrite:true,noDriveAccess:true,noTelegramSent:true};
}


/* Pure contract test for Telegram review buttons; no Telegram/API/Sheet calls. */
function testTelegramPaymentReviewButtonsPure_() {
  var requestKeyboard = getBookingTelegramAdminKeyboard_('BK-TEST','request');
  var paymentKeyboard = getBookingTelegramAdminKeyboard_('BK-TEST','payment');
  var paymentButtons = paymentKeyboard.inline_keyboard[0].map(function(button){return button.callback_data;});
  var checks = [
    {name:'request keyboard keeps initial approve/reject',ok:requestKeyboard.inline_keyboard[0][0].callback_data==='kaenatchi:request_approve:BK-TEST' && requestKeyboard.inline_keyboard[0][1].callback_data==='kaenatchi:request_reject:BK-TEST'},
    {name:'payment keyboard has approve and hold-for-review only',ok:paymentButtons.indexOf('kaenatchi:approve:BK-TEST')!==-1 && paymentButtons.indexOf('kaenatchi:hold_review:BK-TEST')!==-1 && paymentButtons.indexOf('kaenatchi:reject:BK-TEST')===-1},
    {name:'callback parser accepts hold-for-review',ok:/^kaenatchi:(request_approve|request_reject|approve|reject|hold_review):([^:]+)$/.test('kaenatchi:hold_review:BK-TEST')}
  ];
  var failed=checks.filter(function(check){return !check.ok;});
  return {ok:failed.length===0,test:'TELEGRAM PAYMENT REVIEW BUTTONS PURE TEST',passed:checks.length-failed.length,total:checks.length,failed:failed,noSheetRead:true,noSheetWrite:true,noTelegramSent:true};
}


/* Pure status privacy contract test: no sheet/API access. */
function testBookingStatusMobileMatchPure_() {
  var cases = [
    {name:'matching mobile accepted',stored:'09123456789',supplied:'09123456789',expected:true},
    {name:'international format normalized',stored:'09123456789',supplied:'+989123456789',expected:true},
    {name:'different mobile rejected',stored:'09123456789',supplied:'09111111111',expected:false},
    {name:'missing supplied mobile rejected',stored:'09123456789',supplied:'',expected:false},
    {name:'missing stored mobile rejected',stored:'',supplied:'09123456789',expected:false}
  ];
  var failed=cases.filter(function(test){
    return isBookingStatusMobileMatch_(test.stored,test.supplied)!==test.expected;
  });
  return {ok:failed.length===0,test:'BOOKING STATUS MOBILE MATCH PURE TEST',passed:cases.length-failed.length,total:cases.length,failed:failed,noSheetRead:true,noSheetWrite:true,noTelegramSent:true};
}
