/*******************************************************
 * KaenatChi Booking Backend v2
 * Core Backend - Phase 1
 *
 * Connected Spreadsheet:
 * KaenatChi CMS
 *
 * IMPORTANT:
 * - Do not deploy yet.
 * - Do not connect Telegram yet.
 * - Do not modify the old booking backend.
 *******************************************************/

const CONFIG = {
  SPREADSHEET_ID: '1cf6SFL80xJ8YrBPlr_Fp9TYhkKGkhu2U45D2WTSyNz0',

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
    SPREADSHEET_ID: '1TpljGwyRpHcxyyR6Zm1mbT2CPJBvFeHCvD3QH34BuGs',
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
  try {
    const request = (e && e.parameter) ? e.parameter : {};
    const action = String(request.action || '').trim();
    const callback = String(request.callback || '').trim();
    const respond = function(data) {
      if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
        return jsonpResponse_(callback, data);
      }
      return jsonResponse_(data);
    };

    if (action === 'getConfig') {
      return respond(getConfig_());
    }

    if (action === 'getBookedSlots') {
      return respond(getBookedSlots_());
    }

    if (action === 'bookingStatus') {
      return respond(getBookingStatusByRequestId_(request));
    }

    if (action) {
      return jsonResponse_(routeRequest_(action, request));
    }

    return jsonResponse_({
      ok: true,
      service: 'KaenatChi Booking Backend v2',
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      error: 'SERVER_ERROR',
      message: error && error.message ? error.message : 'خطای داخلی سرور.'
    });
  }
}


function doPost(e) {
  try {
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
      return getBlockedDates_();

    case 'getBlockedSlots':
      return getBlockedSlots_();

    case 'getAvailableDates':
      return getAvailableDates_(request);

    case 'getAvailableSlots':
      return getAvailableSlots_(request);

    case 'getBooking':
      return getBooking_(request);

    case 'getServices': return getServices_(request);
    case 'validateDiscount': return validateDiscount_(request);
    case 'createBooking': return createBooking_(request);
    case 'submitPayment': return submitPayment_(request);
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
  const blockedDates = getBlockedDates_();
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

    if (
      status === CONFIG.STATUSES.BOOKING_PENDING ||
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

  const rows = getSheetObjects_(CONFIG.SHEETS.BOOKINGS);

  const booking = rows.find(function(row) {
    return String(row['Request ID'] || '').trim() === requestId;
  });

  if (!booking) {
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

  const rows = getSheetObjects_(
    CONFIG.SHEETS.BLOCKED_DATES
  );

  const result = [];

  rows.forEach(function(row) {

    if (!row.Date) {
      return;
    }

    result.push({
      date: normalizeJalaliDate_(row.Date),
      active: isTruthy_(row.Active),
      reason: row.Reason
        ? String(row.Reason)
        : ''
    });

  });

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
   * Booking dates are Jalali.
   * We therefore iterate the Jalali calendar directly instead
   * of adding Gregorian days and converting back.
   *
   * This prevents timezone and weekday drift.
   */
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

    if (isDateAvailable_(jalali)) {

      dates.push({
        date: jalali,
        dayOfWeek: getPersianDayNameFromJalali_(jalali),
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

  const date =
    normalizeJalaliDate_(request.date);

  if (!date) {
    return {
      ok: false,
      error: 'DATE_REQUIRED',
      message: 'تاریخ الزامی است.'
    };
  }

  const schedule =
    getScheduleForDate_(date);

  if (!schedule.active) {

    return {
      ok: true,
      date: date,
      slots: []
    };
  }

  const slots = [];

  schedule.ranges.forEach(function(range) {

    const generatedSlots =
      generateSlots_(
        range.startTime,
        range.endTime,
        range.slotDuration
      );

    generatedSlots.forEach(function(time) {

      const slotKey =
        buildSlotKey_(date, time);

      const status =
        getSlotStatus_(slotKey, date, time);

      slots.push({
        date: date,
        time: time,
        slotKey: slotKey,
        status: status,
        available:
          status === CONFIG.SLOT_STATUS.FREE
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
      telegramId:String(request.telegramId||''),customerId:String(request.customerId||''),
      firstName:String(request.firstName||'').trim(),lastName:String(request.lastName||'').trim(),
      mobile:String(request.mobile||request.phone||'').trim(),serviceId:String(service.id||request.serviceId||''),
      serviceName:String(service.name),appointmentDate:date,appointmentTime:time,slotKey:slotKey,
      originalPrice:basePrice,discountCode:discountCode,discountType:discountCode?'VIP':'',
      discountPercent:discount.discountPercent,discountAmount:discount.discountAmount,finalPrice:discount.finalPrice,
      paymentStatus:CONFIG.STATUSES.PAYMENT_PENDING,appointmentStatus:CONFIG.STATUSES.BOOKING_PENDING,
      trackingCode:generateTrackingCode_(),holdUntil:new Date(Date.now()+Math.max(5,toNumber_(getSetting_('Hold Minutes',15)))*60000)
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
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.BOOKING_CREATED,bookingId:booking.bookingId,slotKey:slotKey,details:'Booking created.'});
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.SLOT_HELD,bookingId:booking.bookingId,slotKey:slotKey,details:'Slot held.'});
    return {ok:true,booking:publicBooking_(booking),message:'نوبت موقتاً نگه داشته شد. پرداخت را ثبت کنید.'};
  });
}

function submitPayment_(request){
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    if(String(b['Appointment Status']||'')!==CONFIG.STATUSES.BOOKING_PENDING)return fail_('BOOKING_NOT_PENDING','این نوبت در وضعیت قابل پرداخت نیست.');
    if(String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED||String(b['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_APPROVED){
      return fail_('PAYMENT_ALREADY_SUBMITTED','برای این نوبت قبلاً پرداخت ارسال شده است.');
    }
    var hold=parseDateValue_(b['Hold Until']);
    if(!hold||hold.getTime()<=Date.now()){releaseBookingRow_(b._row,b['Booking ID'],b['Slot Key']);return fail_('HOLD_EXPIRED','مهلت این نوبت تمام شده است.');}
    var transaction=String(request.transactionNumber||request.paymentTrackingCode||request.paymentCode||'').trim();
    var receipt=String(request.receiptData||request.receiptBase64||'').trim();
    if(!receipt&&!transaction)return fail_('PAYMENT_PROOF_REQUIRED','تصویر فیش یا کد پیگیری پرداخت الزامی است.');
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
    return {ok:true,bookingId:b['Booking ID'],paymentStatus:CONFIG.STATUSES.PAYMENT_RECEIVED,message:'فیش دریافت شد و برای بررسی ارسال شد.'};
  });
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
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Payment Status':CONFIG.STATUSES.PAYMENT_APPROVED,'Appointment Status':CONFIG.STATUSES.BOOKING_CONFIRMED,
      'Approved At':new Date(),'Approved By':String(request.adminId||request.admin||'admin'),'Hold Until':''
    });

    // Keep the financial record synchronized with the Booking record.
    // Approval must update the matching Payments row to PAYMENT_APPROVED.
    var paymentRows=getSheetObjects_(CONFIG.SHEETS.PAYMENTS);
    paymentRows.forEach(function(p){
      if(String(p['Booking ID']||'')===String(b['Booking ID']||'') &&
         String(p['Payment Status']||'')===CONFIG.STATUSES.PAYMENT_RECEIVED){
        updateRowFields_(CONFIG.SHEETS.PAYMENTS,p._row,{
          'Payment Status':CONFIG.STATUSES.PAYMENT_APPROVED,
          'Approved At':new Date(),
          'Approved By':String(request.adminId||request.admin||'admin')
        });
      }
    });

    consumeDiscountToken_(
      String(b['Discount Code']||''),
      String(b['Customer ID']||''),
      String(b['Telegram ID']||''),
      String(b['Tracking Code']||'')
    );
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.ADMIN_APPROVED,bookingId:b['Booking ID'],slotKey:slotKey,details:'Booking approved.'});
    return {ok:true,bookingId:b['Booking ID'],status:CONFIG.STATUSES.BOOKING_CONFIRMED,message:'نوبت تأیید شد.'};
  });
}

