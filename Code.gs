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
  return jsonResponse_({
    ok: true,
    service: 'KaenatChi Booking Backend v2',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
}


function doPost(e) {
  try {
    const request = parseRequest_(e);
    const action = request.action || '';

    if (!action) {
      return jsonResponse_({
        ok: false,
        error: 'ACTION_REQUIRED',
        message: 'عملیات مشخص نشده است.'
      });
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

    default:
      return {
        ok: false,
        error: 'UNKNOWN_ACTION',
        message: 'عملیات موردنظر شناخته نشد.'
      };
  }
}


/* =====================================================
   3. HEALTH CHECK
   ===================================================== */

function healthCheck() {

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

  const rows = getSheetObjects_(
    CONFIG.SHEETS.SCHEDULE
  );

  const schedule = [];

  rows.forEach(function(row) {

    if (!row.Day) {
      return;
    }

    schedule.push({
      day: String(row.Day).trim(),
      active: isTruthy_(row.Active),
      startTime: normalizeTime_(row['Start Time']),
      endTime: normalizeTime_(row['End Time']),
      slotDuration: Number(row['Slot Duration']) || 30
    });

  });

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

  const today = new Date();

  const dates = [];

  for (
    let offset = minAdvance;
    offset <= maxAdvance;
    offset++
  ) {

    const date = new Date(today);

    date.setDate(
      date.getDate() + offset
    );

    const jalali = gregorianToJalali_(date);

    if (isDateAvailable_(jalali)) {

      dates.push({
        date: jalali,
        dayOfWeek: getPersianDayName_(date),
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


  const dateObject =
    jalaliToApproxGregorian_(jalaliDate);

  const dayName =
    getPersianDayName_(dateObject);


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
          baseDay === dayName &&
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
 * This helper is only used to determine the weekday
 * for a Jalali date. The booking date itself remains
 * Jalali everywhere.
 */
function jalaliToApproxGregorian_(jalaliDate) {

  const parts =
    String(jalaliDate)
      .split('/');

  const jy = Number(parts[0]);
  const jm = Number(parts[1]);
  const jd = Number(parts[2]);

  const gy =
    jy + 621;

  const gregorian =
    new Date(
      gy,
      0,
      1
    );

  let days;

  if (jm <= 6) {
    days =
      (jm - 1) * 31 +
      (jd - 1);
  } else {
    days =
      186 +
      (jm - 7) * 30 +
      (jd - 1);
  }

  gregorian.setDate(
    gregorian.getDate() + days
  );

  return gregorian;
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
    'پنجشنبه',
    'جمعه',
    'شنبه'
  ];

  return days[
    date.getDay()
  ];
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
    const gregorian = jalaliToApproxGregorian_(date);
    const dayName = getPersianDayName_(gregorian);
    const schedule = getScheduleForDate_(date);

    console.log(JSON.stringify({
      jalali: date,
      calculatedDay: dayName,
      scheduleActive: schedule.active,
      ranges: schedule.ranges
    }, null, 2));
  });
}
