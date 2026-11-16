# REALORA

NYC real-estate transaction platform.

## Data mode

`NEXT_PUBLIC_DATA_MODE=supabase` is the default and deployed configuration. The app reads and writes Postgres; deal transitions run on the server.

`NEXT_PUBLIC_DATA_MODE=production` is supabase plus compliance gates (Agency Disclosure, designated agency, pause, fair-housing lint), mock vendor fallbacks disabled, and fast-forward off.

`NEXT_PUBLIC_DATA_MODE=local` keeps a dormant Zustand fixture layer for offline engineering only. It is not reachable from product UI paths when the app runs in supabase/production (the deployed default).

## Getting started

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_DATA_MODE=supabase and Supabase keys
npm install
npm run seed:reset   # requires SEED_PASSWORD_SELLER / BUYER / BROKER in the environment
npm run dev
```

Open http://localhost:3000 and sign in on `/auth` with email + password.

## Supabase mode

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import `@/lib/supabase/admin` from a client component.

3. Apply migrations (do not create tables in the dashboard):

```bash
npx supabase db push
# or: psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
```

4. Enable Auth providers in the Supabase dashboard: **Email** (password sign-in / sign-up). Optional: **Google**. Redirect URL: `http://localhost:3000/auth/callback`.

5. Seed (idempotent; `--reset` wipes public rows first). Passwords for the three working sign-ins are supplied only via environment variables and are never committed:

```bash
export SEED_PASSWORD_SELLER='…'
export SEED_PASSWORD_BUYER='…'
export SEED_PASSWORD_BROKER='…'
npm run seed
# npm run seed:reset
```

### Auth (sign-in / sign-up)

`/auth` is a product surface: password sign-in, sign-up (`?mode=signup`), forgot-password, and `intent` / `next` query handling (e.g. `/auth?intent=buying&next=/portal/buyer` from mortgage).

**Email confirmation (dev vs production flip):** Sign-up uses `admin.createUser` with `email_confirm: true` so new accounts are usable immediately on this project without SMTP. When real SMTP is configured for production, turn **Confirm email** on in Supabase → Authentication → Providers → Email (and stop auto-confirming in `signUpAction` / seed). Until then, leave confirmations off or keep the admin auto-confirm path.

**Password reset** needs Supabase Auth custom SMTP (Resend). Without it, the forgot-password screen says so plainly instead of pretending mail was sent.

**Sell intake handoff:** Public `/sell` preserves intake in `sessionStorage` across the auth round-trip and resumes at media scheduling after sign-in/sign-up.

Google OAuth: visit `/auth?provider=google` (optional; not shown as a primary button).

Regenerate TypeScript types after schema changes:

```bash
npm run types
```

## R4 — invites, notifications, verification, vendor money

R4 is live in supabase mode.

### Notifications

One `notify(userId, templateKey, payload)` call. Email is Resend (`RESEND_API_KEY`); SMS is Twilio (`TWILIO_*`). Missing keys write a `notifications` row with `status: logged_only` and never throw.

Deadline reminders: `POST /api/jobs/deadline-reminders` with header `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`). Idempotent per task + window (48h, 24h, morning of). Daily Vercel cron is in `vercel.json` (`0 13 * * *`). Running the endpoint manually is enough to test.

### Supabase Auth custom SMTP (Resend) — config for Gianni, no code

The built-in Supabase Auth email cap blocks real sign-ups. Point Auth at Resend SMTP once:

1. In Resend: create an API key and verify the sending domain (or use the onboarding domain for tests).
2. Supabase dashboard → **Authentication** → **SMTP Settings** → enable custom SMTP.
3. Host `smtp.resend.com`, port `465` (SSL) or `587` (STARTTLS).
4. Username `resend`. Password = the Resend API key.
5. Sender email must be a domain Resend accepts (same as `RESEND_FROM`).
6. Send a test magic link from `/auth` with a personal email and confirm it arrives.

This is dashboard config only. App notification email is a separate Resend key (`RESEND_API_KEY`).

