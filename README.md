# Indulge — B2B Hospitality Resource Exchange

Hotels, banquet venues, caterers and event companies sit on assets that are idle most
of the week — halls, parking, vehicles, kitchen hours, furniture, AV kits — while the
business down the road is paying a broker for exactly those things. Discovery today
happens over WhatsApp and phone calls, so nobody knows what is free nearby, when, or
for how much.

**Indulge** turns that into a marketplace. Any business is both sides of it at once:
list what you are not using, request what you are short of. Search feels like
consumer e-commerce on purpose — filter rail, ranked results, a buy box, a cart,
an orders page — because that is the interaction hospitality buyers already know.

---

## Running it

Two terminals, no database installation required.

```bash
# 1 — API  (http://localhost:5050)
cd server && npm install && npm run dev

# 2 — Web  (http://localhost:5173)
cd client && npm install && npm run dev
```

Open **http://localhost:5173** and sign in with any seeded business:

| Email | Business | Good for showing |
|---|---|---|
| `ops@grandorchid.in` | The Grand Orchid Hotel | provider inbox — has pending requests waiting |
| `desk@kalpataruevents.in` | Kalpataru Events Co. | seeker side — cart, history, reviews |
| `events@seasonsbanquet.in` | Seasons Banquet | owns the flagship ballroom |
| `rentals@silverline.in` | Silverline Rentals | an open negotiation thread |

Password for all seeded accounts: **`indulge123`**

**Database.** With no `MONGO_URI` set, the server starts an in-memory MongoDB and
seeds it automatically, so it boots on a machine with nothing installed. Data resets
on restart, which also means every demo starts from a clean, known state. To persist
instead, put a real connection string in `server/.env`:

```
MONGO_URI=mongodb://localhost:27017/indulge
JWT_SECRET=change-me
```

Then `npm run seed` once to populate it.

> Port 5050, not 5000 — macOS AirPlay Receiver occupies 5000.

---

## Verifying it

```bash
cd server && npm run verify
```

Boots the real API against a seeded in-memory database and drives it over HTTP —
37 checks covering auth, ranking, double-booking prevention, partial allocation,
minimum hire periods, cart checkout, the booking lifecycle, negotiation, reviews and
analytics. All 37 should pass.

---

## How the interesting parts work

### Preventing double-bookings

`server/src/services/availability.service.js`

A resource carries a `totalQuantity`: `1` for a hall, `300` for a stack of chairs.
Availability for a window is `totalQuantity − peak concurrent reservation`, computed
with a sweep line over booking boundaries rather than a plain sum — summing would
double-count two bookings that never actually overlap inside a wider requested window
and wrongly report the resource as full.

The consequence is that both cases fall out of one rule:

- a hall with one confirmed booking is blocked for any overlapping request
- 300 chairs with 180 committed still accepts a request for 100, and refuses 200

Touching endpoints are not an overlap, so a hall can run 09:00–13:00 and 13:00–17:00
on the same day. Availability is re-checked immediately before every write — cart
checkout and provider-accept both — because time passes between browsing and
committing, and somebody else may have taken the slot.

### Ranking

`server/src/services/matching.service.js`, `server/src/utils/scoring.js`

Five factors, each normalised to 0–1, combined by weight:

```
score = 0.30·price + 0.25·distance + 0.20·availability
      + 0.15·capacity + 0.10·urgency      (+0.05 if you have used this provider before)
```

- **price** — min-max against the other results, so "good value" means good *relative
  to the alternatives you are actually choosing between*
- **distance** — linear decay to zero at your search radius, from a `$geoNear` stage
- **availability** — rewards slack; the last unit is worth less than one of ten
- **capacity** — rewards a tight fit, penalises a 500-seat hall for 40 guests
- **urgency** — under time pressure, favours resources with no competing requests

Every sub-score is returned with the result and rendered under **"Why this match?"**,
so ranking is auditable rather than a black box — and the same breakdown is snapshotted
onto the booking, so months later you can still see why that supplier was chosen.

### The cart

Event procurement is rarely one item — you need the hall *and* the chairs *and* the
AV kit. The cart holds resources from several providers with per-line dates and
quantities, revalidates each one on view, and at checkout fans out into one request
per line, grouped by provider. Lines that have become unavailable are reported back
and left in the cart rather than failing the whole checkout.

---

## Layout

```
server/src/
  models/         User, Resource, Cart, Booking, Negotiation, Review,
                  Notification, Transaction
  services/       availability (conflicts) · matching (ranking) · notification
  routes/         auth, resources, search, cart, bookings, negotiations,
                  reviews, notifications, analytics
  seed/           seed.js (demo corpus) · verify.js (end-to-end checks)

client/src/
  components/ui/      Button, Card, Panel, Stars, Price, badges
  components/layout/  Header, Footer, Logo
  components/         ResourceCard, MatchBreakdown, HeroCarousel,
                      AvailabilityCalendar
  pages/              Home, Search, ResourceDetail, Cart, Checkout,
                      Bookings, BookingDetail, Listings, ListingForm,
                      Analytics, Account, Profile, Notifications,
                      ProviderProfile, PostRequirement
```

React Query owns all server state, with a 30s poll behind the Socket.io notification
channel so a dropped connection degrades instead of breaking. Auth is a JWT in
`localStorage`; context holds only the session.

---

## Demo route

1. **Home** — the interface is deliberately familiar. Point at the match badge sitting
   where a discount badge normally goes.
2. **Search "banquet hall"** — walk the filter rail, then open *Why this match?* on the
   top two results and explain why #1 beat #2. This is the part that is not a skin.
3. **Cart** — add hall + chairs + AV kit, check out, watch three requests fan out to
   two providers.
4. **Switch to the provider** — live notification arrives, accept the request.
5. **Try to book the same hall again for those dates** — refused. Then request 200 of
   the 120 remaining chairs — also refused, with the real number.
6. **Negotiation** — counter-offer on an open request, accept the terms.
7. **Analytics** — utilisation is low by design on some listings. That number *is* the
   pitch: the asset is idle, and this is what the exchange exists to fix.

---

## Prototype boundaries

Deliberately out of scope, and where they would go:

- **Payments** are simulated. A `Transaction` is created on accept and marked
  `simulated_paid` on confirm; no gateway is wired in.
- **Geocoding** — businesses pick from preset city coordinates rather than an address
  lookup, so distance ranking is real but addresses are not resolved.
- **Images** are hotlinked from Unsplash; there is no upload pipeline.
- **Transport pricing** is agreed between the parties; the estimate does not include it.

Indulge uses a widely-recognised marketplace visual language with its own wordmark and
copy. It is a hackathon prototype and is not affiliated with any existing marketplace.
