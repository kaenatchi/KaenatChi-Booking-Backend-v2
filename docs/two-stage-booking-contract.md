# Two-stage booking contract — staging only

## Scope and safety
This document defines the cross-repository contract for the staging implementation. It does not authorize production deployment, Cloudflare Worker changes, CMS schema changes, or a merge to a live branch.

## Required state machine
1. Customer submits a booking request. It is a request, not a confirmed appointment. No receipt upload is requested or submitted at this stage.
2. The backend records the request and reserves its requested slot according to the existing first-valid-request-first priority rule. The request awaits manager review; it must not become confirmed.
3. Maya accepts the request. Only after this acceptance may the customer be asked to pay. The accepted request receives a 10-minute payment deadline.
4. The customer submits transfer details and a receipt image within that deadline. The backend records receipt received and keeps the slot reserved while manual bank verification is pending.
5. The receipt review must not automatically release the slot or reject the booking merely because 120 minutes (or any other review interval) elapsed.
6. Only an explicit manager approval after actual bank verification finalizes the appointment and consumes any eligible discount token. Manager rejection must be guarded against stale callbacks after confirmation.

## API/UX requirements
- The Mini App must not call `submitPayment` as part of the initial `createBooking` submission.
- The backend needs an authenticated manager-accept transition and an idempotent accept operation; only its successful result may expose the payment action to the customer.
- Payment submission must be accepted only for an accepted request within its 10-minute payment window.
- Duplicate request IDs, duplicate receipt submissions, retries after partial failures, and repeated Telegram callbacks must be idempotent.
- The Mini App must display distinct states: request awaiting review, accepted/payment due, receipt under manual review, confirmed, and rejected/cancelled.
- No changes to Worker, production deployment, CMS/VIP/payment credentials, or live Apps Script deployment in this staging phase.

## Mandatory contract tests before preview approval
- Initial request does not submit payment or ask for a receipt.
- Pending request cannot submit payment before manager acceptance.
- Acceptance starts a 10-minute payment deadline and is idempotent.
- Payment after the deadline is refused without confirming the booking.
- Receipt received remains held after simulated passage of the old 120-minute review interval.
- Only verified manager approval confirms the booking.
- Repeated approval/rejection callbacks cannot reverse final states.
- Notification and audit failures can be retried without duplicate financial mutations or lost queued notifications.
- Slot conflict and first-valid-request priority remain enforced under concurrent requests.
