# KaenatChi — Telegram-first Booking Flow (Experimental)

## Safety boundary
- This branch is experimental only: `experiment/telegram-first-booking-flow`.
- Do not deploy or merge to production until Maya has reviewed the preview and the test suite passes.
- Do not change the Cloudflare Worker.
- Do not connect the experimental backend to the production CMS, production VIP spreadsheet, or production Telegram bot.
- CMS is the data/settings/audit layer, not the day-to-day management UI.
- Telegram is the primary manager interface.

## Product surfaces
- Customer: Main Mini App for service selection, Jalali date/time selection, request submission, payment instructions after approval, receipt upload, tracking, and rescheduling requests.
- Manager: Telegram messages and inline buttons for request approval/rejection, receipt review/approval/rejection, and reschedule decisions.
- Back office: isolated CMS spreadsheet for booking/payment/customer/schedule/settings/log persistence and reporting.

## Booking lifecycle
1. Customer submits a request.
2. Backend atomically checks the service, date, service duration, blocked dates/slots, existing bookings, and overlaps.
3. Request enters `PENDING_APPROVAL`; request deadline is 12 hours after creation. Payment is not requested or accepted yet.
4. Telegram notifies the manager with request details and Approve/Reject buttons.
5. Approve must re-check current status, expiry, and capacity under the booking lock. On success, status becomes `AWAITING_PAYMENT`, and payment instructions/deadline are sent to the customer.
6. Reject records actor/reason/time, frees capacity, and notifies the customer.
7. Customer submits bank-transfer receipt. Status becomes `RECEIPT_SUBMITTED`; this is not confirmation.
8. Manager manually verifies the transfer in Telegram. Only then does the booking become `CONFIRMED`, the payment become approved, and any eligible VIP token get consumed.
9. Rejected receipts may be corrected only within the configured correction window; otherwise the request expires and releases capacity.
10. All transitions are idempotent and logged. Notification failures must not roll back a committed booking/payment action; failed notifications must be retried.

## Timeouts to configure before production
- Request approval: 12 hours (locked).
- Payment deadline after manager approval: not yet decided.
- Receipt correction deadline: not yet decided.
- Maximum wait for manager receipt review / when to release a slot: not yet decided.
- Customer-initiated reschedule hold deadline: not yet decided.

## Rescheduling
- Keep the booking tracking ID and payment history unchanged.
- Generate a new appointment code after the time change commits; invalidate the previous appointment code.
- Manager-initiated: customer chooses an available slot; backend atomically revalidates and commits the change; no second approval required.
- Customer-initiated: customer proposes a new slot; manager approval is required before the new slot becomes final. The original appointment remains valid until approval. The proposed slot needs an expiring temporary hold.
- If the new slot is no longer free at commit, preserve the old appointment and ask the customer to choose again.
- Preserve old/new date/time, initiator, actor, reason, and timestamp in the audit history.
- Notify customer and manager in Telegram after a successful committed change. No second payment is collected.

## Telegram security and idempotency
- Only the configured admin Telegram chat may execute manager actions.
- Callback payloads must identify action and booking/reschedule ID, and stale/replayed callbacks must be rejected safely.
- Every action re-reads the current booking and validates its allowed state inside the booking lock.
- Never infer payment receipt verification from an uploaded image alone.
- Telegram delivery errors must not revert persisted state.

## Required test coverage before any production release
- New request starts pending manager approval and cannot submit payment before approval.
- Request expires at 12 hours and releases capacity.
- Manager approve/reject callbacks are admin-only and replay-safe.
- Approval fails if the request is expired, stale, or the slot is no longer available.
- Payment instructions appear only after manager approval.
- Receipt submission does not confirm a booking.
- Manager payment approval confirms booking and updates payment history exactly once.
- Receipt rejection/correction deadline behavior.
- Duplicate request/payment/callback submissions are idempotent.
- Concurrent attempts cannot book overlapping slots.
- Rescheduling preserves tracking ID/payment, rotates appointment code, retains audit history, and atomically handles a slot race.
- Manager-initiated and customer-initiated rescheduling have different approval paths.
- Telegram delivery failure does not undo booking/reschedule/payment state and retries safely.
- VIP discount is not consumed before payment is manually approved.
- Staging tests use isolated data and never send messages through the production Telegram bot.
