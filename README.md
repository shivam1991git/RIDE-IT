# RIDE-IT

Chauffeur-driven car rentals in Varanasi (Phase 1). Customers book hourly or full-day packages, outstation one-way or round trips, or airport transfers, see the full price before booking, and send a request. Operations approves it and assigns a compliant car and verified chauffeur. The chauffeur runs the trip from the app, from acknowledgement to the final bill, and payments are recorded by hand (cash or UPI).

Instant city rides (Uber-style) are still in the code, switched off by `RIDES_ENABLED` for Phase 1.

## Stack

| Layer | Technology |
|---|---|
| Web app | React 18, Vite 6, MUI 7, TanStack Query 5, React Router 7, Leaflet (OpenStreetMap), Framer Motion, Socket.IO client |
| API | Node 20+, Express 4, Mongoose 8, zod 4, helmet, express-rate-limit, Socket.IO, Nodemailer |
| Data | MongoDB (Atlas in production, a private local `mongod` in development) |
| Tests | Jest + Supertest + mongodb-memory-server (API), Playwright (browser checks) |

## Phase 1: how it works

```
Customer            Operations (admin)              Chauffeur
search & price  ->  approve + assign car/driver ->  acknowledge (or decline)
request (BK1042)    or reject with a reason         arrive (from 3 h before pickup)
                    record payments / refunds       start: customer PIN + odometer
cancel / move       swap car or driver, reschedule  complete: odometer, tolls, parking,
pay UPI or cash     cancel (with refund %)              money collected -> final bill
rate, invoice
```

**Booking statuses:** `pending_approval → confirmed → arrived → in_progress → completed`, plus `rejected` and `cancelled`. Payment status is separate (`unpaid`, `advance_paid`, `partially_paid`, `paid`, `refund_pending`, `partially_refunded`, `refunded`). It is always worked out from the payment records, never typed in by hand.

**Rental types and pricing** (rate card per car class: hatchback, sedan, SUV, MUV):

| Type | Price |
|---|---|
| Hourly local | 4 h / 40 km or 6 h / 60 km package |
| Full day local | 8 h / 80 km or 12 h / 120 km package |
| Airport transfer | Fixed fare up to the included km; pickups include 30 min of waiting |
| Outstation one-way | max(distance, one-way minimum km) × ₹/km + driver allowance (+ night charge) |
| Outstation round trip | max(2 × distance, days × minimum km/day) × ₹/km + allowance × days + nights |

