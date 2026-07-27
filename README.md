# Restaurant Reservation System

![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?style=for-the-badge&logo=stripe&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

A modern, full-stack restaurant reservation system built with Next.js, featuring real-time availability, secure payments, automated email notifications, and an administrative dashboard.

## 🌟 Features

- **Multi-step Booking Flow**: A seamless and intuitive reservation experience with dynamic availability checking.
- **Secure Deposit Payments**: Integrated with Stripe for taking deposits and holding booking guarantees securely.
- **Automated Email Notifications**: Booking confirmations, updates, and reminders sent out via Gmail SMTP.
- **Administrative Dashboard**: Manage reservations, view schedules, and handle customer requests securely backed by custom JWT authentication.
- **Internationalization (i18n)**: Out-of-the-box multi-language support leveraging `next-intl`.
- **Responsive Design**: Mobile-friendly UI crafted with Tailwind CSS v4 and Radix UI primitives.
- **Robust Validation**: Both client-side and server-side validation using React Hook Form and Zod.

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Styling & UI**: Tailwind CSS v4, Radix UI, Lucide React
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL Database & Auth)
- **Payments**: Stripe
- **Email Delivery**: Nodemailer (via Gmail SMTP integration)
- **Forms & Validation**: React Hook Form, Zod
- **i18n**: next-intl

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- A [Supabase](https://supabase.com/) project
- A [Stripe](https://stripe.com/) account
- A Gmail account (with App Password enabled)

### Installation

1. Clone the repository and install the dependencies:

```bash
npm install
```

2. Copy the environment variables template and fill in your credentials:

```bash
cp .env.local.example .env.local
```

3. Configure your `.env.local` file with the required keys:

- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` & `STRIPE_SECRET_KEY`
- `GMAIL_USER` & `GMAIL_APP_PASSWORD`
- `JWT_SECRET`, `ADMIN_USERNAME`, & `ADMIN_PASSWORD`

### Database Setup

Apply the Supabase migrations to set up your database schema. You can execute the SQL scripts found in the `supabase/migrations/` directory directly within your Supabase SQL Editor, or use the CLI:

```bash
npx supabase migration up
```

### Development

Run the development server locally:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📁 Project Structure

- `src/app/` - Next.js App Router pages including Frontend interface and Admin Panel
- `src/app/api/` - Backend API routes for interacting with the database, auth, emails, and Stripe webhooks
- `src/components/` - Reusable UI elements, `booking/` components, and layout blocks
- `src/lib/` - Core logic blocks including `auth.ts`, `stripe.ts`, `email.ts`, `supabase/` client, and validations
- `supabase/migrations/` - PostgreSQL Database schema files and migration definitions

## 🔒 Security & Reliability Hardening

The system runs in production for a live restaurant, where a booking or payment defect
has direct financial and customer-facing consequences. A full audit of the booking,
payment, and administration paths was carried out and delivered in two phases. Each item
below records the defect, the fix, and why it mattered.

### Phase 1 — Payment integrity, data protection, and booking correctness

| Area | Problem found | Resolution & impact |
| --- | --- | --- |
| **Admin route protection** | A prior change renamed `proxy.ts` to `middleware.ts` on the premise that Next.js was silently ignoring the file. Verification against the `next@16.0.10` source (`dist/lib/constants.js`, `dist/build/index.js`) showed the opposite: `proxy.ts` is the current convention and `middleware.ts` is the deprecated one. | Reverted the rename, keeping the admin route guard active rather than disabling it. Added explicit logging of unauthorized admin access attempts. |
| **Stored card takeover (IDOR)** | The booking API accepted `stripeCustomerId` and `stripePaymentMethodId` directly from the browser, and the unauthenticated SetupIntent endpoint returned a customer ID resolved by email address. A caller could attach another guest's saved card to their own reservation — and that guest would be charged for the resulting no-show. | The booking API now accepts only a `setupIntentId` and resolves the customer and payment method from Stripe server-side, confirming the setup actually succeeded. The customer ID was removed from the SetupIntent response. |
| **Double charging** | The no-show charge had no idempotency key, so a retry, a double-click, or a second attempt after a failed status write charged the guest again. | Added a deterministic Stripe idempotency key scoped to booking and amount, so repeats return the original PaymentIntent while a deliberate re-charge at a different amount remains possible. |
| **Payments recorded that never settled** | `confirm: true` can return a non-`succeeded` PaymentIntent without throwing. Those were persisted as charged and triggered a "you were charged" email to the guest for money that never moved. | The charge route now verifies `status === 'succeeded'` before persisting or emailing, and returns `402` otherwise. A failure to record a *successful* charge now returns an explicit error with reconciliation guidance instead of reporting success. |
| **Public read access to all reservations** | Two Supabase RLS policies granted the `anon` role — whose key ships to every browser — read access to the entire `bookings` table (names, emails, phone numbers, allergy notes, Stripe identifiers) and the ability to insert rows directly, bypassing all availability, validation, and payment checks. | Dropped both policies after confirming every application path reaches the database through the service-role client. |
| **Double booking under concurrency** | Availability was checked with a `SELECT` and written with a separate `INSERT`. Two requests arriving inside that window both saw the slot as free and both succeeded, producing two confirmed parties for one seating. No constraint spanned the two statements, so the guarantee could only hold in the database. | Added a partial unique index on `(booking_date, slot_start, slot_end)`. The admin "additional booking" override is preserved via a `bypassed_slot_limit` flag that exempts those rows, so the feature keeps working while ordinary bookings stay strictly one-per-slot. Conflicts surface to the guest as a clean `409`. |
| **Advance-booking window off by one day** | The 7-day rule derived "today" from the runtime's local date. On a UTC host, every evening after 20:00 Montreal time was already the next day in UTC, shifting the cutoff and rejecting or accepting the wrong dates. | Introduced timezone-correct date helpers pinned to `America/Montreal`, verified with tests that assert the naive UTC computation produces a different (wrong) answer. |
| **Booking rules only enforced in the UI** | A request sent directly to the booking API could reserve a closed day, a past date, or a time that was not a real service slot, and could submit slot times that differed from those the guest was shown. | Extracted a shared `booking-validation` module used by both the availability and booking routes so the rules cannot drift, and the server now persists its own canonical slot times rather than the client's. |
| **Unbounded manual penalty** | The admin penalty override accepted any amount, so a mistyped value charged a real card off-session. | Capped the override at the maximum legitimate penalty. |

### Phase 2 — Operational safety and administrative correctness

| Area | Problem found | Resolution & impact |
| --- | --- | --- |
| **Brute-forceable admin login** | The login endpoint had no attempt limiting, leaving a single username and password as the only barrier to the full reservation database. | Added Supabase-backed rate limiting (5 failures per IP per 15 minutes). Backing it with the database rather than process memory means the limit survives serverless cold starts, and it adds no third-party dependency or cost. |
| **Unvalidated admin booking edits** | The edit endpoint wrote arbitrary dates, times, and status values straight to the database, and its availability re-check was dead code that had been commented out. A falsy-value guard also made it impossible to correct certain fields. | Date and time changes are now validated against the real slot definitions, status values are whitelisted, the falsy-guard bug is fixed, and a slot collision returns a clear `409` instead of a raw `500`. |
| **Concurrent admin edits overwriting each other** | Two administrators working from separately loaded pages could each save, with the later write silently discarding the earlier one. | Added optimistic locking on `updated_at`; a save based on stale data is rejected with a prompt to refresh. |
| **Unlimited overbooking via override** | The "allow additional bookings" override placed no ceiling on a slot, so repeated use could stack parties past the dining room's capacity. `MAX_CAPACITY` was defined but never enforced anywhere. | The override now respects `MAX_CAPACITY`, keeping the flexibility while bounding it. |
| **Silent notification failures** | Failed confirmation, cancellation, and no-show emails were written only to server logs. Staff had no way to know a guest never received notice of a confirmed or cancelled reservation. | Delivery failures are recorded on the booking row and surfaced as a warning on the admin dashboard. |
| **Timezone bug repeated on the client** | The admin dashboard reimplemented the 7-day check against the browser's local timezone, so the rule shown to staff could disagree with the rule the server enforced. | Extracted the timezone-correct helpers into a module shared by server and client so a single implementation governs both. |
| **No visibility into post-hoc payment events** | A no-show charge that failed asynchronously, or a guest disputing a charge weeks later, was observable only by manually checking the Stripe dashboard. | Implemented a signature-verified Stripe webhook endpoint for `payment_intent.payment_failed` and `charge.dispute.created`. *Present in the codebase but not yet enabled; activating it requires only registering the endpoint in Stripe and setting `STRIPE_WEBHOOK_SECRET`.* |

### Verification

Every change was checked with `tsc --noEmit`, ESLint, and a production build, plus a
standalone test script asserting the booking-rule and timezone logic — including
regression guards that fail if the previous incorrect behaviour is reintroduced.

### Additional environment variable

- `STRIPE_WEBHOOK_SECRET` — required **only** if the Stripe webhook endpoint is enabled.
  The booking and payment flows operate normally without it.
