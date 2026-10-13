/**
 * KaenatChi Booking — safe staging preflight runner.
 *
 * IMPORTANT:
 * - Run only in the Apps Script project whose Code.gs is configured with
 *   STAGING_MODE: true and the dedicated Booking Staging spreadsheet ID.
 * - This file invokes only pure in-memory tests. It does not read/write Sheets,
 *   open VIP data, use Drive, send Telegram messages, or deploy anything.
 * - Do not run legacy testVIPDiscountPaymentFlow or testPaymentVIPRegressionSuite
 *   while staging isolation is enabled.
 */
function runBookingStagingPreflightTests_() {
  var tests = [
    ['testPaymentSubmissionConsistencyClassificationPure_', testPaymentSubmissionConsistencyClassificationPure_],
    ['testPaymentConsistencyRecoveryPlanPure_', testPaymentConsistencyRecoveryPlanPure_],
    ['testPaymentConsistencyDiagnosticReportPure_', testPaymentConsistencyDiagnosticReportPure_],
    ['testPaymentSubmissionPreflightPure_', testPaymentSubmissionPreflightPure_],
    ['testPaymentRecordApprovalGuardPure_', testPaymentRecordApprovalGuardPure_],
    ['testBookingTelegramTextPure_', testBookingTelegramTextPure_],
    ['testPaymentReceiptRequiredContractPure_', testPaymentReceiptRequiredContractPure_],
    ['testTelegramPaymentReviewButtonsPure_', testTelegramPaymentReviewButtonsPure_],
    ['testBookingStatusMobileMatchPure_', testBookingStatusMobileMatchPure_]
  ];
  var results = [];
  var failures = [];
  tests.forEach(function(entry) {
    try {
      var result = entry[1]();
      var ok = !!(result && result.ok === true);
      var item = {
        test: entry[0],
        ok: ok,
        passed: result && result.passed !== undefined ? result.passed : null,
        total: result && result.total !== undefined ? result.total : null,
        failed: result && result.failed ? result.failed : []
      };
      results.push(item);
      if (!ok) failures.push(item);
    } catch (error) {
      var item = {test: entry[0], ok: false, error: String(error && error.message || error)};
      results.push(item);
      failures.push(item);
    }
  });
  return {
    ok: failures.length === 0,
    suite: 'BOOKING STAGING PURE PREFLIGHT',
    passed: results.length - failures.length,
    total: results.length,
    results: results,
    failures: failures,
    guarantees: {
      noSheetRead: true,
      noSheetWrite: true,
      noVIPAccess: true,
      noDriveAccess: true,
      noTelegramSent: true,
      noDeployment: true
    }
  };
}