Prices include GST (set in Settings). Each booking stores a snapshot of the rates it was priced with, so later rate changes never change existing bookings. At completion the final bill adds extra km, extra hours (after 15 minutes' grace), GST on those extras, and tolls and parking at actuals.

**Rules the server enforces:**
- **No double booking.** Cars and chauffeurs hold atomic time-slot locks covering the trip, any empty return drive, and a turnaround buffer. Simultaneous requests for the same car, or two admins assigning the same chauffeur at once, can never both succeed.
- **Compliance.** A car is only offered or assigned when its RC, insurance, permit, fitness and PUC are on file and valid until the trip ends. A chauffeur needs an approved account, a valid licence and a verified police check. Expiring documents show on the dashboard.
- **Customer protections.**
  - A customer can't book overlapping trips and can have at most 5 requests waiting.
  - Pickup must be at least 2 h ahead and at most 30 days ahead; both limits are configurable.
  - Requests nobody approves before pickup are closed automatically, and the car is released.
- **Cancellation policy** (configurable):
  - Free before confirmation.
  - Full refund more than 24 h before pickup; 50% between 6 and 24 h; none under 6 h.
  - The charge is never more than what the customer has paid.
  - Admins choose the refund share when they cancel, and must confirm before cancelling a trip that is under way.
- **Admin roles.**
  - Super admin: everything, including rates, settings, the admin team and the audit log.
  - Operations: bookings, fleet, chauffeurs and payments.
  - Support: tickets, plus read-only access to bookings and people.
  - Role changes apply immediately, and the last super admin can't be removed.
- **Safety.**
  - A 4-digit PIN is needed to start the trip.
  - SOS during the trip creates an urgent ticket and offers one tap to call 112 or text a trusted contact.
  - Chauffeurs can report breakdowns or accidents as urgent tickets.
  - Chauffeurs only ever see their own trips.

Other features: printable invoice/booking summary, ratings with low scores flagged, fleet owners with agreement terms, booking references (`BK1001`…), notifications at every step, help centre tickets linked to a booking, and an assistant that answers from live rates and policies.

## Run locally

Prerequisites: Node 20+ and MongoDB Community Server installed locally.

```bash
cd backend
npm install                 # API
cp .env.example .env        # then set JWT_SECRET and JWT_REFRESH_SECRET to long random strings
npm run db:local            # terminal 1: private MongoDB on 127.0.0.1:27027 (data in backend/.localdb)
npm run seed -- --reset     # synthetic demo data (refuses to run against a non-local database)
npm run dev                 # terminal 2: API on http://localhost:5000

cd frontend
npm install                 # web app
npm run dev                 # terminal 3: web app on http://localhost:5173
```

Demo accounts (password `Demo@1234`):

| Role | Usernames |
|---|---|
| Admins (sign in at `/admin/login`) | `admin` (super), `ops` (operations), `support` (support) |
| Customers | `asha`, `rohan`, `priya`, `vikram` |
| Chauffeurs | `ravi`, `sunil`, `imran` (licence expiring soon), `manoj` (police check pending, cannot be assigned), `deepak` (application pending) |

The seed covers every state: requests waiting for approval, confirmed trips (acknowledged and not), a trip under way, completed trips with final bills, a cancelled booking with a refund due, a rejected request, a car in maintenance, a car with an expired PUC, and a partner agreement ending soon.

Without SMTP settings, password-reset emails are printed in the API console.

### Fully offline local run

Nothing leaves the machine with these settings: landmark search and straight-line route estimates instead of OpenStreetMap services, no map tiles, no AI, no Stripe, no SMTP. A separate database name keeps your normal dev data untouched.

```bash
cd backend
npm run db:local
MONGO_DB_NAME=ride-it-qa npm run seed -- --reset
MONGO_DB_NAME=ride-it-qa GEO_PROVIDER=offline AI_BASE_URL= STRIPE_SECRET_KEY= SMTP_HOST= node server.js
cd ../frontend && VITE_MAP_TILES=off npx vite
```

### Switching instant rides back on

Set `RIDES_ENABLED=true` on the API. The Ride page, multi-stop rides, Darshan Circuits, promo codes, live trip sharing and the driver ride pool all come back, and the web app adapts automatically through `/api/meta`.

## Scripts

Run these inside `backend/` (the last one inside `frontend/`):

| Command | What it does |
|---|---|
| `npm test` | API test suite against an in-memory MongoDB |
| `npm run db:local` | Starts a private `mongod` (port 27027, data in `.localdb/`) |
| `npm run seed [-- --reset]` | Synthetic demo data, local databases only |
| `npm run create-admin -- --username … --email … --name … --phone …` | Creates a super admin; password comes from `ADMIN_PASSWORD` |
| `npm run backup` | Exports every collection to `backups/` (Extended JSON) |
| `npm run migrate -- --apply` | Fixes v1 data and creates every database index (run after deploys) |
| `npm run build` (in `frontend/`) | Production build of the web app |

## Project layout

```
backend/     API: src/config, src/core (shared plumbing), src/modules/<feature>, scripts/, tests/
frontend/    Web app: src/app (shell), src/shared (reusable), src/features/<area>
docs/        ARCHITECTURE.md (full project map), DEPLOYMENT.md, SECURITY.md
```

Every backend feature folder uses the same file names (`<thing>.model.js`, `.routes.js`, `.service.js`)
and every web page ends in `Page.jsx`. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full
map and a "where to find…" table.
