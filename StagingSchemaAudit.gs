/**
 * READ-ONLY staging schema audit.
 * This file deliberately does not create sheets, add headers, clear data,
 * migrate rows, or write to CMS/VIP. Run only from the isolated Staging script
 * after its STAGING_SPREADSHEET_ID property has been verified privately.
 */
function auditBookingStagingSchemaReadOnly() {
  const propertyName = 'STAGING_SPREADSHEET_ID';
  const id = String(PropertiesService.getScriptProperties().getProperty(propertyName) || '').trim();
  if (!id) {
    return {
      ok: false,
      readOnly: true,
      error: 'STAGING_ID_MISSING',
      message: 'Script Property STAGING_SPREADSHEET_ID is not configured.'
    };
  }

  const ss = SpreadsheetApp.openById(id);
  const expected = {
    Bookings: [
      'Request ID','Tracking Code','Appointment Code','Status','First Name','Last Name',
      'Phone','Appointment Date','Appointment Time','Service IDs','Service Names',
      'Subtotal','Discount Code','Discount Amount','Total','Created At',
      'Request Expires At','Payment Expires At','Receipt File ID','Receipt MIME Type',
      'Transaction Ref','Decision At','Decision By','Reschedule From',
      'Requested Reschedule Date','Requested Reschedule Time','Updated At'
    ],
    Payments: [
      'Payment ID','Request ID','Tracking Code','Amount','Transaction Ref',
      'Receipt File ID','Receipt MIME Type','Status','Submitted At','Reviewed At',
      'Reviewed By','Notes'
    ],
    BookingLogs: [
      'Event ID','Request ID','Event','From Status','To Status','Actor','At','Details'
    ]
  };

  const report = Object.keys(expected).map(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      return {sheet:name, exists:false, rowCount:0, headers:[], missingHeaders:expected[name], unexpectedHeaders:[]};
    }
    const width = sheet.getLastColumn();
    const headers = width > 0
      ? sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(v) { return String(v).trim(); })
      : [];
    return {
      sheet:name,
      exists:true,
      rowCount:Math.max(0, sheet.getLastRow() - 1),
      headers:headers,
      missingHeaders:expected[name].filter(function(h) { return headers.indexOf(h) < 0; }),
      unexpectedHeaders:headers.filter(function(h) { return h && expected[name].indexOf(h) < 0; })
    };
  });

  return {
    ok: report.every(function(item) { return item.exists && item.missingHeaders.length === 0; }),
    readOnly: true,
    spreadsheetName: ss.getName(),
    spreadsheetIdSuffix: id.slice(-4),
    sheets: report,
    writesPerformed: false,
    note: 'No sheets, headers, or cell values were changed. This is an audit only; it is not a migration.'
  };
}
