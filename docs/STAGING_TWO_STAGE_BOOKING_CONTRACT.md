# KaenatChi two-stage booking contract (staging only)

Status: proposed acceptance contract for coordinated Mini App + Apps Script staging work. This document does not authorize production deployment.

## Required customer and admin flow
1. Customer submits a booking request for an eligible future slot.
2. The system records a durable request and protects the slot according to the agreed same-slot priority rule; the customer is told that the request is awaiting admin review. No payment form is shown and no payment request is sent at this stage.
3. Maya may accept or reject the request from the admin Telegram workflow.
4. On acceptance, the request enters an accepted-awaiting-payment state and the customer is notified of the exact amount and a 10-minute payment deadline.
5. The customer may submit a card-transfer receipt image and/or transaction reference during that window.
6. After proof submission, the booking remains held indefinitely while awaiting manual bank verification; there is no automatic expiry/release based on the previous 120-minute review timer.
7. Only explicit admin verification of the actual deposit finalizes the booking as confirmed.
8. Admin rejection of proof records the decision and follows the explicit cancellation/release policy; it must not be inferred from timeout.
9. Duplicate requests, duplicate proof submissions, stale Telegram callbacks, transport retries, and partial Sheet/Properties failures must be idempotent and must not duplicate financial operations or reverse a confirmed booking.

## Status model
- REQUEST_PENDING: submitted; no payment permitted.
- ACCEPTED_AWAITING_PAYMENT: accepted by admin; payment allowed until acceptedAt + 10 minutes.
- PAYMENT_RECEIVED_REVIEW: proof received; hold does not auto-expire.
- CONFIRMED: bank transfer verified by admin.
- REJECTED_BY_ADMIN: explicit admin rejection, with audit and user notification.
- EXPIRED_UNPAID: accepted request passed the 10-minute payment window without proof; release slot safely and audit. This expiry must never apply after proof has been received.

## Required invariants
- No submitPayment succeeds unless state is ACCEPTED_AWAITING_PAYMENT and its payment deadline has not passed.
- No booking is confirmed merely because a receipt was uploaded.
- No hold expiry or release occurs in PAYMENT_RECEIVED_REVIEW.
- A stale reject callback cannot reverse CONFIRMED.
- A retry of the same requestId or callback is idempotent.
- Slot conflict handling is serialized under the booking lock.
- All transitions write an audit record and queue the appropriate Telegram notice; transient notification failures are retryable.
- Existing Worker transport and live deployments remain untouched.

## Cross-repository rollout plan
1. Add backend transition handlers and deterministic tests on this staging branch.
2. Add Mini App UI/flow on its matching staging branch: request-only submit, awaiting-review state, and payment UI only after accepted status is fetched.
3. Add a staging-only end-to-end contract test covering request -> accept -> proof -> manual approval, plus rejection, unpaid expiry, duplicate retries, stale callbacks, and slot collision.
4. Inspect both diffs and CI, then prepare a preview for explicit Maya approval. Do not merge or deploy production without explicit approval.

## Compatibility and migration warning
Current Mini App submission handler calls createBooking and submitPayment in the same submission path. Current backend createBooking_ sets a pending hold (default 15 minutes) and returns a payment instruction; submitPayment_ accepts pending bookings and adds a 120-minute review hold. The new state machine must change both sides together. Do not patch only one repository or reuse existing status strings without checking every consumer.
