# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Indulge** — a B2B marketplace where hospitality businesses (hotels, banquet venues,
caterers, event companies) rent out idle resources to each other: halls, parking,
vehicles, kitchen hours, furniture, AV kits, crew.

Every account is **both sides of the marketplace at once**. There is no role field on
`User` — whether you are a provider or a seeker is decided by context (resources you
own vs. requests you make). Do not add a role field; several routes assume this.

Hackathon prototype. Payments are simulated end to end.

## Commands

```bash
# API — http://localhost:5050
cd server && npm install && npm run dev

# Web — http://localhost:5173
cd client && npm install && npm run dev
```

**Port 5050, not 5000** — macOS AirPlay Receiver occupies 5000.

```bash
cd server && npm run verify   # ~370-check end-to-end suite — the only test suite
cd server && npm run seed     # re-seed the database
cd client && npm run build    # production build (also the fastest syntax check)
```

### Running the tests

`npm run verify` boots the real API on an ephemeral port against a freshly seeded
in-memory MongoDB and drives it over HTTP — it exercises real routes, not services in
isolation. There is no test framework and **no way to run a single test**; it is one
script, `server/src/seed/verify.js`, with a hand-rolled `check(label, condition)`
helper. To narrow it while debugging, comment out sections or add checks near the
relevant `console.log('\nSection name')` marker.

Force it onto the in-memory DB regardless of local config:

```bash
cd server && MONGO_URI= npm run verify
```

**Any change to booking, availability, ranking, cart, or requirement logic must keep
all of them passing.** Add checks for new rules rather than only testing by hand.

### Database

With `MONGO_URI` unset the server starts an **in-memory MongoDB and auto-seeds it**, so
it boots on a machine with nothing installed and every run starts from a known state.
Set `MONGO_URI` in `server/.env` (gitignored; see `server/.env.example`) to persist to
Atlas, then `npm run seed` once.

All seeded accounts use password **`indulge123`**. `ops@grandorchid.in` is the richest
demo login (owns listings, has incoming requests).

### Admin accounts are not businesses

Platform admins live in their own `Admin` collection (`server/src/models/Admin.js`),
sign in at `/admin/login` → `POST /api/admin/auth/login`, and carry a JWT typed
`{ type: 'admin' }` (business tokens are `{ type: 'business' }`; untyped legacy
tokens count as business). `requireAuth` refuses admin tokens with 403;
`requireAdmin` accepts *only* admin tokens and answers 404 to a business token.
The client keeps the two sessions apart: `AuthContext` + `api` (`indulge.token`)
vs `AdminAuthContext` + `adminApi` (`indulge.adminToken`). Admin query hooks must
use `adminApi`. Never re-introduce a "business that is also an admin" override on
a business route — the console reads across tenants through `/api/admin/*`.

Seeded dev admin: `admin@indulge.com` / `indulge123` (upserted, never duplicated).

### Request story log (admin Live tracker)

Admin → Live rows expand into the full story of a request
(`server/src/services/live-timeline.service.js`, `GET /api/admin/live/:kind/:id/timeline`,
client `components/admin/LiveTimeline.jsx`). Most of it comes from records that
already carry timestamps; **status decisions** (accept, reject, confirm, cancel,
complete, counter-offer accepted, proposal revised/withdrawn/awarded, RFQ
edited/closed/cancelled) come from the append-only `RequestEvent` log, written by
`recordEvent()` in the routes that make them. **If you add a new status transition
to a booking, proposal, offer or requirement, record an event for it** or the
tracker will show the new state with no actor or time. `recordEvent` never throws,
so it cannot break the action it logs. Never pad the story: a time that was not
recorded must stay `null`.

## Architecture

Two independent apps in one repo — `client/` (React + Vite) and `server/`
(Express + Mongoose). No shared package, no workspace tooling. They are deployed as
two separate services.

### The two rules everything else is built around

**1. Availability — `server/src/services/availability.service.js`**

This is the most load-bearing file in the project. A resource has a `totalQuantity`
(`1` for a hall, `300` for a stack of chairs). Availability for a window is
`totalQuantity − peak concurrent reservation`, computed with a **sweep line over
booking boundaries, not a sum**. Summing double-counts two bookings that never
actually overlap inside a wider requested window and wrongly reports the resource as
full — do not "simplify" it back to a sum.

One rule produces both behaviours: a single hall blocks on any overlap, while 300
chairs with 180 committed still accept 100 and refuse 200.

- Only `HARD_RESERVED_STATUSES` (`accepted`, `confirmed`) consume capacity. `pending`
  deliberately does not, so negotiation stays flexible.
- Touching endpoints are not an overlap — 09:00–13:00 and 13:00–17:00 coexist.
- **Availability is re-validated immediately before every write** — cart checkout,
  provider accept, and requirement-offer accept all re-check, because time passes
  between browsing and committing. Never trust a client-supplied score or an earlier
  check.
- `availabilityWindows` on a resource is a *separate* concept: when it is offered at
  all, versus what has already been taken. Empty means always bookable.

**2. Ranking — `server/src/services/matching.service.js` + `server/src/utils/scoring.js`**

Five factors, each normalised 0–1, combined by the weights in `WEIGHTS`
(price .30, distance .25, availability .20, capacity .15, urgency .10), plus a
`PREFERENCE_BONUS` of .05 for a preferred provider.

