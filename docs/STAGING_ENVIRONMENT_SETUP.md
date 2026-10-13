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
- Services

### Minimum header contract

Headers are case-sensitive unless the code explicitly accepts aliases. Keep the columns listed below; additional columns may be present.

| Tab | Required headers |
|---|---|
| Bookings | Booking ID, Request ID, Created At, Telegram ID, Customer ID, First Name, Last Name, Mobile, Service ID, Service Name, Appointment Date, Appointment Time, Slot Key, Original Price, Discount Code, Discount Type, Discount Amount, Final Price, Payment Status, Appointment Status, Tracking Code, Hold Until |
| Customers | Customer ID, Telegram ID, Telegram Username, Telegram First Name, Telegram Last Name, Booking First Name, Booking Last Name, Mobile, Last Booking At |
| Schedule | Day, Active, Start Time, End Time, Slot Duration |
| BlockedDates | Date, Active, Reason |
| BlockedSlots | Date, Time, Active, Reason |
| Payments | Payment ID, Booking ID, Customer ID, Amount, Receipt Link, Receipt URL, Receipt File ID, Transaction Number, Tracking Code, Payment Status, Submitted At |
| BookingSettings | Setting, Value |
| BookingLogs | Log ID, Booking ID, Action, Slot Key, Details, Created At |
| Services | A service ID, a service name, and a price column using one of the recognized aliases below |

The `Services` sheet accepts these aliases:

- **Service ID:** `Service ID`, `ServiceId`, `ID`, `Id`, `id`, `شناسه خدمت`
- **Service name:** `نام خدمت`, `Service Name`, `Name`, `Title`, `عنوان`
- **Price:** `قیمت`, `Price`, `Base Price`, `Original Price`, `مبلغ`
- Optional fields recognized by the service loader include category (`دسته`, `Category`, `Service Category`), description (`توضیح کوتاه`, `Description`, `Short Description`, `توضیحات`), duration (`مدت`, `Duration`, `مدت زمان`), and active status (`Active`, `Is Active`, `فعال`, `وضعیت`, `Status`).

The contract test currently validates key runtime columns for several tabs and now checks the recognized ID/name/price headers for `Services`; it is not a substitute for reviewing every column used by every workflow. The health check reports tab presence/row/column counts only and does not create tabs or validate headers.

Use synthetic test records only. A blank spreadsheet is not ready until all required tabs and compatible headers have been created and reviewed.

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
