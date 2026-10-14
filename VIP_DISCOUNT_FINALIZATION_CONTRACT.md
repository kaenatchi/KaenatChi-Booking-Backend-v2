# VIP Discount Finalization Contract — Staging only

## Current safety state

The current core intentionally rejects discount validation until identity is verified, and refuses final approval for any booking carrying a discount code. Do not remove either guard until the flow below is implemented and tested.

## Required identity contract

1. The Main Mini App sends Telegram WebApp initData as an opaque string with the booking request; it must not send a trusted telegramId field as proof.
2. The Staging Apps Script verifies initData server-side using the Telegram bot token from a private Script Property. Reject missing, stale, malformed, or invalid signatures.
3. Derive the Telegram user ID only from verified initDataUnsafe.user.id after signature verification. Never trust a user ID supplied separately by the browser.
4. Resolve that verified Telegram ID to exactly one active VIP customer row. A token is eligible only when its customer ID matches that row, its status is issued/active according to the real VIP contract, and expiry is in the future.
5. Discount preview is read-only. It must never mark a token as used or expired, and the server must recalculate subtotal, percentage, discount amount, and total from the CMS catalog.

## Atomic approval protocol

Google Apps Script cannot provide a single transaction across the booking spreadsheet and the separate VIP spreadsheet. Therefore do not pretend that a pair of writes is atomic.

Use one ScriptLock in the booking Apps Script and a single durable operation journal in the booking Staging spreadsheet:
- DiscountFinalizations columns: operation_id, request_id, tracking_code, token_code_hash, vip_customer_id, discount_percent, discount_amount, state, created_at, updated_at, last_error.
- Unique logical key: request_id. A request may have only one finalization operation.
- States: PREPARED, TOKEN_CONSUMED, BOOKING_CONFIRMED, RECOVERY_REQUIRED, FAILED.
- Before consuming the token, re-read the booking, receipt review state, exact amount, token status, expiry, customer ownership, and operation journal under the lock.
- If the token is already consumed by the same tracking code, treat that as an idempotent replay; if consumed by a different tracking code, stop and require manual review.
- Mark token consumption in the VIP sheet with the booking tracking code, then immediately persist TOKEN_CONSUMED in the journal and confirm the booking. Every step must be idempotent and recoverable.
- If a failure occurs after VIP token consumption but before booking confirmation, do not release/reuse the token and do not mark the booking confirmed. Persist RECOVERY_REQUIRED, keep the receipt under review, and surface a manager recovery action.
- Never automatically refund, consume another token, or confirm a booking from an ambiguous recovery state.
- For non-discount bookings, keep the existing manual bank-verification requirement.

## Required tests before enabling

1. Invalid/missing Telegram initData rejected.
2. Valid identity with a token belonging to a different VIP customer rejected.
3. Expired, inactive, already-used tokens rejected.
4. Discount preview does not write to VIP.
5. Two concurrent bookings attempting the same token: exactly one can proceed.
6. Duplicate payment-approval callback is idempotent.
7. Simulated failure before token write, after token write, after journal update, and before booking confirmation leads to a recoverable state without double use.
8. Bank deposit is verified manually before approval action.
9. No test reads/writes live CMS/VIP; use isolated test doubles or verified Staging IDs only.

## Stop conditions

- Do not add live spreadsheet IDs to source.
- Do not run the old schema initializer.
- Do not enable discounted booking until verified Telegram identity, the journal, recovery handling, and concurrency tests all pass.
- This document is a design contract only. It does not implement the protocol or claim any runtime test has passed.