`priceFit` is **min-max normalised across the result set**, so "good value" means good
relative to the alternatives actually on screen — scores are therefore not comparable
between different searches, by design.

Every sub-score is returned with the result and rendered by
`client/src/components/MatchBreakdown.jsx` under "Why this match?". The breakdown is
also snapshotted onto the `Booking`, so months later you can still see why a supplier
was chosen. **If you change the weights or add a factor, update `FACTOR_LABELS` and
`FACTOR_WEIGHTS` in `client/src/lib/constants.js` or the UI will silently misreport
the maths.**

### Search pipeline

`server/src/routes/search.routes.js` — order matters:

```
$geoNear (MUST be first stage)  →  attribute filters  →  availability drop-out  →  rankResources
```

`$geoNear` cannot be moved later in a Mongo aggregation. Everything after it is
optional, so a signed-out user with no coordinates still gets results (unranked by
distance).

### Both sides of the marketplace

- **Forward** (`/s`): search listings, add to a multi-provider cart, checkout fans out
  into **one `Booking` per cart line**, grouped by provider. Unavailable lines are
  reported back and left in the cart rather than failing the whole checkout.
- **Reverse** (`/requirements`): a seeker posts what they need; providers browse
  `/requirements/board` and offer one of their own listings. The same availability
  validation guards the offer, so nobody can offer capacity they do not have.
  Accepting an offer creates an `accepted` Booking **plus its Transaction** and
  auto-declines the rest.

Both paths must produce equivalent state. A booking created either way carries a
Transaction — this was a real bug once.

### Client conventions

- **React Query owns all server state.** Hooks live in `client/src/hooks/queries.js`;
  add new ones there rather than calling `api` from components. Mutations invalidate
  broadly rather than surgically.
- Auth is a JWT in `localStorage`; `AuthContext` holds only the session.
- Socket.io pushes notifications, with a 30s React Query poll behind it — a dropped
  socket degrades to slower refresh instead of breaking.
- **Design system is minimal and centralised.** Tokens in `client/tailwind.config.js`,
  component classes (`.btn-primary`, `.card`, `.field`, `.shell`, `.h-page`) in
  `client/src/styles/index.css`. Use those classes; avoid one-off hex values — a
  previous Amazon-styled skin was stripped out entirely and stray literals reintroduce
  it. Nohemi (Black weight only) is reserved for the `.wordmark`; body copy uses the
  system stack.
- The landing page runs a **265-frame scroll-scrubbed canvas animation**
  (`client/src/components/ScrollSequence.jsx`, frames in `client/public/landing/`,
  27 MB of JPEGs — ~35 MB once built). Every frame is preloaded before the animation
  plays, which is instant locally but slow over a network. It pulls itself up under
  the sticky header via `HEADER_H` — **if you change the header height, change that
  constant** or the intro stops being full-bleed.

## Deployment (Railway, two services)

Deployed as two services from this one repo, each with its **Root Directory** set
(`server` and `client`) — Railpack cannot build from the repo root, there is no
`package.json` there.

Frontend build command `npm run build`, start command
`npm run preview -- --host 0.0.0.0 --port $PORT`.

Environment:

| Service | Variables |
|---|---|
| server | `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES`, `CLIENT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| client | `VITE_API_URL`, `VITE_SOCKET_URL` |

Traps that have each cost real debugging time:

- **`VITE_*` values are inlined at build time.** Changing one requires a rebuild, not
  just a restart.
- Hosting dashboards show domains **without a scheme**. A schemeless `VITE_API_URL` is
  treated by axios as a relative path, so calls hit the frontend's own origin, get
  `index.html` back with a **200**, and every page renders empty with no error.
  `normaliseBase()` in `client/src/api/client.js` now repairs this and an interceptor
  throws if the API ever returns HTML — leave both in place.
- `CLIENT_URL` drives CORS for **both** REST (`app.js`) and Socket.io
  (`sockets/index.js`). If it does not exactly match the frontend origin (no trailing
  slash), the browser discards every response while `curl` works fine.
- Atlas refuses connections from non-allowlisted IPs and the server **exits** on a
  failed DB connect, producing a crash loop. Railway needs `0.0.0.0/0` under Atlas
  Network Access.
- `vite preview` rejects unknown `Host` headers; deployment domains must be in
  `preview.allowedHosts` in `client/vite.config.js`.
- **Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the server service or there is no
  usable admin.** On every boot the API upserts that `Admin` account (idempotent;
  changing `ADMIN_PASSWORD` rotates it on the next deploy). Railpack sets
  `NODE_ENV=production`, and production refuses the published demo password
  `indulge123` at admin login — so a seeded `admin@indulge.com` cannot open the
  console on a public deployment. The API prints at startup whether the console
  is enabled and whether the bootstrap ran, so check the deploy log first. The
  old `ADMIN_EMAILS` name is still read (first address only) as an alias; the
  singular wins if both are set. It no longer grants any *business* account
  admin rights — that allowlist model is gone.

## Prototype boundaries

Deliberately out of scope — do not treat these as bugs:

- Payments are simulated (`Transaction` marked `simulated_paid`, no gateway).
- Businesses pick from **preset city coordinates**; there is no geocoding, so distance
  ranking is real but addresses are not resolved.
- Images are hotlinked from Unsplash; there is no upload pipeline.
- Transport cost is agreed between parties and excluded from estimates.
