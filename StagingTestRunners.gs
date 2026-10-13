/**
 * KaenatChi Booking — staging test runners.
 *
 * Attach this file to the STAGING Apps Script project only.
 * The pure runner below is in-memory only.
 * The integration runner writes a temporary booking to the dedicated staging
 * spreadsheet and attempts cleanup. Never run it against production.
 */

function runBookingStagingPureTests_() {
  var names = [
    'testPaymentReviewKeyboardPure_',
    'testTelegramQueueStorageLimitPure_',
    'testTelegramQueueRecoveryMergePure_',
    'testTelegramRetrySchedulePure_',
    'testTelegramRetryPolicyPure_',
    'testTelegramNotificationRetryPolicyPure_',
    'testTelegramDeliveryResultGuardPure_',
    'testPaymentSubmissionConsistencyClassificationPure_',
    'testPaymentConsistencyRecoveryPlanPure_',
    'testPaymentConsistencyDiagnosticReportPure_',
    'testPaymentSubmissionPreflightPure_',
    'testPaymentRecordApprovalGuardPure_',
    'testPaymentRejectionGuardPure_',
    'testExpiredHoldReleaseGuardPure_',
    'testBookingTelegramTextPure_',
    'testPaymentReceiptRequiredContractPure_',
    'testTelegramPaymentReviewButtonsPure_',
    'testBookingStatusMobileMatchPure_'
  ];
  var results = [];
  var failures = [];
  names.forEach(function(name) {
    try {
      if (typeof this[name] !== 'function') throw new Error('Test function not found');
      var r = this[name]();
      var item = {test:name,ok:!!(r && r.ok===true),result:r||null};
      results.push(item);
      if (!item.ok) failures.push(item);
    } catch (e) {
      var item = {test:name,ok:false,error:String(e && e.message || e)};
      results.push(item);
      failures.push(item);
    }
  }, this);
  var report = {
    suite:'BOOKING STAGING PURE TESTS',
    ok:failures.length===0,
    passed:results.length-failures.length,
    total:results.length,
    results:results,
    failures:failures,
    sideEffects:{sheetRead:false,sheetWrite:false,vip:false,drive:false,telegram:false,deployment:false}
  };
  Logger.log(JSON.stringify(report,null,2));
  return report;
}

/**
 * Integration test: creates one synthetic request on STAGING, verifies that
 * payment is blocked before initial acceptance, then attempts cleanup.
 * Requires staging tabs plus at least one active priced service and one free slot.
 */
function runBookingStagingInitialAcceptanceGateTest_() {
  if (typeof CONFIG === 'undefined' || CONFIG.STAGING_MODE !== true) {
    throw new Error('STOP: CONFIG.STAGING_MODE must be true.');
  }
  assertStagingSpreadsheetIsolation_();
  var result = testPaymentBlockedUntilInitialRequestAccepted_();
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