function rejectBooking_(request){
  return withBookingLock_(function(){
    var b=getBookingByIdObject_(request.bookingId||request.trackingCode);
    if(!b)return fail_('BOOKING_NOT_FOUND','نوبت پیدا نشد.');
    updateRowFields_(CONFIG.SHEETS.BOOKINGS,b._row,{
      'Appointment Status':CONFIG.STATUSES.BOOKING_REJECTED,'Payment Status':CONFIG.STATUSES.PAYMENT_REJECTED,
      'Rejected At':new Date(),'Rejected By':String(request.adminId||request.admin||'admin'),
      'Admin Note':String(request.note||request.reason||''),'Hold Until':''
    });
    appendBookingLog_({action:CONFIG.LOG_ACTIONS.ADMIN_REJECTED,bookingId:b['Booking ID'],slotKey:b['Slot Key'],details:String(request.note||request.reason||'')});
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

function releaseExpiredHolds_(request){
  return withBookingLock_(function(){
    var rows=getSheetObjects_(CONFIG.SHEETS.BOOKINGS),released=0,now=Date.now();
    rows.forEach(function(r){
      var hold=parseDateValue_(r['Hold Until']);
      if(String(r['Appointment Status']||'')===CONFIG.STATUSES.BOOKING_PENDING&&hold&&hold.getTime()<=now){
        updateRowFields_(CONFIG.SHEETS.BOOKINGS,r._row,{'Appointment Status':CONFIG.STATUSES.BOOKING_CANCELLED,'Hold Until':'','Admin Note':'Expired hold released.'});
        appendBookingLog_({action:CONFIG.LOG_ACTIONS.SLOT_RELEASED,bookingId:r['Booking ID'],slotKey:r['Slot Key'],details:'Expired hold released.'});
        released++;
      }
    });
    return {ok:true,released:released};
  });
}

function findServiceRecord_(serviceId,serviceName){
  var names=['Services','services'];
  for(var i=0;i<names.length;i++){
    if(!getSpreadsheet_().getSheetByName(names[i]))continue;
    var rows=getSheetObjects_(names[i]);
    var found=rows.find(function(r){
      var id=String(firstField_(r,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||'');
      var name=String(firstField_(r,['نام خدمت','Service Name','Name','Title','عنوان'])||'');
      return (serviceId&&id===serviceId)||(!serviceId&&serviceName&&name===serviceName);
    });
    if(found)return {
      id:String(firstField_(found,['Service ID','ServiceId','ID','Id','id','شناسه خدمت'])||serviceId||''),
      name:String(firstField_(found,['نام خدمت','Service Name','Name','Title','عنوان'])||serviceName||''),
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
  var v={'Customer ID':id,'Telegram ID':booking.telegramId,'Telegram Username':booking.telegramUsername||'','Telegram First Name':booking.firstName,'Telegram Last Name':booking.lastName,'Booking First Name':booking.firstName,'Booking Last Name':booking.lastName,'Mobile':booking.mobile,'Last Booking At':new Date()};
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
