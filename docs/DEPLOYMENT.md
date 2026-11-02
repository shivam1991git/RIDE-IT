# Deploying RIDE-IT v2

The web app stays on **Vercel** (project root `client/`) and the API on **Render** (repo root). Vercel rewrites `/api/*` to Render, so the browser treats the API as same-origin. That lets sessions use `httpOnly` `SameSite=Lax` cookies, which browsers would block as third-party cookies across `vercel.app` and `onrender.com`.

> v2 replaces the v1 API, so deploy the API and the web app together. Run the data migration before the new API serves traffic.

## 1. Before you deploy

1. **Back up Atlas**: take an Atlas snapshot or run `mongodump`.
2. **Dry-run the migration** against production from your machine. It writes nothing:
   ```bash
   MONGO_URI="<atlas uri>" MONGO_DB_NAME=ride-it JWT_SECRET=x npm run migrate
   ```
   It reports duplicate usernames and emails (these block the new unique indexes), legacy bookings to convert, numeric phone numbers and plaintext passwords.
3. Resolve any duplicates it lists, then run it with `--apply`.
4. Create your first admin. v2 has no public admin sign-up:
   ```bash
   ADMIN_PASSWORD='…' MONGO_URI="<atlas uri>" JWT_SECRET=x npm run create-admin -- --username you --email you@example.com --name "Your Name" --phone 9876543210
   ```

What the migration does, all additively (v1 fields are kept, so you can roll back by redeploying v1):

| Collection | Change |
|---|---|
| drivers | `status: approved` for existing drivers (they were already active in v1) |
| bookings | `type: rental`; status mapping `Confirmed→confirmed` (or `completed` if already ended), `Pending`/`Driver Confirmation Pending→pending_driver`, `Cancelled→cancelled`; `start`/`end` Dates parsed from the old strings (old "MM DD YYYY HH:mm" values are read as IST); `payment: cash` |
| cars | `slots[]` rebuilt from bookings (the atomic reservation lock) |
| users/drivers/admins | phone and pincode converted from Number to String |
| all | indexes synced (case-insensitive unique username/email, one-active-ride guards, query indexes, TTL on notifications and audit logs) |

Plaintext v1 passwords are re-hashed with bcrypt the first time each user signs in.

## 2. API on Render

| Setting | Value |
|---|---|
| Root directory | repo root |
| Build command | `npm ci --omit=dev` |
| Start command | `node server.js` |
| Health check path | `/api/health` |

Environment variables:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `MONGO_URI`, `MONGO_DB_NAME` | yes | Atlas connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | ≥32 random characters each, and different from each other. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URLS` | yes | e.g. `https://ride-it-aed.vercel.app` (the project's own `*.vercel.app` URLs are built in) (comma-separated). Used for CORS and the CSRF origin check |
| `APP_URL` | yes | Public web URL, used in password-reset links |
| `TRUST_PROXY` | yes | `2` (Vercel rewrite + Render proxy), so rate limits see the real client IP |
| `STRIPE_SECRET_KEY` | optional | **`sk_test_…` only.** Live keys are refused unless `ALLOW_LIVE_PAYMENTS=true` |
| `STRIPE_WEBHOOK_SECRET` | optional | Webhook endpoint: `https://<render-host>/api/payments/webhook`, events `payment_intent.succeeded` and `payment_intent.payment_failed` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional | Needed for password-reset emails in production |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | optional | See [Chat assistant](#chat-assistant) |
| `GEO_PROVIDER` | optional | `osm` (default) or `offline` |
| `SERVICE_AREA_*` | optional | Defaults to Varanasi, 35 km radius |

## 3. Web app on Vercel

`client/vercel.json` sets the Vite framework, the `dist` output, the `/api` rewrite, SPA fallback, security headers and CSP. It overrides the old CRA settings in the Vercel dashboard.

`client/vercel.json` points at the Render service `https://ride-it-xmf3.onrender.com` (rewrite and CSP `connect-src`). Update both if the service moves.

Environment variables (Vercel → Settings → Environment Variables):

| Variable | Notes |
|---|---|
| `VITE_SOCKET_URL` | `https://<render-host>`. Vercel cannot proxy WebSockets, so live updates connect directly to the API with a short-lived token. Without it, pages fall back to polling. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (optional) |

## 4. Smoke test after deploy

1. `https://<render-host>/api/health` returns `{"ok":true,"db":"up"}`.
2. Sign in on the Vercel URL and check that `/api/auth/session` returns your account. Cookies should be set on the Vercel domain.
3. Book a ride as a rider, accept it as a driver in another browser, and complete it.

## Free-tier limitations

- **Render free instances sleep** after inactivity. The first request can take about a minute; the UI shows loading states and retries.
- **Maps** use free public OpenStreetMap services: tiles from `tile.openstreetmap.org`, search from Photon (komoot) and routing from the OSRM demo server. They are meant for light use, with attribution, and have no SLA. The API caches results and falls back to the built-in landmark list and straight-line estimates if they are unavailable. For real traffic, self-host them or use a paid provider.
- **Durations** apply a documented 1.5× city-traffic factor to OSRM's free-flow times. There is no live traffic data.

## Chat assistant

The assistant needs no AI service. Booking lookups come from the database (only the signed-in rider's own bookings, identified by the session), and FAQs and fare estimates come from live configuration. Questions it can't match can optionally go to any OpenAI-compatible endpoint:

| Option | Cost | Notes (checked November 2026; free tiers change, so re-check) |
|---|---|---|
| **None** (default) | ₹0 | Rules plus verified data only. Always available. |
| **Groq** free tier | ₹0, no card | `AI_BASE_URL=https://api.groq.com/openai/v1`, e.g. `AI_MODEL=llama-3.1-8b-instant`. Per-organisation rate limits; check them in the Groq console. |
| OpenRouter `:free` models | ₹0 | About 50 requests/day on accounts that have never bought credits. |
| Google Gemini free tier | ₹0 | Free-tier prompts may be used to improve Google's products, so it isn't recommended for user messages. |
| Local model (Ollama etc.) | ₹0 | Cannot run on Vercel or Render's free tier. Works only for local demos. |

Only the help-content system prompt and the last few chat messages are sent to the provider, never account or booking data. If the provider errors, times out (8 s) or runs out of quota, the assistant falls back to its rule-based answer.
