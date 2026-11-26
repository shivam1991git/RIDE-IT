# Project map

RIDE-IT is two apps in one repository:

```
RIDE-IT/
├── backend/     Node + Express + MongoDB API   (deployed on Render, Root Directory = backend)
├── frontend/    React + Vite web app           (deployed on Vercel, Root Directory = frontend)
├── docs/        this map, deployment and security notes
└── README.md    what the product does and how to run it
```

## Naming rules

| Kind of file | Pattern | Example |
|---|---|---|
| Database model (Mongoose) | `<thing>.model.js` | `booking.model.js` |
| HTTP endpoints (Express router) | `<thing>.routes.js` | `rental.routes.js` |
| Business logic, no HTTP | `<thing>.service.js` | `rental.service.js` |
| Middleware | `<thing>.middleware.js` | `auth.middleware.js` |
| React page (has a URL) | `<Name>Page.jsx` | `BookRentalPage.jsx` |
| React part of a page | `<Name>.jsx` in `components/` | `TripActions.jsx` |
| React hook | `use<Name>.js` | `useAppConfig.js` |

Rule of thumb: **routes** validate input and send the response; **services** hold the rules;
**models** describe what is stored. Routes call services; services call models.

## Backend

```
backend/
├── server.js                 starts HTTP + Socket.IO, connects MongoDB, runs background sweeps
├── src/
│   ├── app.js                Express app: security middleware, mounts every module's routes
│   ├── config/
│   │   ├── env.js            all settings read from environment variables (one place)
│   │   └── database.js       MongoDB connection
│   ├── core/                 shared building blocks, no business rules
│   │   ├── http.js           HttpError, asyncHandler, paginate, escapeRegex
│   │   ├── validation.js     shared zod schemas (phone, email, password, place…)
│   │   ├── geo-math.js       distance and rounding helpers
│   │   └── middleware/
│   │       ├── auth.middleware.js     requireAuth, optionalAuth, allowAdmin (admin roles)
│   │       └── request.middleware.js  validate, rate limiter, error handler, origin guard
│   └── modules/              one folder per feature
│       ├── auth/             sign in / up, sessions, password reset
│       ├── accounts/         User, Driver, Admin models; profile, saved places, tickets
│       ├── rentals/          chauffeur rentals (Phase 1)
│       │   ├── rental.routes.js               customer: options, search, request, cancel terms, reschedule
│       │   ├── rental.service.js              trip planning, pricing, slots, compliance, cancellation, payments
│       │   ├── rental-operations.service.js   approve, reject, assign driver, change car, payments, complete
│       │   └── rental-rate.model.js           rate card per car class + package definitions
│       ├── bookings/         shared by rentals and rides
│       │   ├── booking.model.js               the booking document (all statuses)
│       │   ├── booking.routes.js              list, view, cancel, rate, SOS
│       │   ├── booking-lifecycle.service.js   state machine (transitionBooking) + background sweeps
│       │   ├── booking-viewer.service.js      getBookingForViewer: what each role may see
│       │   └── booking-counter.model.js       BK1001… reference numbers
│       ├── drivers/          chauffeur app: assignments, acknowledge/decline, arrive, start, complete, report issue
│       ├── admin/            admin console API (dashboard, bookings, people, fleet, pricing, settings, support)
│       ├── fleet/            Car and FleetOwner models
│       ├── payments/         manual Payment records; Stripe (card) for instant rides
│       ├── settings/         business rules editable by super admins (GST, policy, UPI…)
│       ├── rides/            instant rides (off in Phase 1): fares, promos, circuits, trip sharing
│       ├── catalog/          public lookups: places, service area, /api/meta
│       ├── geo/              place search and routing (OpenStreetMap or offline)
│       ├── notifications/    in-app notifications, Socket.IO, email
│       ├── support/          SupportTicket and Feedback models
│       ├── audit/            AuditLog model + recordAudit
│       └── chat/             help assistant
├── scripts/                  seed, backup/restore, create-admin, migrate-and-index, local-db, build-atlas-data
└── tests/
    ├── api/                  Jest + Supertest suites (rentals.test.js covers Phase 1)
    └── setup/                test environment and helpers
```

### Where to find…

| I want to change… | Open |
|---|---|
| Prices, packages, GST, extra km | `modules/rentals/rental.service.js` → `priceTrip`, `calculateFinalBill` |
| Cancellation refund rules | `rental.service.js` → `getCancellationTerms` (numbers in Settings) |
| What blocks a car or driver | `rental.service.js` → `getCarComplianceIssue`, `getDriverComplianceIssue` |
| Double-booking protection | `rental.service.js` → `reserveSlot`, `releaseSlot`, `moveSlot` |
| Allowed status changes | `modules/bookings/booking-lifecycle.service.js` → `TRANSITIONS` |
| Approving / assigning | `modules/rentals/rental-operations.service.js` |
| Who can see which booking fields | `modules/bookings/booking-viewer.service.js` |
| Admin role permissions | `modules/admin/admin.routes.js` (`SUPER`, `OPERATE`, `SUPPORT`) |
| Environment variables | `src/config/env.js` and `backend/.env.example` |

## Frontend

```
frontend/src/
├── main.jsx                  entry: providers + router
├── app/                      the shell around every page
│   ├── App.jsx               all routes (URL → page)
│   ├── theme.js, global.css  look and feel
│   ├── layout/               header, footer, logo, notification bell
│   └── providers/            auth session, toasts, live updates, light/dark mode
├── shared/                   reusable, not tied to one feature
│   ├── api/                  apiClient.js (fetch wrapper), useAppConfig.js (/api/meta, rental options)
│   ├── utils/format.js       money, dates, status labels
│   └── components/           ui.jsx (StatusChip, FareBreakdown…), BarChart, map/, vehicles/
└── features/                 one folder per area of the product
    ├── home/                 LandingPage, NotFoundPage, hero animation
    ├── auth/                 Login, Register, DriverSignup, Forgot/Reset password
    ├── rentals/              BookRentalPage (3-step booking), RentalBookingDetails, ReceiptPage
    ├── bookings/             MyBookingsPage, BookingDetailsPage, TripActions (SOS, rating)
    ├── driver/               DriverDashboardPage, DriverJobPage, ChauffeurJobDetails
    ├── admin/                AdminLayout (menu + routes), pages/*Page.jsx, components/adminShared.jsx
    ├── account/              AccountPage
    ├── support/              HelpCenterPage
    ├── assistant/            ChatWidget
    └── rides/                BookRidePage, SharedTripPage, CardPaymentDialog (instant rides)
```

### Where to find…

| Screen | File |
|---|---|
| Home page | `features/home/LandingPage.jsx` |
| Book a car (customer) | `features/rentals/BookRentalPage.jsx` |
| A customer's booking page | `features/rentals/RentalBookingDetails.jsx` (opened via `features/bookings/BookingDetailsPage.jsx`) |
| Invoice | `features/rentals/ReceiptPage.jsx` |
| Chauffeur dashboard / trip | `features/driver/DriverDashboardPage.jsx`, `ChauffeurJobDetails.jsx` |
| Admin bookings desk | `features/admin/pages/BookingsPage.jsx` |
| Admin menu and access by role | `features/admin/AdminLayout.jsx` |
| Every URL | `app/App.jsx` |
