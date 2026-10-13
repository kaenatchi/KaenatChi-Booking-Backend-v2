# KaenatChi Booking — Staging Environment Setup

## Current safety state

The branch `staging/payment-review-hold-isolated` has `STAGING_MODE: true`.
The two staging spreadsheet IDs have been supplied and configured in `Code.gs`:

- Booking staging: `1mFlfZgNxBoJIR42E388cuPxIgniTGMffWklVy0b3DH4`
- VIP staging: `1w8sJ9NdZHNdh7DQp_9OsJv_VMCJHY18wxVngc7HNDIM`

The IDs are distinct and the runtime isolation guard remains enabled. The code configuration has been read back from the branch, but spreadsheet tab contents/permissions have not been independently inspected and no Apps Script execution has occurred.

**Do not deploy this branch to the live Apps Script or disable the guard to make tests pass.**

## Required isolated resources

Before any Apps Script staging execution, provision two new, empty Google spreadsheets owned by the project operator:

1. **Booking staging spreadsheet** — for the nine booking tabs listed below.
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

The staging branch configuration has now been updated with the two IDs above. Keep `STAGING_MODE: true` and keep the IDs different. Do not edit the production branch, Worker, production CMS, or live Apps Script deployment.

## Safe booking-tab initializer

`initializeBookingStagingTabs_()` has been added to `Code.gs` on this staging branch. It is a manual, one-time helper and has **not** been executed.

Important limitations and safeguards:
- It opens only the configured booking staging spreadsheet; it does not open the VIP staging spreadsheet.
- It checks `STAGING_MODE: true` and distinct non-empty booking/VIP IDs before accessing the booking sheet.
- It creates the nine required booking tabs and writes headers only to tabs that are completely empty.
- It preserves existing tabs with content and reports them for review; it does not replace existing headers or rows.
- It does not copy production data, send Telegram messages, upload files to Drive, deploy code, or change the live app.

To use it, first create a **separate Apps Script staging project** and place the reviewed staging-branch code there. Do not paste or run this helper in the existing live Apps Script project. Then run `initializeBookingStagingTabs_()` manually in that staging project and inspect its returned summary. If any existing tab is non-empty, review it before proceeding. This helper prepares the booking spreadsheet only; it does not create or initialize VIP tabs.

## Verification sequence

1. Run CI tests; the shared-ID runtime guard tests must pass.
2. Verify the two configured IDs are different and are the newly created staging resources.
3. In a separate staging Apps Script project only, run `initializeBookingStagingTabs_()` and inspect its summary; verify required tab names and headers before calling `healthCheck_`.
4. Only then perform a staging-only backend smoke test with synthetic records.
5. Keep Telegram, Drive receipt uploads, payment approval, and live deployment disabled until each is separately reviewed.

## Current blocker

The IDs are configured, but the required tabs and header rows have not yet been verified. There is no connected Google Sheets tool in this workflow, and no Apps Script execution has been run. Before any backend smoke test, create/review the nine booking tabs and their headers, confirm access permissions, and ensure the VIP staging file contains only synthetic test data. VIP lookup is deliberately blocked while `STAGING_MODE` is true; do not remove that block as part of initial staging setup. Telegram sends are skipped and receipt uploads return synthetic staging metadata while staging mode is on.
