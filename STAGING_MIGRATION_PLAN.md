# Staging schema migration plan (review only)

Status: **PLAN ONLY — no migration has run.**  
Target: the isolated spreadsheet named `KaenatChi Booking STAGING`.  
Safety rule: do not run `initializeStagingSchema()` against the existing spreadsheet.

## Known current staging tabs and headers

- `Services`: `service_id, service_name, category, price, duration_minute, active, allow_multi_select`
- `Bookings`: `booking_id, tracking_code, customer_name, phone, service_ids, appointment_date, slot_id, status, created_at, decision_deadline, payment_deadline, discount_code, subtotal, discount_amount, total_amount, idempotency_key, receipt_url, receipt_submitted_at, payment_status, admin_decision_at, updated_at`
- `Closures`: `closure_id, start_datetime, end_datetime, reason, source, active, created_at, updated_at`
- `Settings`: currently reported empty
- `AuditLog`: currently reported empty
- `Receipts`: `receipt_id, booking_id, tracking_code, file_url, submitted_at, claimed_tracking_number, amount_claimed, review_status, reviewed_at, admin_note`

The new core expects `Bookings`, `Payments`, and `BookingLogs` with a different contract. These schemas must not be mixed by adding new headers to the existing row 1.

## Required pre-migration checks

1. Run `auditBookingStagingSchemaReadOnly()` from the isolated staging Apps Script project and save its full output.
2. Confirm the spreadsheet ID privately against the staging spreadsheet; never print the full ID in logs.
3. Export a timestamped backup/copy of the staging spreadsheet before any migration.
4. Count rows per source tab and record the count in the migration report.
5. Inspect actual status values and representative rows with private data redacted. Do not infer a status mapping from header names alone.
6. Verify CMS API contract and VIP spreadsheet property configuration separately. Neither is part of this sheet migration.

## Proposed mapping (not yet approved or executed)

| Existing field | Candidate target field | Mapping note |
|---|---|---|
| `booking_id` | `Request ID` | Preserve original identifier verbatim; verify uniqueness first. |
| `tracking_code` | `Tracking Code` | Preserve verbatim; verify uniqueness. |
| `customer_name` | `First Name` / `Last Name` | **Do not split automatically** until Persian/full-name handling is agreed and sample values are reviewed. |
| `phone` | `Phone` | Preserve as text, including leading zeroes. |
| `service_ids` | `Service IDs` | Preserve original list format only after separator/encoding is inspected. |
| `appointment_date` | `Appointment Date` | Validate Jalali/Gregorian format before conversion. |
| `slot_id` | `Appointment Time` | Requires parsing and validation; do not assume the slot ID is a time. |
| `status` | `Status` | Requires an explicit reviewed state mapping; never blanket-convert unknown states. |
| `created_at` | `Created At` | Preserve timestamp and timezone meaning. |
| `decision_deadline` | `Request Expires At` | Preserve only if the old value represents the same 12-hour decision deadline. |
| `payment_deadline` | `Payment Expires At` | Preserve only for accepted requests; receipt-review cases must not auto-expire. |
| `discount_code` | `Discount Code` | Preserve code, but do not consume VIP token during migration. |
| `subtotal` | `Subtotal` | Verify currency unit and numeric formatting. |
| `discount_amount` | `Discount Amount` | Verify currency unit and numeric formatting. |
| `total_amount` | `Total` | Verify currency unit and numeric formatting. |
| `receipt_url` | `Receipt File ID` | **Not a direct mapping** unless it is confirmed to be a Drive file ID; otherwise retain URL in migration archive. |
| `receipt_submitted_at` | `Payments.Submitted At` | Requires one payment row per receipt and an explicit link to the booking. |
| `payment_status` | `Payments.Status` | Map only after actual status values are enumerated. |
| `admin_decision_at` | `Decision At` | Preserve timestamp; decision actor may remain unknown. |
| `updated_at` | `Updated At` | Preserve timestamp. |
| `Receipts.*` | `Payments.*` | Build a separate payment row per receipt; preserve claim, review status, and admin note in archive or explicit target fields. |
| `AuditLog.*` | `BookingLogs.*` | Map only after actual AuditLog headers and event values are inspected. |
| `Closures.*` | No target change proposed | Retain existing tab; ensure slot/closure reader understands its actual datetime schema. |

## Migration must be blocked if

- the read-only audit reports missing/duplicate identifiers or unexpected columns that have not been explained;
- any booking or receipt status has no approved mapping;
- any receipt file URL cannot be preserved without loss;
- the date/time parser cannot round-trip every source appointment;
- row counts or per-booking receipt counts differ before vs after a dry run;
- a backup has not been verified.

## Safe execution design, when separately authorized

1. Build a dry-run transformer that reads source rows and writes only a report to logs/output (no spreadsheet mutation).
2. Review source-to-target counts, unknown statuses, date/time parse failures, duplicate keys, and receipt link handling.
3. Create new target tabs with distinct temporary names, not over the existing `Bookings` or `Receipts` tabs.
4. Populate temporary tabs only after explicit approval, compare row-level checksums/counts, and retain originals.
5. Switch the application to the new schema only after Staging end-to-end tests pass. Do not delete/rename source tabs during the first migration pass.

This document is a proposal. It does not authorize a migration or any production change.
