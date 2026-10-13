/**
 * KaenatChi Booking — staging test runners.
 *
 * Attach this file to the STAGING Apps Script project only.
 * The pure runner below is in-memory only.
 * The integration runner writes a temporary booking to the dedicated staging
 * spreadsheet and attempts cleanup. Never run it against production.
 */

function runBookingStagingPureTests_() {
  var tests = [
    ['testPaymentReviewKeyboardPure_', testPaymentReviewKeyboardPure_],
    ['testTelegramQueueStorageLimitPure_', testTelegramQueueStorageLimitPure_],
    ['testTelegramQueueRecoveryMergePure_', testTelegramQueueRecoveryMergePure_],
    ['testTelegramRetrySchedulePure_', testTelegramRetrySchedulePure_],
    ['testTelegramRetryPolicyPure_', testTelegramRetryPolicyPure_],
    ['testTelegramNotificationRetryPolicyPure_', testTelegramNotificationRetryPolicyPure_],
    ['testTelegramDeliveryResultGuardPure_', testTelegramDeliveryResultGuardPure_],
    ['testPaymentSubmissionConsistencyClassificationPure_', testPaymentSubmissionConsistencyClassificationPure_],
    ['testPaymentConsistencyRecoveryPlanPure_', testPaymentConsistencyRecoveryPlanPure_],
    ['testPaymentConsistencyDiagnosticReportPure_', testPaymentConsistencyDiagnosticReportPure_],
    ['testPaymentSubmissionPreflightPure_', testPaymentSubmissionPreflightPure_],
    ['testPaymentRecordApprovalGuardPure_', testPaymentRecordApprovalGuardPure_],
    ['testPaymentRejectionGuardPure_', testPaymentRejectionGuardPure_],
    ['testExpiredHoldReleaseGuardPure_', testExpiredHoldReleaseGuardPure_],
    ['testBookingTelegramTextPure_', testBookingTelegramTextPure_],
    ['testPaymentReceiptRequiredContractPure_', testPaymentReceiptRequiredContractPure_],
    ['testTelegramPaymentReviewButtonsPure_', testTelegramPaymentReviewButtonsPure_],
    ['testBookingStatusMobileMatchPure_', testBookingStatusMobileMatchPure_]
  ];
  var results = [];
  var failures = [];
  tests.forEach(function(entry) {
    try {
      var r = entry[1]();
      var item = {test:entry[0],ok:!!(r && r.ok===true),result:r||null};
      results.push(item);
      if (!item.ok) failures.push(item);
    } catch (e) {
      var item = {test:entry[0],ok:false,error:String(e && e.message || e)};
      results.push(item);
      failures.push(item);
    }
  });
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
