# RIDE-IT

Point-to-point rides and hourly car rentals across Varanasi. Riders book Auto, Mini, Sedan or SUV rides at server-computed fares; verified drivers accept, arrive, start the trip with the rider's PIN and complete it; admins verify drivers, manage the fleet and pricing, and handle support. A built-in assistant answers questions and looks up the signed-in rider's own bookings.

## Stack

| Layer | Technology |
|---|---|
| Web app | React 18, Vite 6, MUI 7, TanStack Query 5, React Router 7, Leaflet (OpenStreetMap), React Three Fiber (lazy hero), Framer Motion, Stripe Elements, Socket.IO client |
| API | Node 20+, Express 4, Mongoose 8, zod 4, helmet, express-rate-limit, Socket.IO, Stripe, Nodemailer |
| Data | MongoDB (Atlas in production, a private local `mongod` in development) |
| Tests | Jest + Supertest + mongodb-memory-server (66 API tests) |

## Features

- **Rides:** place search (curated Varanasi landmarks plus OpenStreetMap search), current location, real road routing (OSRM) with a straight-line fallback, fares for every category, one active ride per rider, 4-digit PIN to start, live status, cancellation, ratings, 10-minute request expiry.
- **Rentals:** hourly booking for 1 hour to 7 days, booked up to 15 days ahead, optional chauffeur, overlap-safe reservations, cancellation before the start time.
- **Drivers:** a three-step application and admin verification, an online toggle, live request feed sorted by distance, accept/release/arrive/start/complete, cash confirmation, and an earnings dashboard.
- **Admin:** stats and charts, bookings (cancel/complete), driver approval, customers, admins, rental fleet, pricing editor, support tickets, app feedback, audit log.
- **Accounts:** sign-up and sign-in per role, forgot/reset password by email, change password, sign out everywhere, saved places, notifications.
- **Payments:** cash, or card through Stripe (test mode) with server-side verification and refunds when a booking is cancelled.
- **Assistant:** works with no AI key at all (rules plus verified data); an optional free-tier LLM handles open-ended questions. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#chat-assistant).

## Run locally

Prerequisites: Node 20+ and MongoDB Community Server (any recent version) installed locally.

```bash
npm install                 # API
npm install --prefix client # web app
cp .env.example .env        # then set JWT_SECRET and JWT_REFRESH_SECRET to long random strings

npm run db:local            # terminal 1: private MongoDB on 127.0.0.1:27027 (data in ./.localdb)
npm run seed -- --reset     # synthetic demo data (refuses to run against a non-local database)
npm run dev                 # terminal 2: API on http://localhost:5000
npm run client              # terminal 3: web app on http://localhost:5173
```

Demo accounts (password `Demo@1234`):

| Role | Usernames |
|---|---|
| Admin (sign in at `/admin/login`) | `admin` |
| Riders | `asha`, `rohan`, `priya` |
| Drivers | `ravi` (Mini, online), `sunil` (Sedan), `imran` (Auto), `manoj` (SUV), `deepak` (pending approval) |

Without SMTP settings, password-reset emails are printed in the API console.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | API test suite against an in-memory MongoDB |
| `npm run db:local` | Starts a private `mongod` (port 27027, data in `.localdb/`) |
| `npm run seed [-- --reset]` | Synthetic demo data, local databases only |
| `npm run create-admin -- --username … --email … --name … --phone …` | Creates an admin; password comes from `ADMIN_PASSWORD` |
| `npm run migrate [-- --apply]` | v1 → v2 data migration (dry run by default) |
| `npm run build --prefix client` | Production build of the web app |

## Project layout

```
server.js               HTTP server, Socket.IO, ride-expiry sweeper
src/app.js              Express app: security middleware and routes
src/routes/             auth, catalog (geo/fares/cars), booking, driver, admin, account, payments, chat
src/services/           fare engine, geo/routing, booking state machine, payments, chat, notifications
src/models/             accounts (user/driver/admin), Car, Booking, misc (fares, notifications, tickets, audit, feedback)
scripts/                local-db, seed, create-admin, migrate-v2
tests/                  Jest + Supertest suites
client/src/             React app: pages/, components/, providers/, lib/
docs/                   deployment and security notes
```

## How a ride works

`requested → accepted → arrived → in_progress → completed`, with `cancelled` (by the rider or an admin, before the trip starts) and `expired` (no driver within 10 minutes). Every transition is one atomic, status-guarded MongoDB update. Two drivers racing for the same ride, or a rider double-tapping "Book", can never both succeed. Partial unique indexes enforce one active ride per rider and one active job per driver.

Fares are always computed on the server: `max(base + perKm × km + perMin × min, minimum)`, rounded to the rupee. Prices for each category are editable in the admin console.
