# KaenatChi Booking — Staging Environment Setup

## Current safety state

The branch staging/payment-review-hold-isolated has STAGING_MODE: true.
Its current booking spreadsheet ID and VIP spreadsheet ID still point to the same existing CMS/VIP spreadsheet. The runtime guard intentionally blocks all spreadsheet access in this state.

**Do not deploy this branch or disable the guard to make tests pass.**

## Required isolated resources

Before any Apps Script staging execution, provision two new, empty Google spreadsheets owned by the project operator:

1. **Booking staging spreadsheet** — for the eight booking tabs listed below.
2. **VIP staging spreadsheet** — for mock/test-only VIP data. It must not contain copied customer/token data from production.

Neither spreadsheet may be the existing KaenatChi CMS spreadsheet or any production spreadsheet. Do not copy production rows, receipts, customer details, VIP tokens, or payment data.

## Booking staging tabs

The booking spreadsheet must contain these tabs, exactly named:

- Bookings
- Customers
- Schedule
- BlockedDates
- BlockedSlots
- Payments
- BookingSettings
- BookingLogs

Use synthetic test records only. Before running a backend health check, confirm the code's expected header names and initialization behavior; do not assume a blank spreadsheet is ready.

## Configuration gate

After both staging spreadsheets exist, update only the staging branch configuration:

- CONFIG.SPREADSHEET_ID → the new booking staging spreadsheet ID.
- CONFIG.VIP.SPREADSHEET_ID → the new VIP staging spreadsheet ID.

Keep STAGING_MODE: true. Keep the IDs different. Do not edit the production branch, Worker, production CMS, or live Apps Script deployment.

## Verification sequence

1. Run CI tests; the shared-ID runtime guard tests must pass.
2. Verify the two configured IDs are different and are the newly created staging resources.
3. Verify required tab names and headers against the code before calling healthCheck_.
4. Only then perform a staging-only backend smoke test with synthetic records.
5. Keep Telegram, Drive receipt uploads, payment approval, and live deployment disabled until each is separately reviewed.

## Current blocker

No staging spreadsheet IDs have been supplied or provisioned in this workflow. Consequently, real-sheet diagnostics and end-to-end Apps Script tests remain blocked by design.
