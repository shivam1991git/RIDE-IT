# Security review: v1 findings and v2 fixes

Each finding links to the automated test that verifies the fix. All tests are in `tests/` and run with `npm test`; browser checks were run with Playwright.

| # | Severity | v1 finding | v2 fix | Verified by |
|---|---|---|---|---|
| S1 | Critical | Booking creation spread `req.body`, so clients could set `totalAmount`, `driver` and `driverConfirmed` | zod schemas strip unknown fields; fares are recomputed on the server from route and config | `rides.test.js`: "ignores client-supplied fare, driver and status fields" |
| S2 | Critical | Payment was cosmetic: the Stripe token was ignored and every booking was effectively free | Stripe PaymentIntents created from the stored fare; status read back from Stripe or a signed webhook; amount cross-checked; refunds on cancel | `chat-payments-security.test.js`: card payments block |
| S3 | High | Anyone could create the first admin on an empty database, through a public page | Public admin registration removed; admins are created by an admin or with `npm run create-admin` | `auth.test.js`: "there is no public admin registration endpoint" |
| S4 | High | Every unverified driver could list all customers' names, phones and emails | Drivers must be admin-approved; open requests show only the rider's first name and rating; contact details appear after acceptance | `rides.test.js`: happy path asserts no phone or email before accept |
| S5 | High | Race conditions: double acceptance, confirming cancelled bookings, double-booked rentals | Status-guarded atomic updates, partial unique indexes, atomic slot reservation | `rides.test.js` and `rentals.test.js`: concurrency tests |
| S6 | Medium | NoSQL operator injection in login | All input parsed by zod as primitive types | `auth.test.js`: "blocks NoSQL operator injection" |
| S7 | Medium | No rate limiting, no security headers | helmet (API), CSP and headers (Vercel), per-account login limit, per-IP limits on auth, quotes, geo, chat, support and PIN attempts | `auth.test.js`: "login is rate limited", "security headers" test |
| S8 | Medium | Raw Mongoose errors returned to clients | Central error handler: consistent `{error:{code,message}}`, no stack traces, 413 on oversized bodies | "errors are JSON without stack traces" |
| S9 | Medium | 7-day JWT in `localStorage`, no revocation; deleted users kept access | 15-minute access and 7-day refresh tokens in `httpOnly` `SameSite=Lax` cookies; `tokenVersion` revocation (sign out everywhere, password change or reset, suspension); account re-checked on every request | `auth.test.js`: sessions block |
| S10 | Medium | CORS allowed any `*.vercel.app` origin | Explicit allowlist (`FRONTEND_URLS`) plus an origin check on state-changing requests | "CORS only allows configured origins…" |
| S11 | Low | Public car list exposed booking ids; no unique indexes | Public API returns busy intervals only; case-insensitive unique indexes on username and email | `rentals.test.js`, `auth.test.js` duplicate tests |
| S12 | Info | Plaintext passwords possibly in the database | bcrypt (12 rounds), upgraded on login with a constant-time compare; migration reports remaining plaintext passwords | `auth.test.js`: legacy upgrade test |

## Also added

- Ownership checks on every booking read and write (customers see only their own; drivers only assigned jobs or eligible open requests). Covered by the IDOR tests.
- The 4-digit ride PIN is never sent to drivers, and drivers are limited to 10 start attempts per 10 minutes.
- Password reset: 256-bit single-use tokens stored as SHA-256 hashes, a 30-minute expiry, the same response whether or not the email exists, and all sessions revoked on reset.
- Chat: identity comes only from the session; message size and count limits; no account data sent to the AI provider. Tested by "booking lookups … only ever show the caller's own bookings" and "never sends account data".
- An audit log for sign-ins, admin changes, booking transitions and payments, kept for 180 days.
- Login redirect accepts same-site paths only.
- Dependencies: `npm audit` reports 0 known vulnerabilities in both the API and the client (November 2026).

## Remaining risks

- No email or phone verification at sign-up. Reset emails need SMTP configured.
- Free map services have no SLA (see DEPLOYMENT.md).
- Card payments were tested against a stubbed Stripe client. They have not been run end to end with real Stripe test keys, because no keys were available.
- The CSP keeps `style-src 'unsafe-inline'`, which Emotion/MUI requires.
