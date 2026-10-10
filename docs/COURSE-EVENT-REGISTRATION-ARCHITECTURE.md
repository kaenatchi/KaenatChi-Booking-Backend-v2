# Booking Backend v2 — course and event registration architecture

Status: review draft only. No runtime behavior, spreadsheet rows, payment, VIP or deployment is changed by this document.

## Existing boundary
The current backend owns appointment bookings, customers, schedule, blocked dates/slots, payments, booking logs and VIP discount validation. Therapy intake has a separate proposed createTherapyRequest / therapyRequestStatus path and TherapyRequests tab. Intake is not a booking.

## Registration domain
Course and Event registrations are not appointment bookings and must not occupy Bookings, Schedule or appointment slots. Use a dedicated Registrations tab in the same spreadsheet configured by CONFIG.SPREADSHEET_ID, provisioned idempotently. No new spreadsheet.
Each Course/Event record in CMS controls its own mode: direct or approval_required. The backend reads the current CMS configuration and snapshots mode, item name, price, payment requirement and capacity. Browser values are never authoritative for price, mode or remaining capacity.

## Proposed backend actions
- createRegistration: validate item type/id, active state, registration window and contact details; apply idempotency and lock; check capacity; write the registration.
- getRegistrationStatus: return only minimal status fields for the user's own request, guarded by a high-entropy ID or equivalent verification.
- listRegistrationsAdmin: authenticated CMS-only listing with filters and pagination.
- reviewRegistrationAdmin: authenticated review action with allowed state transitions and audit data.
- submitRegistrationPayment: keep separate from appointment payments unless an existing safe generic primitive is proven compatible; validate amount against stored final price.
- cancelRegistration: validated transition with explicit capacity-release rules.
Do not ship admin actions without verified authorization. Telegram callback buttons must authenticate the callback and enforce state transitions. Do not include sensitive free text in notifications.

## Concurrency and state rules
- Use LockService.getScriptLock() around idempotency check, capacity count and write.
- Define which states consume capacity. Initial proposal: confirmed registrations consume seats; temporary holds require expiry and cleanup.
- Duplicate idempotency keys return the existing result.
- Enforce configured capacity on the server. Never trust client-reported remaining seats.
- Verify payment amount against server-stored final price and reject duplicate payment submissions safely.
- Do not consume existing appointment VIP tokens for class/event registrations. Any future registration discount policy requires separate design and regression tests.
- Keep Jalali display concerns in UI; backend registration-window comparisons use one documented timezone/date representation.

## Therapy separation
Keep TherapyRequests independent from Registrations and Bookings. Therapy intake is reviewed manually. After agreement, the customer uses the existing Main Mini App booking flow; no slot is created during intake.

## Required tests before merge/deploy
1. Direct mode: valid request, duplicate, capacity reached, inactive item.
2. Approval mode: payment/confirmation blocked before approval; reject/cancel transitions.
3. Concurrent submissions at final available seat never exceed capacity.
4. Payment: wrong amount, duplicate receipt, payment failure, final-price snapshot.
5. Security: missing/invalid admin auth, another user's status lookup, invalid transition.
6. Compatibility: old Courses/Events without new fields preserve current rendering and behavior.
7. Regression: appointment create/hold/release, payment, VIP token timing, Jalali functions, Worker transport and therapy intake.
8. Test data cleanup; no production notifications or payments in automated tests.

## Deployment boundary
No Worker changes. No merge or Apps Script deployment without explicit approval and successful test evidence.