### Identity verification

Sandbox for R4 testing (`PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`). Webhook `POST /api/webhooks/persona` consumes `data.id`, `data.attributes.status`, `data.attributes.reference-id`. No key → supabase UI labels **test verification**.

### Stripe Connect

Test-mode Express onboarding. Vendor bookings are **destination charges** on the platform account (`payment_intent_data.transfer_data.destination` + `application_fee_amount: 0`) so webhooks and `money_events` stay on the platform and v1 takes no cut. Closing fees are invoiced as PDFs, never charged on card.

## R5 — brokerage operating layer

Broker console at `/portal/broker` (app_role `broker` or `admin`; everyone else gets a 404). Nav: Overview, Approvals, Deals, Scorecard. AE scorecard: `/portal/seller/scorecard`.

Compliance gates run in **production** data mode. Agency Disclosure is required before `submitOffer` and a buyer's first deal message. Both-sides accept requires seller + buyer designated-agency consents and a broker approval assigning two **different** users as `agent_seller` and `agent_buyer`.

```bash
npm run verify:r5
NEXT_PUBLIC_DATA_MODE=production npm run check:production
npm run rehearse:r5
```

`scripts/production-check.mjs` is meant for the production project. Do not run cleanup against the working dev project.

### Env inventory

| Name | Where used | Test vs live |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | Client + server data engine | `supabase` (default), `production` (+ gates), `local` (dormant fixtures) |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase | Same project URL; use a dedicated production project for go-live |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + RLS | Anon key for that project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (`src/lib/supabase/admin.ts`); also auto-confirms sign-ups on this project | Never client. Build fails if imported from a client module |
| Auth email confirmation | Supabase dashboard → Auth → Email | **Dev:** auto-confirm via `signUpAction` / seed (`email_confirm: true`). **Production flip:** enable Confirm email + Auth SMTP; remove auto-confirm once mail works |
| Auth custom SMTP | Supabase dashboard → Auth → SMTP (Resend) | Required for password-reset and (later) confirmation mail. Same Resend stack as notification email, separate from `RESEND_API_KEY` app sends |
| `NEXT_PUBLIC_SITE_URL` | Invite + notification links | localhost vs production domain |
| `SOCRATA_APP_TOKEN` | ACRIS / NYC Open Data | Optional; unauthenticated works |
| `DROPBOX_SIGN_API_KEY` / `DROPBOX_SIGN_CLIENT_ID` | E-sign | Test mode OK through rehearsal; live mode is a launch flip |
| `ANTHROPIC_API_KEY` | Contract extraction | Real calls; no mock |
| `RESEND_API_KEY` / `RESEND_FROM` | Notification email | Test domain vs verified sending domain |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS | Twilio test vs live number |
| `CRON_SECRET` | `POST /api/jobs/deadline-reminders` | Must not be empty/default in production |
| `PERSONA_API_KEY` / `PERSONA_TEMPLATE_ID` / `PERSONA_WEBHOOK_SECRET` | ID verification | Sandbox OK for rehearsal; live inquiry is a launch flip |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Connect destination charges | `sk_test_` vs `sk_live_` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error reporting (`src/lib/sentry/capture.ts`, `instrumentation.ts` `onRequestError`) | Errors only, no session replay. Optional later: `npm install @sentry/nextjs` |

### Supabase backup / PITR (dashboard only)

1. Supabase dashboard → project → **Settings** → **Infrastructure** (or **Database**).
2. Enable **Point-in-Time Recovery** on the production project (paid add-on).
3. Confirm daily backups are on and the retention window matches the brokerage record-keeping policy.
4. Take a manual backup before first live listing.
5. Store restore runbook access with the broker of record — not in the app.

### Brokerage identity

Legal name and license live in `settings` (`brokerage_legal_name`, `brokerage_license_number`). Placeholders until the partner agreement is signed. Production mode warns in the broker console while they remain placeholders. Listing pages, generated documents, and the footer read this block — do not hardcode brokerage claims.
