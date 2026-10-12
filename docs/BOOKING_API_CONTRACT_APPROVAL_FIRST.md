# Booking API Contract — Approval Before Payment (Experimental)

## Scope and safety
- Branch: `experiment/telegram-first-booking-flow`
- This document is a design contract only. It does not deploy code or change the Worker.
- Staging remains isolated; no production CMS, VIP, Telegram, or Drive access.
- Manager actions are performed only through authenticated Telegram callbacks.

## Required customer flow
1. Mini App sends `createBooking` with a unique `requestId`, selected service/date/time, validated customer details, Telegram identity, and optional discount code.
2. Backend validates service, price, service duration, schedule, blocked dates/slots, and overlapping reservations atomically.
3. Backend creates a 12-hour manager-approval request in `PENDING_APPROVAL`. It holds the slot, logs the transition, and queues an admin notification. It does not request, accept, or store payment proof at this stage.
4. Mini App shows request tracking and “waiting for manager review”; it must not call `submitPayment` automatically.
5. Admin approves/rejects through Telegram. The callback is authorized, idempotent, and the action revalidates current state, expiry, and slot capacity under the booking lock.
6. On approval, state changes to `AWAITING_PAYMENT`, the payment deadline is stored, and only then are payment instructions sent to the customer.
7. On rejection/expiry, the request is logged, the hold is released, and the customer is notified.
8. Customer sends receipt data using `submitPayment` only while the booking is `AWAITING_PAYMENT` and within the configured payment deadline. Backend stores proof, records `RECEIPT_SUBMITTED`, and notifies admin. It does not confirm the appointment.
9. Admin manually approves/rejects the receipt through Telegram. Approval changes payment to `PAYMENT_APPROVED` and appointment to `CONFIRMED` atomically; only after successful payment approval may a VIP token be consumed. Rejection changes payment to `PAYMENT_REJECTED` and allows correction only within the configured correction window.
10. Every transition is replay-safe and logged with actor, time, from/to state, and reason. Telegram delivery failure never rolls back a committed state.

## API actions
- Public/read: `getConfig`, `getAvailableSlots`, `bookingStatus`, customer-safe `getBooking`, `validateDiscount`.
- Customer mutations: `createBooking`, `submitPayment` (the latter is state-gated).
- Manager mutations: never routed through the public action router. Only authenticated Telegram callback handling may call internal manager functions.
- Legacy no-action booking submission stays disabled.

## State model
- Appointment/request: `PENDING_APPROVAL` → `AWAITING_PAYMENT` → `RECEIPT_SUBMITTED` → `CONFIRMED`.
- Terminal/exception states: `REJECTED`, `EXPIRED`, `CANCELLED`.
- Receipt rejection uses payment state `PAYMENT_REJECTED`; the request can return to `AWAITING_PAYMENT` only within the correction window.
- Payment states: `NOT_REQUESTED`, `PAYMENT_PENDING`, `RECEIPT_SUBMITTED`, `PAYMENT_REJECTED`, `PAYMENT_APPROVED`.

## Current incompatibilities observed in Code.gs / Main Mini App
- `createBooking_` currently writes the generic “در انتظار بررسی” appointment status but sets payment to “در انتظار پرداخت” and a generic initial hold. It returns “pay now” messaging.
- `submitPayment_` currently accepts the generic `BOOKING_PENDING` status, so payment can be submitted before manager approval.
- `approveBooking_` currently expects payment proof already received, then confirms the appointment. This reverses the required order.
- Main Mini App currently calls `createBooking` and then immediately calls `submitPayment` in the same submit flow.
- The current Telegram keyboard labels the second action “رد فیش” while it is also used for initial booking rejection. Initial request decisions and receipt review need distinct callback actions and keyboards.
- The current generic queue notification path must be extended with distinct events: `booking_request`, `payment_instructions`, `receipt_received`, `receipt_approved`, `receipt_rejected`, `booking_rejected`, and `booking_expired`.

## Implementation sequence (do not skip)
1. Add explicit states and pure transition/expiry/idempotency tests first.
2. Implement backend state transitions and separate Telegram callback actions; retain staging side-effect blocks.
3. Update status endpoint to return the explicit state and only customer-safe fields.
4. Update Mini App so request submission ends at “waiting for approval”; payment/receipt UI is shown only after `AWAITING_PAYMENT`.
5. Add static contract checks and run pure tests that do not read/write Sheets, Drive, Telegram, or VIP.
6. Only after review, run explicitly approved staging integration tests. Do not merge or deploy without Maya's approval.

## Timeouts still requiring a product decision
- Payment deadline after manager approval.
- Receipt correction deadline after rejection.
- Maximum receipt review wait before releasing the slot.
- Behavior when the appointment start is near or passes during review.
