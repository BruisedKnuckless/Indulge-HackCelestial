/**
 * End-to-end check of the rules the marketplace depends on.
 * Run with: npm run verify
 *
 * Boots the API on an ephemeral port against a seeded in-memory database and
 * drives it over HTTP, so this exercises the real routes rather than the
 * services in isolation.
 */
import http from 'http';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { runSeed } from './seed.js';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import LogisticsJob from '../models/LogisticsJob.js';
import Requirement from '../models/Requirement.js';
import {
  generateProcurementPlans,
  filterNonDominatedPlans,
  doesPlanDominate,
} from '../services/procurement-solver.service.js';
import { rankResources } from '../services/matching.service.js';

let base = '';
let passed = 0;
let failed = 0;

const DAY = 24 * 3600 * 1000;
function at(daysFromNow, hour = 9, minute = 0) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function nextDayOfWeek(targetDay, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== targetDay) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json };
}

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

async function login(email) {
  const { body } = await api('POST', '/api/auth/login', {
    body: { email, password: 'indulge123' },
  });
  return body.token;
}

async function main() {
  await connectDB();
  await runSeed({ quiet: true });

  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;

  console.log('\nIndulge — end-to-end verification\n');

  // ---- auth ----
  console.log('Auth');
  const orchid = await login('ops@grandorchid.in');
  const seasons = await login('events@seasonsbanquet.in');
  const kalpataru = await login('desk@kalpataruevents.in');
  check('demo accounts log in', Boolean(orchid && seasons && kalpataru));

  const bad = await api('POST', '/api/auth/login', {
    body: { email: 'ops@grandorchid.in', password: 'wrong' },
  });
  check('wrong password is rejected', bad.status === 401);

  const noAuth = await api('GET', '/api/bookings/sent');
  check('protected route requires a token', noAuth.status === 401);

  // ---- search + ranking ----
  console.log('\nSearch & ranking');
  const search = await api(
    'GET',
    `/api/search/resources?category=banquet_space&radiusKm=40&start=${at(30, 10)}&end=${at(30, 22)}&minCapacity=200`,
    { token: orchid }
  );
  check('search returns ranked results', search.body.results?.length > 0);

  const results = search.body.results || [];
  const scores = results.map((r) => r.matchScore);
  check('every result carries a match score', scores.every((s) => typeof s === 'number'));
  check(
    'results are sorted best-match first',
    scores.every((s, i) => i === 0 || scores[i - 1] >= s),
    `got ${scores.map((s) => s?.toFixed(2)).join(', ')}`
  );
  check(
    'score breakdown is exposed for explainability',
    Boolean(results[0]?.matchBreakdown?.priceFit !== undefined && results[0]?.matchReasons?.length)
  );
  check(
    'capacity filter excludes undersized resources',
    results.every((r) => !r.capacity || r.capacity >= 200)
  );

  // ---- double-booking prevention (quantity = 1) ----
  console.log('\nDouble-booking prevention (single-unit resource)');
  const ballroom = (
    await api('GET', '/api/search/resources?q=Crystal%20Grand', { token: orchid })
  ).body.results[0];

  // The seed put a confirmed booking on this hall 14 days out.
  const clash = await api('POST', '/api/bookings', {
    token: orchid,
    body: {
      resourceId: ballroom._id,
      quantity: 1,
      startDateTime: at(14, 12),
      endDateTime: at(14, 20),
    },
  });
  check('overlapping request on a booked hall is refused', clash.status === 409, JSON.stringify(clash.body));

  const freeDay = await api('POST', '/api/bookings', {
    token: orchid,
    body: {
      resourceId: ballroom._id,
      quantity: 1,
      startDateTime: at(16, 10),
      endDateTime: at(16, 20),
    },
  });
  check('a clear date on the same hall is accepted', freeDay.status === 201, JSON.stringify(freeDay.body));

  // ---- partial allocation (quantity = N) ----
  console.log('\nPartial allocation (multi-unit resource)');
  const chairs = (await api('GET', '/api/search/resources?q=Chiavari', { token: orchid })).body
    .results[0];

  // 300 total; seed holds 180 across this window, leaving 120. The window is
  // 10h because these chairs carry an 8h minimum hire.
  const window = { startDateTime: at(14, 12), endDateTime: at(14, 22) };

  const fits = await api('POST', '/api/bookings', {
    token: orchid,
    body: { resourceId: chairs._id, quantity: 100, ...window },
  });
  check('a request within remaining stock succeeds', fits.status === 201, JSON.stringify(fits.body));

  const tooMany = await api('POST', '/api/bookings', {
    token: orchid,
    body: { resourceId: chairs._id, quantity: 200, ...window },
  });
  check('a request beyond remaining stock is refused', tooMany.status === 409, JSON.stringify(tooMany.body));

  // ---- minimum rental period ----
  console.log('\nBooking rules');
  const tooShort = await api('POST', '/api/bookings', {
    token: orchid,
    body: {
      resourceId: ballroom._id,
      quantity: 1,
      startDateTime: at(40, 10),
      endDateTime: at(40, 12), // 2h against a 6h minimum
    },
  });
  check('minimum rental period is enforced', tooShort.status === 409, JSON.stringify(tooShort.body));

  const ownListing = await api('POST', '/api/bookings', {
    token: seasons, // Seasons owns the Crystal Grand ballroom
    body: {
      resourceId: ballroom._id,
      quantity: 1,
      startDateTime: at(50, 10),
      endDateTime: at(50, 20),
    },
  });
  check('a business cannot request its own listing', ownListing.status === 400);

  // ---- cart & checkout ----
  console.log('\nRequest cart & checkout');
  const projector = (await api('GET', '/api/search/resources?q=Portable%20Projector', { token: kalpataru }))
    .body.results[0];
  const shuttle = (await api('GET', '/api/search/resources?q=Shuttle', { token: kalpataru })).body
    .results[0];

  const cartWindow = { startDateTime: at(25, 9), endDateTime: at(25, 21) };
  await api('POST', '/api/cart/items', {
    token: kalpataru,
    body: { resourceId: projector._id, quantity: 2, ...cartWindow },
  });
  const cart = await api('POST', '/api/cart/items', {
    token: kalpataru,
    body: { resourceId: shuttle._id, quantity: 1, ...cartWindow },
  });
  check('items add to the cart', cart.body.count === 2, JSON.stringify(cart.body?.count));
  check('cart computes a subtotal', cart.body.subtotal > 0, `subtotal ${cart.body.subtotal}`);

  const checkout = await api('POST', '/api/cart/checkout', {
    token: kalpataru,
    body: { urgency: 'medium', logistics: 'self_pickup' },
  });
  check('checkout creates one booking per line', checkout.body.created === 2, JSON.stringify(checkout.body));

  const emptied = await api('GET', '/api/cart', { token: kalpataru });
  check('cart is emptied after checkout', emptied.body.count === 0);

  const sent = await api('GET', '/api/bookings/sent', { token: kalpataru });
  check(
    'checkout requests appear under sent requests',
    sent.body.bookings.filter((b) => b.status === 'pending').length >= 2
  );

  // ---- lifecycle + notifications + transactions ----
  console.log('\nLifecycle, notifications, transactions');
  const meridian = await login('front@meridianhotel.in');
  const inbox = await api('GET', '/api/bookings/received?status=pending', { token: meridian });
  const target = inbox.body.bookings[0];
  check('provider sees incoming requests', Boolean(target), 'no pending request found for Meridian');

  const accept = await api('PATCH', `/api/bookings/${target._id}/accept`, { token: meridian });
  check('provider can accept', accept.status === 200 && accept.body.booking.status === 'accepted');

  const notifs = await api('GET', '/api/notifications', { token: kalpataru });
  check(
    'seeker is notified of acceptance',
    notifs.body.notifications.some((n) => n.type === 'booking_status_change')
  );

  // ---- payment gateway & idempotency ----
  const wrongPay = await api('PATCH', `/api/bookings/${target._id}/pay`, {
    token: seasons,
    body: { paymentMethod: 'upi' },
  });
  check('unrelated business cannot pay for booking', wrongPay.status === 403);

  const payRes = await api('PATCH', `/api/bookings/${target._id}/pay`, {
    token: kalpataru,
    body: { paymentMethod: 'upi' },
  });
  check(
    'seeker payment confirms booking and settles transaction',
    payRes.status === 200 &&
      payRes.body.booking?.status === 'confirmed' &&
      payRes.body.transaction?.status === 'simulated_paid'
  );

  const idempotentPay = await api('PATCH', `/api/bookings/${target._id}/pay`, {
    token: kalpataru,
    body: { paymentMethod: 'upi' },
  });
  check(
    'duplicate payment on confirmed booking is idempotent',
    idempotentPay.status === 200 && idempotentPay.body.transaction?.status === 'simulated_paid'
  );

  // ---- public business profile ----
  const pubProfile = await api('GET', `/api/auth/users/${target.provider._id}/public`);
  check(
    'public business profile returns safe fields without private credentials',
    pubProfile.status === 200 &&
      Boolean(pubProfile.body.profile?.businessName) &&
      pubProfile.body.profile?.email === undefined &&
      pubProfile.body.profile?.passwordHash === undefined &&
      pubProfile.body.profile?.phone === undefined
  );

  const wrongParty = await api('PATCH', `/api/bookings/${target._id}/cancel`, { token: seasons });
  check('an unrelated business cannot touch the booking', wrongParty.status === 403);

  const complete = await api('PATCH', `/api/bookings/${target._id}/complete`, { token: meridian });
  check('confirmed booking can be completed', complete.status === 200);

  // ---- reviews ----
  console.log('\nReviews');
  const review = await api('POST', '/api/reviews', {
    token: kalpataru,
    body: { bookingId: target._id, rating: 5, comment: 'Smooth handover, kit worked perfectly.' },
  });
  check('review posts on a completed booking', review.status === 201, JSON.stringify(review.body));

  const dupe = await api('POST', '/api/reviews', {
    token: kalpataru,
    body: { bookingId: target._id, rating: 3, comment: 'again' },
  });
  check('a second review from the same party is refused', dupe.status === 409);

  const providerProfile = await api('GET', `/api/reviews/user/${target.provider._id}`);
  check('reviews are readable on the provider profile', providerProfile.body.reviews.length > 0);

  // ---- negotiation ----
  console.log('\nNegotiation');
  const silverline = await login('rentals@silverline.in');
  const negotiations = await api('GET', '/api/bookings/received?status=negotiating', {
    token: silverline,
  });
  const negBooking = negotiations.body.bookings[0];
  check('seeded negotiation exists', Boolean(negBooking));

  const thread = await api('GET', `/api/negotiations/${negBooking._id}`, { token: silverline });
  check('negotiation thread loads', thread.body.messages.length >= 2);

  const counter = await api('POST', `/api/negotiations/${negBooking._id}`, {
    token: silverline,
    body: { type: 'counter_offer', proposedPrice: 30000, message: 'Final offer.' },
  });
  check('counter-offer posts', counter.status === 201);

  // ---- analytics ----
  console.log('\nAnalytics');
  const util = await api('GET', '/api/analytics/utilization', { token: seasons });
  check('utilization report returns rows', util.body.rows?.length > 0);
  check(
    'utilization is a sane percentage',
    util.body.rows.every((r) => r.utilization >= 0 && r.utilization <= 100)
  );

  const summary = await api('GET', '/api/analytics/summary', { token: seasons });
  check('summary tiles compute', typeof summary.body.activeListings === 'number');

  const funnel = await api('GET', '/api/analytics/funnel', { token: seasons });
  check('funnel returns status counts', typeof funnel.body.received === 'object');

  // ---- availability calendar ----
  console.log('\nAvailability calendar');
  const cal = await api(
    'GET',
    `/api/resources/${ballroom._id}/availability?start=${at(13)}&end=${at(18)}`
  );
  const blocked = cal.body.days.filter((d) => d.availableQuantity === 0);
  check('calendar marks the booked day as unavailable', blocked.length >= 1, JSON.stringify(cal.body.days));
  check(
    'calendar leaves other days open',
    cal.body.days.some((d) => d.availableQuantity > 0)
  );

  // ---- reverse marketplace / RFQs ----
  console.log('\nReverse Marketplace & RFQ');
  const rfqWindow = { startDateTime: at(35, 10), endDateTime: at(35, 20) };

  // 1. Authenticated seeker creates RFQ
  const newRfq = await api('POST', '/api/requirements', {
    token: kalpataru,
    body: {
      title: 'Annual Dealer Awards — Need 400 pax Banquet Space',
      category: 'banquet_space',
      description: 'Stage, AC, valet parking required for corporate annual dealer gala.',
      requiredQuantity: 1,
      minCapacity: 350,
      maxBudget: 90000,
      radiusKm: 30,
      urgency: 'medium',
      ...rfqWindow,
    },
  });
  check('authenticated seeker can create an RFQ', newRfq.status === 201 && newRfq.body.requirement?.status === 'open');

  const createdRfqId = newRfq.body.requirement?._id;

  // 2. Unauthenticated RFQ creation
  const noAuthRfq = await api('POST', '/api/requirements', {
    body: { title: 'No Auth RFQ', category: 'banquet_space', ...rfqWindow },
  });
  check('unauthenticated RFQ creation is rejected', noAuthRfq.status === 401);

  // 3. RFQ with invalid dates (end before start)
  const badDatesRfq = await api('POST', '/api/requirements', {
    token: kalpataru,
    body: {
      title: 'Backwards Dates RFQ',
      category: 'banquet_space',
      startDateTime: at(35, 20),
      endDateTime: at(35, 10),
    },
  });
  check('RFQ with invalid dates is rejected', badDatesRfq.status === 400);

  // 4. Provider discovers open RFQ in feed
  const feed = await api('GET', '/api/requirements/feed?category=banquet_space', { token: seasons });
  const matchedInFeed = (feed.body.requirements || []).find((r) => r._id === createdRfqId);
  check('provider discovers open RFQ in feed with distance', Boolean(matchedInFeed && matchedInFeed.distanceKm != null));

  // 5. Seeker attempting to bid on own RFQ
  const ownBid = await api('POST', `/api/requirements/${createdRfqId}/proposals`, {
    token: kalpataru,
    body: {
      resourceId: ballroom._id,
      quotedPrice: 50000,
    },
  });
  check('seeker bidding on own RFQ is rejected', ownBid.status === 400);

  // 6. Provider submits quotation referencing an owned resource
  const proposal1 = await api('POST', `/api/requirements/${createdRfqId}/proposals`, {
    token: seasons, // Seasons owns ballroom
    body: {
      resourceId: ballroom._id,
      quotedPrice: 82000,
      notes: 'Includes Crystal Grand stage and valet for 120 cars.',
    },
  });
  check('provider can submit quotation referencing an owned resource', proposal1.status === 201 && proposal1.body.proposal?.status === 'submitted');

  const proposalId = proposal1.body.proposal?._id;

  // 7. Duplicate quotation from same provider
  const dupeProp = await api('POST', `/api/requirements/${createdRfqId}/proposals`, {
    token: seasons,
    body: {
      resourceId: ballroom._id,
      quotedPrice: 80000,
    },
  });
  check('duplicate quotation from same provider is rejected', dupeProp.status === 409);

  // 8. Unauthorized third party cannot accept proposal
  const thirdPartyAccept = await api('POST', `/api/requirements/${createdRfqId}/proposals/${proposalId}/accept`, {
    token: orchid, // Orchid is not the seeker
  });
  check('unauthorized third party cannot accept proposal', thirdPartyAccept.status === 403);

  // 9. Seeker accepts proposal -> converts to confirmed booking
  const acceptRes = await api('POST', `/api/requirements/${createdRfqId}/proposals/${proposalId}/accept`, {
    token: kalpataru,
  });
  check(
    'seeker accepting proposal converts to confirmed booking',
    acceptRes.status === 201 &&
      acceptRes.body.booking?.status === 'confirmed' &&
      acceptRes.body.requirement?.status === 'fulfilled' &&
      acceptRes.body.proposal?.status === 'accepted'
  );

  // 10. Competing proposals on fulfilled RFQ are closed/rejected
  const rfqDetails = await api('GET', `/api/requirements/${createdRfqId}`, { token: kalpataru });
  const allProps = rfqDetails.body.proposals || [];
  check(
    'accepted proposal is recorded and marked',
    allProps.some((p) => p._id === proposalId && p.status === 'accepted')
  );

  // 11. Requirement editing & management
  const editTestRfq = await api('POST', '/api/requirements', {
    token: kalpataru,
    body: {
      title: 'Original Title — 50 Chairs',
      category: 'furniture',
      requiredQuantity: 50,
      startDateTime: new Date(Date.now() + 10 * 86400000).toISOString(),
      endDateTime: new Date(Date.now() + 11 * 86400000).toISOString(),
      location: { coordinates: [72.8777, 19.076] },
    },
  });
  const editTestId = editTestRfq.body.requirement?._id;

  // Non-owner cannot edit
  const unauthorizedEdit = await api('PUT', `/api/requirements/${editTestId}`, {
    token: seasons,
    body: { title: 'Hacked Title' },
  });
  check('unauthorized user cannot edit another user\'s requirement', unauthorizedEdit.status === 403);

  // Owner can edit
  const ownerEdit = await api('PUT', `/api/requirements/${editTestId}`, {
    token: kalpataru,
    body: {
      title: 'Updated Title — 60 Chairs',
      requiredQuantity: 60,
      description: 'Updated delivery instructions.',
    },
  });
  check(
    'owner can successfully edit open requirement',
    ownerEdit.status === 200 &&
      ownerEdit.body.requirement?.title === 'Updated Title — 60 Chairs' &&
      ownerEdit.body.requirement?.requiredQuantity === 60
  );

  // Cannot edit fulfilled requirement
  const editFulfilled = await api('PUT', `/api/requirements/${createdRfqId}`, {
    token: kalpataru,
    body: { title: 'Cannot edit fulfilled' },
  });
  check('cannot edit a fulfilled requirement with confirmed booking', editFulfilled.status === 400);

  // Owner can cancel requirement
  const cancelRes = await api('PATCH', `/api/requirements/${editTestId}/cancel`, {
    token: kalpataru,
  });
  check('owner can cancel open requirement', cancelRes.status === 200 && cancelRes.body.requirement?.status === 'cancelled');

  // Cannot cancel fulfilled requirement
  const cancelFulfilled = await api('PATCH', `/api/requirements/${createdRfqId}/cancel`, {
    token: kalpataru,
  });
  check('cannot cancel a fulfilled requirement', cancelFulfilled.status === 400);

  // ---- availability windows ----
  console.log('\nAvailability windows');
  const kitchenSearch = await api('GET', '/api/search/resources?category=kitchen_capacity&limit=20', {
    token: kalpataru,
  });
  const windowed = kitchenSearch.body.results?.find((r) => r.title.includes('Commercial Kitchen'));
  check('a windowed listing still appears in search', Boolean(windowed));

  if (windowed) {
    // The kitchen is only offered overnight (22:00–07:00). A midday request sits
    // entirely outside every window and must be refused.
    const midday = await api('POST', '/api/bookings', {
      token: kalpataru,
      body: {
        resourceId: windowed._id,
        quantity: 1,
        startDateTime: at(6, 11),
        endDateTime: at(6, 15),
      },
    });
    check(
      'request outside the availability window is refused',
      midday.status === 409,
      `${midday.status} ${JSON.stringify(midday.body)}`
    );

    const overnight = await api('POST', '/api/bookings', {
      token: kalpataru,
      body: {
        resourceId: windowed._id,
        quantity: 1,
        startDateTime: at(6, 23),
        endDateTime: at(7, 6),
      },
    });
    check(
      'request inside the availability window is accepted',
      overnight.status === 201,
      `${overnight.status} ${JSON.stringify(overnight.body)}`
    );
  }

  // ---- requirements (reverse marketplace) ----
  console.log('\nRequirements');
  const posted = await api('POST', '/api/requirements', {
    token: kalpataru,
    body: {
      title: 'Test requirement — 40 round tables',
      category: 'furniture',
      quantity: 40,
      startDateTime: at(20, 9),
      endDateTime: at(20, 22),
      urgency: 'high',
    },
  });
  check('a seeker can post a requirement', posted.status === 201, JSON.stringify(posted.body));
  const reqId = posted.body.requirement?._id;

  const board = await api('GET', '/api/requirements/open', { token: orchid });
  check(
    'providers see open requirements',
    board.body.requirements?.length > 0,
    `${board.body.requirements?.length} on the board`
  );
  check(
    'the board hides your own requirements',
    !(await api('GET', '/api/requirements/open', { token: kalpataru })).body.requirements.some(
      (r) => String(r._id) === String(reqId)
    )
  );

  const mine = await api('GET', '/api/requirements/mine', { token: kalpataru });
  check('a seeker sees their own requirements', mine.body.requirements?.length > 0);

  // Silverline owns the Chiavari chairs and can offer them against a furniture
  // ask; its token is already in scope from the negotiation section above.
  const silverListings = await api('GET', '/api/resources/mine', { token: silverline });
  const chairsListing = silverListings.body.resources.find((r) => r.title.includes('Chiavari'));

  const offered = await api('POST', `/api/requirements/${reqId}/offers`, {
    token: silverline,
    body: { resourceId: chairsListing._id, price: 9000, message: 'Available, delivery included.' },
  });
  check('a provider can offer against a requirement', offered.status === 201, JSON.stringify(offered.body));

  const selfOffer = await api('POST', `/api/requirements/${reqId}/offers`, {
    token: kalpataru,
    body: { resourceId: chairsListing._id, price: 1 },
  });
  check('you cannot offer against your own requirement', selfOffer.status === 400);

  const offerId = offered.body.requirement?.offers?.slice(-1)[0]?._id;
  const accepted = await api('POST', `/api/requirements/${reqId}/offers/${offerId}/accept`, {
    token: kalpataru,
  });
  check(
    'accepting an offer creates a booking',
    accepted.status === 200 && Boolean(accepted.body.booking?._id),
    JSON.stringify(accepted.body).slice(0, 160)
  );
  check('the requirement is marked fulfilled', accepted.body.requirement?.status === 'fulfilled');

  // A booking created this way must carry the same money trail as one created
  // through the normal accept route.
  const fromRequirement = await api('GET', `/api/bookings/${accepted.body.booking._id}`, {
    token: kalpataru,
  });
  check(
    'a requirement-sourced booking still has a transaction',
    Boolean(fromRequirement.body.transaction),
    JSON.stringify(fromRequirement.body.transaction)
  );

  const reoffer = await api('POST', `/api/requirements/${reqId}/offers`, {
    token: silverline,
    body: { resourceId: chairsListing._id, price: 8000 },
  });
  check('a fulfilled requirement stops accepting offers', reoffer.status === 409);

  // ---- provider queue prioritisation ----
  console.log('\nRequest prioritisation');
  const providerQueue = await api('GET', '/api/bookings/received', { token: orchid });
  const queue = providerQueue.body.bookings || [];
  const waiting = queue.filter((b) => ['pending', 'negotiating'].includes(b.status));
  const settledFirstIndex = queue.findIndex((b) => !['pending', 'negotiating'].includes(b.status));
  check(
    'requests awaiting a decision sort above settled ones',
    settledFirstIndex === -1 || settledFirstIndex >= waiting.length
  );
  const firstUrgencies = waiting.map((b) => b.urgency);
  const rank = { high: 3, medium: 2, low: 1 };
  check(
    'urgent requests sort to the top of the queue',
    firstUrgencies.every((u, i) => i === 0 || rank[firstUrgencies[i - 1]] >= rank[u]),
    firstUrgencies.join(',')
  );

  // ---- transaction visibility ----
  console.log('\nTransaction tracking');
  const sentDone = await api('GET', '/api/bookings/sent?status=completed', { token: kalpataru });
  const doneBooking = sentDone.body.bookings?.[0];
  if (doneBooking) {
    const detail = await api('GET', `/api/bookings/${doneBooking._id}`, { token: kalpataru });
    check(
      'a completed booking exposes its transaction',
      Boolean(detail.body.transaction),
      JSON.stringify(detail.body.transaction)
    );
  }

  // ---- admin console ----
  // Every endpoint here reads across tenant boundaries, which no other route
  // in the app may do, so the gate and the invariant re-derivation are both
  // worth proving rather than assuming.
  console.log('\nAdmin console — access control');

  const meRes = await api('GET', '/api/auth/me', { token: orchid });
  check('the session exposes a computed platform-admin flag', meRes.body.user?.isPlatformAdmin === true);

  const nonAdminMe = await api('GET', '/api/auth/me', { token: kalpataru });
  check('a non-admin session is not flagged', nonAdminMe.body.user?.isPlatformAdmin === false);

  const adminBlocked = await api('GET', '/api/admin/overview', { token: kalpataru });
  check("a non-admin gets 404, so the console's existence is not advertised", adminBlocked.status === 404);

  const anon = await api('GET', '/api/admin/overview');
  check('an anonymous request to the console is rejected', anon.status === 401);

  for (const [method, path, body] of [
    ['POST', '/api/admin/broadcast', { title: 'x', message: 'y' }],
    ['POST', '/api/admin/health/repair', { checkId: 'rating_drift' }],
    ['GET', '/api/admin/negotiations', null],
  ]) {
    const res = await api(method, path, { token: kalpataru, body });
    check(`non-admin cannot reach ${method} ${path}`, res.status === 404, String(res.status));
  }

  // ---- deployment posture ----
  // ADMIN_EMAILS and NODE_ENV are read when config/admin.js is imported, so
  // the only honest way to test the production lock is a fresh process. This
  // rule decides between a publicly administrable marketplace and a console
  // nobody can reach, which is worth more than the ~200ms it costs.
  console.log('\nAdmin console — deployment posture');

  const resolveAdmins = (envOverrides) => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m = await import('./src/config/admin.js');" +
          'process.stdout.write(JSON.stringify(m.adminConfigStatus()));',
      ],
      {
        cwd: path.resolve(fileURLToPath(new URL('../../', import.meta.url))),
        env: { ...process.env, ADMIN_EMAILS: '', ADMIN_EMAIL: '', NODE_ENV: '', ...envOverrides },
        encoding: 'utf8',
      }
    );
    return JSON.parse(out);
  };

  const prodUnset = resolveAdmins({ NODE_ENV: 'production' });
  check(
    'production with no ADMIN_EMAILS locks the console instead of falling back to the demo account',
    prodUnset.state === 'locked' && prodUnset.emails.length === 0,
    JSON.stringify(prodUnset)
  );
  check(
    'the locked state explains how to enable it, so a deployment is debuggable',
    /ADMIN_EMAILS/.test(prodUnset.message) && /404/.test(prodUnset.message)
  );

  const prodSet = resolveAdmins({ NODE_ENV: 'production', ADMIN_EMAILS: 'Ops@GrandOrchid.in' });
  check(
    'an explicit allowlist works in production and is case-insensitive',
    prodSet.state === 'configured' && prodSet.emails.includes('ops@grandorchid.in'),
    JSON.stringify(prodSet)
  );

  const devUnset = resolveAdmins({});
  check(
    'local development still falls back to the demo account for zero-config use',
    devUnset.state === 'development-fallback' && devUnset.emails.includes('ops@grandorchid.in'),
    JSON.stringify(devUnset)
  );

  // A plural 'S' must not be the difference between a working deployment and a
  // console nobody can reach — this exact typo locked a real deployment.
  const singular = resolveAdmins({ NODE_ENV: 'production', ADMIN_EMAIL: 'ops@grandorchid.in' });
  check(
    'the singular ADMIN_EMAIL is honoured as well as the plural',
    singular.state === 'configured' && singular.emails.includes('ops@grandorchid.in'),
    JSON.stringify(singular)
  );
  check('the banner names which variable supplied the allowlist', singular.source === 'ADMIN_EMAIL');

  const bothSet = resolveAdmins({
    NODE_ENV: 'production',
    ADMIN_EMAILS: 'canonical@x.com',
    ADMIN_EMAIL: 'alias@x.com',
  });
  check(
    'when both are set the canonical plural wins',
    bothSet.emails.length === 1 && bothSet.emails[0] === 'canonical@x.com',
    JSON.stringify(bothSet.emails)
  );

  const multi = resolveAdmins({ NODE_ENV: 'production', ADMIN_EMAILS: 'a@b.com, c@d.com ,' });
  check(
    'a comma-separated allowlist is parsed and trailing blanks ignored',
    multi.emails.length === 2 && multi.emails.join(',') === 'a@b.com,c@d.com',
    JSON.stringify(multi.emails)
  );

  console.log('\nAdmin console — platform view');

  const overview = await api('GET', '/api/admin/overview', { token: orchid });
  check('overview loads the whole platform in one call', overview.status === 200);
  check(
    'GMV counts only settled payments, never accepted-but-unpaid bookings',
    overview.body.headline.gmv > 0 &&
      overview.body.headline.gmv !== overview.body.headline.pendingSettlement
  );
  check(
    'the funnel is ordered widest to narrowest',
    overview.body.funnel.every((s, i, a) => i === 0 || s.count <= a[i - 1].count),
    overview.body.funnel.map((s) => s.count).join(' >= ')
  );
  check('logistics stages are reported platform-wide', Boolean(overview.body.logistics));
  check(
    'businesses are counted across both marketplace sides',
    overview.body.topProviders.length > 0 && overview.body.topSeekers.length > 0
  );

  const live = await api('GET', '/api/admin/live', { token: orchid });
  check(
    'the activity feed merges every record type in reverse-chronological order',
    live.body.feed.length > 0 &&
      live.body.feed.every((f, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(f.at))
  );

  const admNegotiations = await api('GET', '/api/admin/negotiations', { token: orchid });
  check(
    'the negotiation log exposes counter-offers no single tenant can read',
    admNegotiations.status === 200 && admNegotiations.body.messages.length > 0
  );

  const dossier = await api('GET', `/api/admin/users/${meRes.body.user._id}`, { token: orchid });
  check(
    'a business dossier carries both provider and seeker activity at once',
    Array.isArray(dossier.body.bookings?.provided) && Array.isArray(dossier.body.bookings?.sought)
  );

  console.log('\nAdmin console — integrity audit');

  const audit = await api('GET', '/api/admin/health', { token: orchid });
  check('the audit runs every check', audit.status === 200 && audit.body.checks.length >= 11);

  // The seed leaves accepted bookings without transactions, which is exactly
  // the class of bug CLAUDE.md records as having happened for real.
  const missing = audit.body.checks.find((c) => c.id === 'missing_transaction');
  check(
    'the audit finds committed bookings that are missing a transaction',
    missing && missing.count > 0,
    `found ${missing?.count}`
  );

  const repair = await api('POST', '/api/admin/health/repair', {
    token: orchid,
    body: { checkId: 'missing_transaction' },
  });
  check('repairing backfills the missing transactions', repair.body.repaired > 0);
  check(
    'the finding is clear immediately after the repair',
    repair.body.audit.checks.find((c) => c.id === 'missing_transaction').count === 0
  );

  // A backfill must never invent a settled payment — that would inflate GMV to
  // tidy a dashboard.
  const afterRepair = await api('GET', '/api/admin/overview', { token: orchid });
  check(
    'backfilled transactions land as pending, not as settled revenue',
    afterRepair.body.headline.pendingSettlement > overview.body.headline.pendingSettlement
  );

  // ---- the audit must use the sweep line, not a sum ----
  // Two bookings that never coexist inside a wider span must NOT read as an
  // oversubscription. An audit that summed quantities would flag this.
  const hall = await Resource.findOne({ totalQuantity: 1, status: 'active' }).lean();
  const spare = await Resource.create({
    owner: hall.owner,
    title: 'Audit probe hall',
    category: 'banquet_space',
    totalQuantity: 1,
    unit: 'unit',
    pricing: { basePrice: 1000, priceUnit: 'per_day' },
    location: hall.location,
    status: 'paused',
  });
  const seekerId = (await api('GET', '/api/admin/users?q=kalpataru', { token: orchid })).body.users[0]._id;

  const backToBack = [
    { start: new Date(at(200, 9)), end: new Date(at(200, 12)) },
    { start: new Date(at(200, 13)), end: new Date(at(200, 17)) },
  ];
  for (const w of backToBack) {
    await Booking.create({
      resource: spare._id,
      provider: spare.owner,
      seeker: seekerId,
      requestedQuantity: 1,
      startDateTime: w.start,
      endDateTime: w.end,
      status: 'confirmed',
      agreedPrice: 1000,
    });
  }

  let sweep = await api('GET', '/api/admin/health', { token: orchid });
  let oversub = sweep.body.checks.find((c) => c.id === 'oversubscribed');
  check(
    'two non-overlapping bookings are not reported as oversubscription (sweep line, not a sum)',
    !oversub.rows.some((r) => String(r.id) === String(spare._id)),
    JSON.stringify(oversub.rows.map((r) => r.title))
  );

  // Now a genuine overlap, written straight to the DB the way a bug or a
  // manual edit would, since the API refuses to create it.
  await Booking.create({
    resource: spare._id,
    provider: spare.owner,
    seeker: seekerId,
    requestedQuantity: 1,
    startDateTime: new Date(at(200, 10)),
    endDateTime: new Date(at(200, 11)),
    status: 'confirmed',
    agreedPrice: 1000,
  });

  sweep = await api('GET', '/api/admin/health', { token: orchid });
  oversub = sweep.body.checks.find((c) => c.id === 'oversubscribed');
  const probe = oversub.rows.find((r) => String(r.id) === String(spare._id));
  check('a genuine concurrent overlap is reported as oversubscribed', Boolean(probe));
  check('the finding reports the peak and by how much it is over', probe?.extra?.overBy === 1, JSON.stringify(probe?.extra));
  check('inventory conflicts are marked critical', oversub.severity === 'critical');

  const noRepair = await api('POST', '/api/admin/health/repair', {
    token: orchid,
    body: { checkId: 'oversubscribed' },
  });
  check('an inventory conflict has no automatic repair — a human picks who gives way', noRepair.status === 400);

  await Booking.deleteMany({ resource: spare._id });
  await Resource.deleteOne({ _id: spare._id });

  console.log('\nAdmin console — administrative powers');

  // An override into a reserved status must re-validate availability exactly
  // like the provider-accept path, or the console could create the very
  // oversubscription its audit reports.
  const confirmedHall = await Booking.findOne({ status: 'confirmed' })
    .populate('resource')
    .lean();
  const rival = await Booking.create({
    resource: confirmedHall.resource._id,
    provider: confirmedHall.provider,
    seeker: confirmedHall.seeker,
    requestedQuantity: confirmedHall.resource.totalQuantity,
    startDateTime: confirmedHall.startDateTime,
    endDateTime: confirmedHall.endDateTime,
    status: 'pending',
  });

  const noReason = await api('PATCH', `/api/admin/bookings/${rival._id}/status`, {
    token: orchid,
    body: { status: 'cancelled' },
  });
  check('an override without a reason is refused', noReason.status === 400);

  const overbook = await api('PATCH', `/api/admin/bookings/${rival._id}/status`, {
    token: orchid,
    body: { status: 'confirmed', reason: 'attempting to oversubscribe' },
  });
  check(
    'an override cannot reserve capacity that is already taken',
    overbook.status === 409,
    `${overbook.status} ${overbook.body?.error}`
  );

  const cancelOverride = await api('PATCH', `/api/admin/bookings/${rival._id}/status`, {
    token: orchid,
    body: { status: 'cancelled', reason: 'verification cleanup' },
  });
  check('an override to a non-reserving status succeeds', cancelOverride.status === 200);
  check(
    'the override reason is recorded on the booking',
    /verification cleanup/.test(cancelOverride.body.booking?.cancellationReason || '')
  );
  await Booking.deleteOne({ _id: rival._id });

  // ---- suspension ----
  const suspendTarget = (await api('GET', '/api/admin/users?q=spiceroute', { token: orchid })).body.users[0];
  const spiceToken = await login('hello@spiceroute.co.in');
  check('the account works before suspension', Boolean(spiceToken));

  const suspend = await api('PATCH', `/api/admin/users/${suspendTarget._id}/suspend`, {
    token: orchid,
    body: { suspended: true, reason: 'verification' },
  });
  check('a business can be suspended', suspend.status === 200 && suspend.body.business.suspended);

  const deniedLogin = await api('POST', '/api/auth/login', {
    body: { email: 'hello@spiceroute.co.in', password: 'indulge123' },
  });
  check('a suspended business cannot sign in', deniedLogin.status === 403);

  // Enforcement lives in requireAuth, so an already-issued token dies too.
  const deadToken = await api('GET', '/api/bookings/sent', { token: spiceToken });
  check('an existing token stops working the moment the account is suspended', deadToken.status === 403);

  const selfSuspend = await api('PATCH', `/api/admin/users/${meRes.body.user._id}/suspend`, {
    token: orchid,
    body: { suspended: true, reason: 'lockout' },
  });
  check('an admin cannot suspend itself out of the console', selfSuspend.status === 400);

  const restore = await api('PATCH', `/api/admin/users/${suspendTarget._id}/suspend`, {
    token: orchid,
    body: { suspended: false },
  });
  check('a suspended business can be restored', restore.status === 200 && !restore.body.business.suspended);
  check(
    'the restored business can sign in again',
    (await api('POST', '/api/auth/login', {
      body: { email: 'hello@spiceroute.co.in', password: 'indulge123' },
    })).status === 200
  );

  // ---- moderation ----
  const someListing = (await api('GET', '/api/admin/listings?status=active&limit=1', { token: orchid }))
    .body.listings[0];
  const takedown = await api('PATCH', `/api/admin/listings/${someListing._id}/status`, {
    token: orchid,
    body: { status: 'paused', reason: 'verification' },
  });
  check('a listing can be taken off the market', takedown.status === 200 && takedown.body.resource.status === 'paused');
  check(
    'bookings already reserved against a paused listing are retained',
    typeof takedown.body.upcomingBookingsRetained === 'number'
  );
  await api('PATCH', `/api/admin/listings/${someListing._id}/status`, {
    token: orchid,
    body: { status: 'active' },
  });

  // ---- review removal must re-settle the denormalised ratings ----
  const reviewRow = (await api('GET', '/api/admin/reviews?limit=1', { token: orchid })).body.reviews[0];
  const revieweeId = reviewRow.reviewee._id;
  const countBefore = await Review.countDocuments({ reviewee: revieweeId });
  await api('DELETE', `/api/admin/reviews/${reviewRow._id}`, { token: orchid });
  const dossierAfter = await api('GET', `/api/admin/users/${revieweeId}`, { token: orchid });
  check(
    'removing a review recomputes the denormalised rating count',
    dossierAfter.body.business.ratingCount === countBefore - 1,
    `${countBefore} -> ${dossierAfter.body.business.ratingCount}`
  );
  const driftCheck = (await api('GET', '/api/admin/health', { token: orchid })).body.checks.find(
    (c) => c.id === 'rating_drift'
  );
  check('deleting a review leaves no rating drift behind', driftCheck.count === 0, `${driftCheck.count} findings`);

  // ---- refund ----
  const allSettled = (await api('GET', '/api/admin/transactions?status=simulated_paid&limit=200', {
    token: orchid,
  })).body.transactions;

  // A live booking must be released by its refund, or the provider is holding
  // inventory for an order nobody paid for.
  const liveSettled = allSettled.find((t) => t.booking?.status === 'confirmed');
  if (liveSettled) {
    const refund = await api('PATCH', `/api/admin/transactions/${liveSettled._id}/refund`, {
      token: orchid,
      body: { reason: 'verification' },
    });
    check('a settled payment can be refunded', refund.status === 200 && refund.body.transaction.status === 'refunded');
    check(
      'refunding a live booking cancels it, releasing the reserved inventory',
      refund.body.booking?.status === 'cancelled',
      refund.body.booking?.status
    );
    check(
      'a refund cannot be applied twice',
      (await api('PATCH', `/api/admin/transactions/${liveSettled._id}/refund`, {
        token: orchid,
        body: { reason: 'again' },
      })).status === 400
    );
  }

  // A completed booking is deliberately left alone: the service was delivered,
  // so a goodwill refund must not rewrite that history.
  const doneSettled = allSettled.find((t) => t.booking?.status === 'completed');
  if (doneSettled) {
    const refundDone = await api('PATCH', `/api/admin/transactions/${doneSettled._id}/refund`, {
      token: orchid,
      body: { reason: 'goodwill' },
    });
    check(
      'refunding a completed booking does not reopen or cancel it',
      refundDone.status === 200 &&
        refundDone.body.transaction.status === 'refunded' &&
        refundDone.body.booking?.status === 'completed',
      refundDone.body.booking?.status
    );
  }

  // ---- broadcast ----
  const broadcast = await api('POST', '/api/admin/broadcast', {
    token: orchid,
    body: { title: 'Verification notice', message: 'Sent by the verification suite.' },
  });
  check('a broadcast reaches every active business', broadcast.status === 200 && broadcast.body.sent > 1);
  const announceInbox = await api('GET', '/api/notifications', { token: kalpataru });
  check(
    'the announcement lands in a recipient notification list',
    (announceInbox.body.notifications || []).some((n) => n.type === 'platform_announcement')
  );
  check(
    'a broadcast with no message is refused',
    (await api('POST', '/api/admin/broadcast', { token: orchid, body: { title: 'x' } })).status === 400
  );

  // =========================================================================
  // Resource Availability & Listing Lifecycle 2.0
  // =========================================================================
  console.log('\nResource Availability & Listing Lifecycle 2.0');

  // 1. Indefinite listing remains reusable across bookings
  const indefRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Grand Ballroom Indefinite',
      category: 'banquet_space',
      pricing: { basePrice: 40000, priceUnit: 'per_day', minRentalPeriodHours: 1 },
      totalQuantity: 1,
      availabilityMode: 'indefinite',
    },
  });
  const indefId = indefRes.body.resource._id;
  check(
    'indefinite listing is created with indefinite mode',
    indefRes.status === 201 && indefRes.body.resource.availabilityMode === 'indefinite'
  );

  const b1 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(50, 10),
      endDateTime: at(50, 18),
    },
  });
  check('indefinite listing accepts first booking', b1.status === 201);

  const b2 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(52, 10),
      endDateTime: at(52, 18),
    },
  });
  check('indefinite listing remains reusable across subsequent bookings', b2.status === 201);

  // 2 & 3. Available-until accepts before cutoff, rejects after cutoff
  const untilRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Seasonal Pavilion',
      category: 'banquet_space',
      pricing: { basePrice: 30000, priceUnit: 'per_day' },
      totalQuantity: 1,
      availabilityMode: 'until_date',
      availableUntil: at(60, 23),
    },
  });
  const untilId = untilRes.body.resource._id;

  const bBeforeCutoff = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: untilId,
      quantity: 1,
      startDateTime: at(58, 10),
      endDateTime: at(58, 18),
    },
  });
  check('available-until accepts booking before cutoff date', bBeforeCutoff.status === 201);

  const bAfterCutoff = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: untilId,
      quantity: 1,
      startDateTime: at(62, 10),
      endDateTime: at(62, 18),
    },
  });
  check('available-until rejects booking after cutoff date', bAfterCutoff.status === 409);

  // 4 & 5. Recurring schedule allows valid day/time, rejects invalid day/time
  const recurRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Executive Conference Suite',
      category: 'banquet_space',
      pricing: { basePrice: 15000, priceUnit: 'per_day' },
      totalQuantity: 1,
      availabilityMode: 'recurring',
      recurringSchedule: {
        daysOfWeek: [1, 2, 3, 4, 5], // Mon - Fri
        startTime: '09:00',
        endTime: '18:00',
      },
    },
  });
  const recurId = recurRes.body.resource._id;

  // Next Monday 10:00 to 17:00 (valid weekday within hours)
  const mondayValidStart = nextDayOfWeek(1, 10);
  const mondayValidEnd = new Date(mondayValidStart);
  mondayValidEnd.setHours(17, 0, 0, 0);

  const bRecurValid = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: recurId,
      quantity: 1,
      startDateTime: mondayValidStart.toISOString(),
      endDateTime: mondayValidEnd.toISOString(),
    },
  });
  check('recurring schedule allows valid day and operating hours', bRecurValid.status === 201);

  // Next Sunday 10:00 to 17:00 (invalid day)
  const sundayStart = nextDayOfWeek(0, 10);
  const sundayEnd = new Date(sundayStart);
  sundayEnd.setHours(17, 0, 0, 0);

  const bRecurSun = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: recurId,
      quantity: 1,
      startDateTime: sundayStart.toISOString(),
      endDateTime: sundayEnd.toISOString(),
    },
  });
  check('recurring schedule rejects booking on disallowed day (weekend)', bRecurSun.status === 409);

  // Next Tuesday 07:00 to 12:00 (invalid hour before 09:00)
  const tueEarlyStart = nextDayOfWeek(2, 7);
  const tueEarlyEnd = new Date(tueEarlyStart);
  tueEarlyEnd.setHours(12, 0, 0, 0);

  const bRecurEarly = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: recurId,
      quantity: 1,
      startDateTime: tueEarlyStart.toISOString(),
      endDateTime: tueEarlyEnd.toISOString(),
    },
  });
  check('recurring schedule rejects booking outside operating hours', bRecurEarly.status === 409);

  // 6 & 7. Owner block rejects overlapping booking, allows booking outside block
  const blockRes = await api('POST', `/api/resources/${indefId}/blocks`, {
    token: orchid,
    body: {
      start: at(70, 10),
      end: at(70, 18),
      type: 'internal_use',
      reason: 'Annual Executive Strategy Retreat',
    },
  });
  check('owner can create an internal use block', blockRes.status === 201 && blockRes.body.ok);

  const bOverBlock = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(70, 12),
      endDateTime: at(70, 16),
    },
  });
  check('owner block rejects overlapping booking attempt', bOverBlock.status === 409);

  const bOutsideBlock = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(71, 10),
      endDateTime: at(71, 18),
    },
  });
  check('owner block allows booking outside the blocked period', bOutsideBlock.status === 201);

  // 8. Cannot create owner block over confirmed booking
  const bToConfirm = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(75, 10),
      endDateTime: at(75, 18),
    },
  });
  const confirmedBookingRes = await api('PATCH', `/api/bookings/${bToConfirm.body.booking._id}/accept`, {
    token: orchid,
    body: {},
  });
  check(
    'booking accepted and hard-reserved',
    confirmedBookingRes.status === 200 && confirmedBookingRes.body.booking.status === 'accepted'
  );

  const blockOverBooking = await api('POST', `/api/resources/${indefId}/blocks`, {
    token: orchid,
    body: {
      start: at(75, 12),
      end: at(75, 16),
      type: 'internal_use',
      reason: 'Conflicting event',
    },
  });
  check(
    'cannot create owner block over existing confirmed booking',
    blockOverBooking.status === 409
  );

  // 9. Maintenance window prevents booking
  const maintBlock = await api('POST', `/api/resources/${indefId}/blocks`, {
    token: orchid,
    body: {
      start: at(78, 8),
      end: at(78, 20),
      type: 'maintenance',
      reason: 'HVAC and Acoustics Overhaul',
    },
  });
  check('owner can schedule maintenance window', maintBlock.status === 201);

  const bMaintOverlap = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(78, 10),
      endDateTime: at(78, 14),
    },
  });
  check('maintenance window prevents booking during maintenance period', bMaintOverlap.status === 409);

  // 10. Buffer-after prevents immediate back-to-back booking
  const bufAfterRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Buffering Banquet Hall',
      category: 'banquet_space',
      pricing: { basePrice: 35000, priceUnit: 'per_day' },
      totalQuantity: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 120, // 2 hour cleanup turnaround
    },
  });
  const bufAfterId = bufAfterRes.body.resource._id;

  const bBase1 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufAfterId,
      quantity: 1,
      startDateTime: at(80, 10),
      endDateTime: at(80, 16), // ends at 16:00, turnaround until 18:00
    },
  });
  await api('PATCH', `/api/bookings/${bBase1.body.booking._id}/accept`, { token: orchid, body: {} });

  const bImmediateBackToBack = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufAfterId,
      quantity: 1,
      startDateTime: at(80, 16), // starts right at 16:00 when booking 1 ends
      endDateTime: at(80, 20),
    },
  });
  check(
    'buffer-after prevents immediate back-to-back booking during cleanup turnaround',
    bImmediateBackToBack.status === 409
  );

  // 11. Buffer-before prevents conflicting setup interval
  const bufBeforeRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Setup Buffer Suite',
      category: 'banquet_space',
      pricing: { basePrice: 28000, priceUnit: 'per_day' },
      totalQuantity: 1,
      bufferBeforeMinutes: 60, // 1 hour setup buffer required
      bufferAfterMinutes: 0,
    },
  });
  const bufBeforeId = bufBeforeRes.body.resource._id;

  const bBase2 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufBeforeId,
      quantity: 1,
      startDateTime: at(82, 10),
      endDateTime: at(82, 14), // ends at 14:00
    },
  });
  await api('PATCH', `/api/bookings/${bBase2.body.booking._id}/accept`, { token: orchid, body: {} });

  const bSetupConflict = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufBeforeId,
      quantity: 1,
      startDateTime: at(82, 14), // starts at 14:00, but needs setup starting at 13:00
      endDateTime: at(82, 18),
    },
  });
  check(
    'buffer-before prevents conflicting setup interval with prior booking',
    bSetupConflict.status === 409
  );

  // 12. Touching booking allowed only when buffer permits
  const bufBothRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Precision Turnaround Lounge',
      category: 'banquet_space',
      pricing: { basePrice: 25000, priceUnit: 'per_day' },
      totalQuantity: 1,
      bufferBeforeMinutes: 30, // 30 min prep
      bufferAfterMinutes: 60, // 60 min cleanup
    },
  });
  const bufBothId = bufBothRes.body.resource._id;

  const bBase3 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufBothId,
      quantity: 1,
      startDateTime: at(85, 10),
      endDateTime: at(85, 14), // ends at 14:00, cleanup until 15:00
    },
  });
  await api('PATCH', `/api/bookings/${bBase3.body.booking._id}/accept`, { token: orchid, body: {} });

  // Starting at 15:00 requires 30m prep starting at 14:30 -> conflicts with cleanup until 15:00!
  const bTouchingTooEarly = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufBothId,
      quantity: 1,
      startDateTime: at(85, 15),
      endDateTime: at(85, 18),
    },
  });
  check(
    'booking rejected when prep buffer encroaches on previous cleanup buffer',
    bTouchingTooEarly.status === 409
  );

  // Starting at 15:30 (prep from 15:00 to 15:30, cleanup finished at 15:00) -> perfectly touches!
  const bTouchingPermitted = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: bufBothId,
      quantity: 1,
      startDateTime: at(85, 15, 30),
      endDateTime: at(85, 18),
    },
  });
  check('touching booking allowed only when buffer permits', bTouchingPermitted.status === 201);

  // 13. Quantity-aware sweep-line still works with buffers
  const chairsBufRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Banquet Chiavari Chairs Stock',
      category: 'furniture',
      pricing: { basePrice: 100, priceUnit: 'per_unit' },
      totalQuantity: 300,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 60, // 1 hour inspection buffer after return
    },
  });
  const chairsBufId = chairsBufRes.body.resource._id;

  const bChairs1 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: chairsBufId,
      quantity: 200,
      startDateTime: at(88, 10),
      endDateTime: at(88, 14), // buffered until 15:00
    },
  });
  await api('PATCH', `/api/bookings/${bChairs1.body.booking._id}/accept`, { token: orchid, body: {} });

  const bChairs2 = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: chairsBufId,
      quantity: 50,
      startDateTime: at(88, 12),
      endDateTime: at(88, 16), // buffered until 17:00
    },
  });
  await api('PATCH', `/api/bookings/${bChairs2.body.booking._id}/accept`, { token: orchid, body: {} });

  // Between 14:00 and 15:00: chairs 1 buffer (200) + chairs 2 active (50) = 250 occupied, 50 free.
  const bChairsFit = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: chairsBufId,
      quantity: 50,
      startDateTime: at(88, 14),
      endDateTime: at(88, 16),
    },
  });
  check(
    'quantity-aware sweep-line accepts booking within remaining buffered capacity',
    bChairsFit.status === 201
  );

  const bChairsExceed = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: chairsBufId,
      quantity: 100,
      startDateTime: at(88, 14),
      endDateTime: at(88, 16),
    },
  });
  check(
    'quantity-aware sweep-line rejects booking exceeding remaining buffered capacity',
    bChairsExceed.status === 409
  );

  // 14. Pause blocks new bookings
  const pauseUpdate = await api('PATCH', `/api/resources/${indefId}/status`, {
    token: orchid,
    body: { status: 'paused' },
  });
  check(
    'owner can pause listing to stop new bookings',
    pauseUpdate.status === 200 && pauseUpdate.body.resource.status === 'paused'
  );

  const bWhilePaused = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(90, 10),
      endDateTime: at(90, 18),
    },
  });
  check(
    'pause blocks new booking requests',
    bWhilePaused.status === 404 || bWhilePaused.status === 409
  );

  // 15. Pause does not destroy existing booking
  const existingBookingCheck = await api('GET', `/api/bookings/${bToConfirm.body.booking._id}`, {
    token: orchid,
  });
  check(
    'pause retains existing accepted and confirmed bookings intact',
    existingBookingCheck.status === 200 && existingBookingCheck.body.booking.status === 'accepted'
  );

  // 16. Reactivation restores bookability
  const reactivateRes = await api('PATCH', `/api/resources/${indefId}/status`, {
    token: orchid,
    body: { status: 'active' },
  });
  check(
    'owner can reactivate paused listing',
    reactivateRes.status === 200 && reactivateRes.body.resource.status === 'active'
  );

  const bAfterReactivation = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(92, 10),
      endDateTime: at(92, 18),
    },
  });
  check('reactivation immediately restores bookability', bAfterReactivation.status === 201);

  // 17. Archive protection with future bookings
  // indefId has future booking bToConfirm (status: accepted on day 75)
  const archiveAttempt = await api('PATCH', `/api/resources/${indefId}/status`, {
    token: orchid,
    body: { status: 'archived' },
  });
  check(
    'archive is rejected when active or future commitments exist',
    archiveAttempt.status === 400 &&
      /commitments|active|upcoming/i.test(archiveAttempt.body.error || archiveAttempt.body.message)
  );

  // 18. Another provider cannot modify availability
  const hijackAttempt = await api('PATCH', `/api/resources/${indefId}/availability`, {
    token: seasons,
    body: { availabilityMode: 'indefinite' },
  });
  check('another provider cannot modify availability policy', hijackAttempt.status === 403);

  const hijackBlock = await api('POST', `/api/resources/${indefId}/blocks`, {
    token: seasons,
    body: { start: at(95, 10), end: at(95, 18), type: 'unavailable' },
  });
  check('another provider cannot create blocks on another listing', hijackBlock.status === 403);

  // 19. Public calendar does not leak private booking identity
  const publicCal = await api(
    'GET',
    `/api/resources/${indefId}/availability?start=${at(70, 0)}&end=${at(71, 0)}`
  );
  check(
    'anonymous calendar has isOwner false and does not expose private block detail',
    publicCal.status === 200 && publicCal.body.isOwner === false && !publicCal.body.days[0]?.blocks
  );

  const ownerCal = await api(
    'GET',
    `/api/resources/${indefId}/availability?start=${at(70, 0)}&end=${at(71, 0)}`,
    { token: orchid }
  );
  check(
    'owner calendar exposes isOwner true and operational block breakdown',
    ownerCal.status === 200 &&
      ownerCal.body.isOwner === true &&
      ownerCal.body.days[0]?.blocks?.length > 0
  );

  // 20. Old resources without new fields still work
  const oldRes = await Resource.create({
    owner: (await Resource.findById(indefId)).owner,
    title: 'Legacy Audio Visual System',
    category: 'av_equipment',
    pricing: { basePrice: 5000, priceUnit: 'per_day' },
    totalQuantity: 2,
  });
  const checkOld = await api(
    'GET',
    `/api/resources/${oldRes._id}/check?start=${at(100, 10)}&end=${at(100, 18)}`
  );
  check(
    'old resource without new fields defaults safely to full availability',
    checkOld.status === 200 && checkOld.body.available === 2
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2: Dedicated Logistics Partner System
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nDedicated Logistics Partner System');

  // 1. Existing business accounts remain seeker + lister
  const dualRoleListing = await api('POST', '/api/resources', {
    token: seasons,
    body: {
      title: 'Seasons Terrace Banquet Deck',
      category: 'banquet_space',
      pricing: { basePrice: 25000, priceUnit: 'per_day' },
      totalQuantity: 1,
    },
  });
  const dualRoleBooking = await api('POST', '/api/bookings', {
    token: seasons,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(120, 10),
      endDateTime: at(120, 18),
    },
  });
  check(
    'existing business accounts remain seeker+lister',
    dualRoleListing.status === 201 && dualRoleBooking.status === 201
  );

  // 2. Logistics partner account creation / recognition
  const partnerReg = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Express Cargo Movers',
      email: 'ops@expresscargo.in',
      password: 'indulge123',
      phone: '+91 98200 88991',
      userType: 'logistics_partner',
      logisticsProfile: {
        serviceArea: ['Thane', 'Mumbai'],
        operatingStatus: 'active',
        vehicleInfo: '2x Eicher Pro 2049, 1x Mahindra Bolero Pickup',
      },
    },
  });
  check(
    'logistics partner account creation/recognition',
    partnerReg.status === 201 &&
      partnerReg.body.user.userType === 'logistics_partner' &&
      partnerReg.body.user.logisticsProfile?.operatingStatus === 'active'
  );
  const expressToken = partnerReg.body.token;
  const expressUser = partnerReg.body.user;

  // 3. Normal business cannot access logistics partner dashboard API
  const businessAccessPartnerApi = await api('PATCH', '/api/logistics/partner-profile', {
    token: seasons,
    body: { operatingStatus: 'offline' },
  });
  check(
    'normal business cannot access logistics partner dashboard API',
    businessAccessPartnerApi.status === 403
  );

  // 4. Eligible booking creates/permits one logistics job
  const furnitureRes = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: 'Banquet Velvet Chairs — 200 units',
      category: 'furniture',
      pricing: { basePrice: 50, priceUnit: 'per_day' },
      totalQuantity: 200,
      requiresLogistics: true,
    },
  });
  const furnitureId = furnitureRes.body?.resource?._id;

  const physicalBookingRes = await api('POST', '/api/bookings', {
    token: seasons,
    body: {
      resourceId: furnitureId,
      quantity: 50,
      startDateTime: at(130, 9),
      endDateTime: at(130, 20),
    },
  });
  const physicalBookingId = physicalBookingRes.body.booking._id;

  await api('PATCH', `/api/bookings/${physicalBookingId}/accept`, {
    token: orchid,
    body: { agreedPrice: 2500 },
  });
  await api('PATCH', `/api/bookings/${physicalBookingId}/confirm`, {
    token: seasons,
  });

  const getJobRes = await api('GET', `/api/logistics/by-booking/${physicalBookingId}`, {
    token: seasons,
  });
  check(
    'eligible booking creates/permits one logistics job',
    getJobRes.status === 200 && getJobRes.body.job !== null && getJobRes.body.job.status === 'unassigned'
  );
  const jobId = getJobRes.body.job._id;

  // 5. Duplicate logistics job prevented
  const dupJobRes = await api('POST', '/api/logistics/jobs', {
    token: seasons,
    body: {
      bookingId: physicalBookingId,
    },
  });
  check(
    'duplicate logistics job prevented',
    dupJobRes.status === 409
  );

  // 6. Admin can assign logistics partner
  const assignRes = await api('PATCH', `/api/logistics/jobs/${jobId}/assign`, {
    token: orchid,
    body: {
      partnerId: expressUser._id,
      notes: 'Please dispatch morning pickup team',
    },
  });
  check(
    'admin can assign logistics partner',
    assignRes.status === 200 &&
      assignRes.body.job.status === 'assigned' &&
      String(assignRes.body.job.logisticsPartner?._id || assignRes.body.job.logisticsPartner) === String(expressUser._id)
  );

  // 7. Assigned partner can see job
  const partnerViewRes = await api('GET', `/api/logistics/jobs/${jobId}`, {
    token: expressToken,
  });
  check(
    'assigned partner can see job',
    partnerViewRes.status === 200 && partnerViewRes.body.job._id === jobId
  );

  // 8. Unrelated partner cannot see job
  const partner2Reg = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Apex Transport Co.',
      email: 'ops@apextransport.in',
      password: 'indulge123',
      phone: '+91 98200 77665',
      userType: 'logistics_partner',
    },
  });
  const partner2Token = partner2Reg.body.token;
  const partner2User = partner2Reg.body.user;

  const unrelatedPartnerView = await api('GET', `/api/logistics/jobs/${jobId}`, {
    token: partner2Token,
  });
  check(
    'unrelated partner cannot see job',
    unrelatedPartnerView.status === 403
  );

  // 9. Partner can accept assignment
  const partnerAcceptRes = await api('PATCH', `/api/logistics/jobs/${jobId}/accept`, {
    token: expressToken,
  });
  check(
    'partner can accept assignment',
    partnerAcceptRes.status === 200 && partnerAcceptRes.body.job.status === 'accepted'
  );

  // 10. Partner can decline assignment
  const booking2Res = await api('POST', '/api/bookings', {
    token: seasons,
    body: {
      resourceId: furnitureId,
      quantity: 30,
      startDateTime: at(135, 9),
      endDateTime: at(135, 20),
    },
  });
  const booking2Id = booking2Res.body.booking._id;
  await api('PATCH', `/api/bookings/${booking2Id}/accept`, { token: orchid, body: { agreedPrice: 1500 } });
  await api('PATCH', `/api/bookings/${booking2Id}/confirm`, { token: seasons });

  const job2Fetch = await api('GET', `/api/logistics/by-booking/${booking2Id}`, { token: seasons });
  const job2Id = job2Fetch.body.job._id;

  await api('PATCH', `/api/logistics/jobs/${job2Id}/assign`, {
    token: orchid,
    body: { partnerId: expressUser._id },
  });

  const declineRes = await api('PATCH', `/api/logistics/jobs/${job2Id}/decline`, {
    token: expressToken,
    body: { reason: 'No vehicles available in Thane east cluster' },
  });
  check(
    'partner can decline assignment',
    declineRes.status === 200 &&
      declineRes.body.job.status === 'declined' &&
      !declineRes.body.job.logisticsPartner
  );

  // 11. Invalid status transition rejected
  const invalidTrans = await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'completed' },
  });
  check(
    'invalid status transition rejected',
    invalidTrans.status === 400
  );

  // 12. Valid pickup lifecycle works
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'pickup_scheduled', notes: 'Vehicle en route to provider' },
  });
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'arrived_at_provider', notes: 'Vehicle at loading bay 2' },
  });
  const pickedUpRes = await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'picked_up', notes: 'All 50 chairs inspected and loaded' },
  });

  const bookingAfterPickup = await Booking.findById(physicalBookingId);
  check(
    'valid pickup lifecycle works',
    pickedUpRes.status === 200 &&
      pickedUpRes.body.job.status === 'picked_up' &&
      bookingAfterPickup.fulfillment?.status === 'out_for_delivery'
  );

  // 13. Valid delivery lifecycle works
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'in_transit' },
  });
  const deliveredRes = await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'delivered', notes: 'Handed over to banquet manager' },
  });
  const bookingAfterDelivered = await Booking.findById(physicalBookingId);
  check(
    'valid delivery lifecycle works',
    deliveredRes.status === 200 &&
      deliveredRes.body.job.status === 'delivered' &&
      bookingAfterDelivered.fulfillment?.status === 'delivered'
  );

  // 14. Return lifecycle works
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'return_requested' },
  });
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'return_pickup_scheduled' },
  });
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'return_picked_up' },
  });
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'return_in_transit' },
  });
  await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'returned_to_provider' },
  });
  const completedRes = await api('PATCH', `/api/logistics/jobs/${jobId}/status`, {
    token: expressToken,
    body: { status: 'completed', notes: 'Inspection clear, deposit released' },
  });
  const bookingAfterCompleted = await Booking.findById(physicalBookingId);
  check(
    'return lifecycle works',
    completedRes.status === 200 &&
      completedRes.body.job.status === 'completed' &&
      bookingAfterCompleted.return?.status === 'return_completed' &&
      bookingAfterCompleted.status === 'completed'
  );

  // 15. Seeker can view logistics status for own booking
  const seekerView = await api('GET', `/api/logistics/by-booking/${physicalBookingId}`, {
    token: seasons,
  });
  check(
    'seeker can view logistics status for own booking',
    seekerView.status === 200 && seekerView.body.job?.status === 'completed'
  );

  // 16. Provider can view logistics status for own booking
  const providerView = await api('GET', `/api/logistics/jobs/${jobId}`, {
    token: orchid,
  });
  check(
    'provider can view logistics status for own booking',
    providerView.status === 200 && providerView.body.job?._id === jobId
  );

  // 17. Unrelated business cannot view job
  const unrelatedBizView = await api('GET', `/api/logistics/jobs/${jobId}`, {
    token: kalpataru,
  });
  check(
    'unrelated business cannot view job',
    unrelatedBizView.status === 403
  );

  // 18. Admin can reassign where allowed
  const reassignRes = await api('PATCH', `/api/logistics/jobs/${job2Id}/assign`, {
    token: orchid,
    body: {
      partnerId: partner2User._id,
      notes: 'Reassigned to Apex Transport following previous decline',
    },
  });
  check(
    'admin can reassign where allowed',
    reassignRes.status === 200 &&
      reassignRes.body.job.status === 'assigned' &&
      String(reassignRes.body.job.logisticsPartner?._id || reassignRes.body.job.logisticsPartner) === String(partner2User._id)
  );

  // 19. Notifications generated
  const partnerNotifs = await api('GET', '/api/notifications', {
    token: expressToken,
  });
  const hasLogisticsNotif = (partnerNotifs.body.notifications || []).some(
    (n) => n.type === 'logistics_assignment' || n.type === 'logistics_update'
  );
  check(
    'notifications generated',
    partnerNotifs.status === 200 && hasLogisticsNotif
  );

  // 20. Existing booking without logistics remains compatible
  const nonPhysicalBooking = await api('POST', '/api/bookings', {
    token: seasons,
    body: {
      resourceId: indefId,
      quantity: 1,
      startDateTime: at(140, 10),
      endDateTime: at(140, 20),
    },
  });
  const nonPhysJob = await api('GET', `/api/logistics/by-booking/${nonPhysicalBooking.body.booking._id}`, {
    token: seasons,
  });
  check(
    'existing booking without logistics remains compatible',
    nonPhysJob.status === 200 && nonPhysJob.body.job === null
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2 Follow-up: Expose Logistics Partner Registration
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nPhase 2 Follow-up: Expose Logistics Partner Registration');

  // 1. Normal business registration still works
  const newBizReg = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Royal Crest Grand Banquet',
      email: 'events@royalcrest.in',
      password: 'indulge123',
      phone: '+91 98200 55443',
      businessType: 'banquet_venue',
      location: {
        address: 'Thane West',
        city: 'Thane',
        pincode: '400601',
        coordinates: [72.9781, 19.2183],
      },
    },
  });
  check(
    'normal business registration still works and assigns business userType',
    newBizReg.status === 201 &&
      newBizReg.body.user.userType === 'business' &&
      newBizReg.body.user.businessType === 'banquet_venue'
  );

  // 2. Logistics partner registration works
  const newPartnerReg = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'SwiftDrop Cargo & Fleet',
      email: 'dispatch@swiftdrop.in',
      password: 'indulge123',
      phone: '+91 98200 66778',
      businessType: 'other',
      userType: 'logistics_partner',
      location: {
        address: 'Vashi, Navi Mumbai',
        city: 'Navi Mumbai',
        pincode: '400703',
        coordinates: [73.0071, 19.076],
      },
      logisticsProfile: {
        serviceArea: ['Mumbai', 'Thane', 'Navi Mumbai'],
        operatingStatus: 'active',
        vehicleInfo: {
          vehicleType: 'Tata Ace / Pickup Truck (1.0T - 1.5T)',
          model: 'Tata Ace Gold Diesel',
          licensePlate: 'MH-04-AZ-4567',
          capacityKg: 1200,
        },
        capacityDescription: '1200 kg payload',
      },
    },
  });
  check(
    'logistics partner registration works and assigns logistics_partner userType',
    newPartnerReg.status === 201 &&
      newPartnerReg.body.user.userType === 'logistics_partner' &&
      newPartnerReg.body.user.businessName === 'SwiftDrop Cargo & Fleet'
  );

  // 3. logisticsProfile persists
  const persistedPartner = await User.findById(newPartnerReg.body.user._id).lean();
  check(
    'logisticsProfile persists correctly in database with vehicle and service area',
    persistedPartner &&
      persistedPartner.userType === 'logistics_partner' &&
      persistedPartner.logisticsProfile?.vehicleInfo?.licensePlate === 'MH-04-AZ-4567' &&
      persistedPartner.logisticsProfile?.vehicleInfo?.capacityKg === 1200 &&
      persistedPartner.logisticsProfile?.serviceArea?.includes('Navi Mumbai') &&
      persistedPartner.logisticsProfile?.capacityDescription === '1200 kg payload'
  );

  // 4. Business redirects normally after authentication
  const bizLogin = await api('POST', '/api/auth/login', {
    body: {
      email: 'events@royalcrest.in',
      password: 'indulge123',
    },
  });
  const bizTargetRoute = bizLogin.body?.user?.userType === 'logistics_partner' ? '/logistics' : '/';
  check(
    'business authenticates and targets normal business route (/)',
    bizLogin.status === 200 &&
      bizLogin.body.user.userType === 'business' &&
      bizTargetRoute === '/'
  );

  // 5. Logistics partner routes to /logistics
  const partnerLogin = await api('POST', '/api/auth/login', {
    body: {
      email: 'dispatch@swiftdrop.in',
      password: 'indulge123',
    },
  });
  const partnerTargetRoute = partnerLogin.body?.user?.userType === 'logistics_partner' ? '/logistics' : '/';
  check(
    'logistics partner authenticates and targets /logistics route',
    partnerLogin.status === 200 &&
      partnerLogin.body.user.userType === 'logistics_partner' &&
      partnerTargetRoute === '/logistics'
  );

  // 6. Logistics account cannot accidentally become Seeker/Lister through frontend navigation
  const isPartnerIsolated = partnerLogin.body.user.userType === 'logistics_partner';
  const partnerJobsRes = await api('GET', '/api/logistics/jobs', {
    token: partnerLogin.body.token,
  });
  check(
    'logistics account is isolated to logistics partner role and can access jobs endpoint',
    isPartnerIsolated && partnerJobsRes.status === 200 && Array.isArray(partnerJobsRes.body.jobs)
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2 UX Correction: Role-Separated Logistics Partner Workspace
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nPhase 2 UX Correction: Role-Separated Logistics Partner Workspace');

  // 1. business still accesses marketplace
  const bizMarketSearch = await api('GET', '/api/search/resources', { token: seasons });
  const bizMarketListings = await api('GET', '/api/resources/mine', { token: orchid });
  check(
    '1. business still accesses marketplace',
    bizMarketSearch.status === 200 && bizMarketListings.status === 200
  );

  // 2. logistics partner recognized after login
  const partnerAuthRes = await api('POST', '/api/auth/login', {
    body: { email: 'dispatch@swiftdrop.in', password: 'indulge123' },
  });
  const lpToken = partnerAuthRes.body?.token;
  check(
    '2. logistics partner recognized after login',
    partnerAuthRes.status === 200 &&
      partnerAuthRes.body?.user?.userType === 'logistics_partner' &&
      Boolean(lpToken)
  );

  // 3. logistics partner cannot create listing
  const lpListingRes = await api('POST', '/api/resources', {
    token: lpToken,
    body: {
      title: 'Illegal Logistics Resource Listing',
      category: 'vehicles',
      pricing: { basePrice: 1000, priceUnit: 'per_day' },
      totalQuantity: 1,
    },
  });
  check(
    '3. logistics partner cannot create listing',
    lpListingRes.status === 403
  );

  // 4. logistics partner cannot create requirement
  const lpReqRes = await api('POST', '/api/requirements', {
    token: lpToken,
    body: {
      title: 'Illegal Logistics Requirement',
      category: 'kitchen_capacity',
      urgency: 'high',
      requiredFrom: at(25, 10),
      requiredUntil: at(25, 18),
      budget: { maxPrice: 5000 },
    },
  });
  check(
    '4. logistics partner cannot create requirement',
    lpReqRes.status === 403
  );

  // 5. logistics partner cannot create/use marketplace cart
  const lpCartAdd = await api('POST', '/api/cart/items', {
    token: lpToken,
    body: {
      resourceId: furnitureId,
      quantity: 1,
      startDateTime: at(140, 10),
      endDateTime: at(140, 18),
    },
  });
  const lpCartGet = await api('GET', '/api/cart', { token: lpToken });
  check(
    '5. logistics partner cannot create/use marketplace cart',
    lpCartAdd.status === 403 && lpCartGet.status === 403
  );

  // 6. logistics partner cannot checkout marketplace resources
  const lpCheckout = await api('POST', '/api/cart/checkout', {
    token: lpToken,
    body: { paymentMethod: 'direct_billing' },
  });
  check(
    '6. logistics partner cannot checkout marketplace resources',
    lpCheckout.status === 403
  );

  // 7. logistics partner cannot submit normal provider RFQ
  const sampleReq = await api('POST', '/api/requirements', {
    token: seasons,
    body: {
      title: 'Commercial Soup Kettles for Banquet',
      category: 'kitchen_capacity',
      urgency: 'medium',
      requiredFrom: at(40, 10),
      requiredUntil: at(40, 20),
      budget: { maxPrice: 2000 },
    },
  });
  const sReqId = sampleReq.body?.requirement?._id;
  const lpProposal = await api('POST', `/api/requirements/${sReqId}/proposals`, {
    token: lpToken,
    body: {
      proposedPrice: 1800,
      proposalNotes: 'Logistics proposing illegal marketplace fulfillment',
    },
  });
  check(
    '7. logistics partner cannot submit normal provider RFQ',
    lpProposal.status === 403
  );

  // 8. logistics partner can access assigned logistics jobs
  const lpJobs = await api('GET', '/api/logistics/jobs', { token: lpToken });
  check(
    '8. logistics partner can access assigned logistics jobs',
    lpJobs.status === 200 && Array.isArray(lpJobs.body?.jobs)
  );

  // 9. logistics partner can update valid assigned job states
  const lpJobBooking = await api('POST', '/api/bookings', {
    token: seasons,
    body: {
      resourceId: furnitureId,
      quantity: 15,
      startDateTime: at(160, 9),
      endDateTime: at(160, 18),
    },
  });
  const bkgId = lpJobBooking.body?.booking?._id;
  await api('PATCH', `/api/bookings/${bkgId}/accept`, { token: orchid });
  await api('PATCH', `/api/bookings/${bkgId}/confirm`, { token: seasons });
  const bkgJob = (await api('GET', `/api/logistics/by-booking/${bkgId}`, { token: seasons })).body?.job;
  const bkgJobId = bkgJob?._id;

  const lpClaimRes = await api('PATCH', `/api/logistics/jobs/${bkgJobId}/claim`, { token: lpToken });
  const lpAcceptRes = await api('PATCH', `/api/logistics/jobs/${bkgJobId}/accept`, { token: lpToken });
  const lpSchedRes = await api('PATCH', `/api/logistics/jobs/${bkgJobId}/status`, {
    token: lpToken,
    body: { status: 'pickup_scheduled' },
  });
  const lpArrivedRes = await api('PATCH', `/api/logistics/jobs/${bkgJobId}/status`, {
    token: lpToken,
    body: { status: 'arrived_at_provider' },
  });
  check(
    '9. logistics partner can update valid assigned job states',
    lpClaimRes.status === 200 &&
      lpAcceptRes.status === 200 &&
      lpSchedRes.status === 200 &&
      lpArrivedRes.status === 200 &&
      lpArrivedRes.body?.job?.status === 'arrived_at_provider'
  );

  // 10. business cannot access partner-only logistics APIs
  const bizProfileBlock = await api('PATCH', '/api/logistics/partner-profile', {
    token: seasons,
    body: { operatingStatus: 'offline' },
  });
  const bizClaimBlock = await api('PATCH', `/api/logistics/jobs/${bkgJobId}/claim`, {
    token: seasons,
  });
  check(
    '10. business cannot access partner-only logistics APIs',
    bizProfileBlock.status === 403 && bizClaimBlock.status === 403
  );

  // 11. logistics account redirect/role response provides enough data for frontend routing
  const meCheck = await api('GET', '/api/auth/me', { token: lpToken });
  const lpUserType = meCheck.body?.user?.userType;
  const lpStatus = meCheck.body?.user?.logisticsProfile?.operatingStatus;
  const lpRoute = lpUserType === 'logistics_partner' ? '/logistics' : '/';
  check(
    '11. logistics account redirect/role response provides enough data for frontend routing',
    meCheck.status === 200 &&
      lpUserType === 'logistics_partner' &&
      Boolean(lpStatus) &&
      lpRoute === '/logistics'
  );

  // 12. completed jobs synchronize accurately with partner completedJobs metric and completed filter
  const swiftFleetUser = await User.findOne({ email: 'dispatch@swiftfleet.in' });
  const swiftCompletedJobs = await LogisticsJob.countDocuments({
    logisticsPartner: swiftFleetUser._id,
    status: 'completed',
  });
  check(
    '12. completed jobs synchronize accurately with partner completedJobs metric and completed filter',
    swiftFleetUser?.logisticsProfile?.completedJobs === swiftCompletedJobs &&
      swiftCompletedJobs >= 2
  );

  console.log('\nPhase 3: Deterministic Order-Splitting + Trade-Off Solver');

  // Test setup: create test users and candidate resources
  const solverSeeker = await User.create({
    businessName: 'Apex Hospitality Seeker',
    businessType: 'hotel',
    email: 'apex@seeker.in',
    passwordHash: 'dummy',
    userType: 'business',
    location: { address: 'Thane West', city: 'Thane', coordinates: [72.978, 19.218] },
  });

  const solverProviderA = await User.create({
    businessName: 'Provider Alpha Chairs',
    businessType: 'event_organizer',
    email: 'alpha@chairs.in',
    passwordHash: 'dummy',
    userType: 'business',
    location: { address: 'Thane East', city: 'Thane', coordinates: [72.985, 19.215] },
  });

  const solverProviderB = await User.create({
    businessName: 'Provider Beta Banquet Gear',
    businessType: 'caterer',
    email: 'beta@banquet.in',
    passwordHash: 'dummy',
    userType: 'business',
    location: { address: 'Mulund West', city: 'Mumbai', coordinates: [72.955, 19.172] },
  });

  const solverProviderC = await User.create({
    businessName: 'Provider Gamma Mega Supplies',
    businessType: 'banquet_venue',
    email: 'gamma@mega.in',
    passwordHash: 'dummy',
    userType: 'business',
    location: { address: 'Powai', city: 'Mumbai', coordinates: [72.905, 19.117] },
  });

  const targetDateStart = new Date(Date.now() + 10 * DAY);
  const targetDateEnd = new Date(Date.now() + 10 * DAY + 8 * 3600000);

  // 1. Single provider fulfills full quantity
  const candidateSingle = [
    {
      resourceId: 'res-alpha-100',
      title: 'Chiavari Chairs Gold',
      category: 'furniture',
      providerId: String(solverProviderA._id),
      providerName: solverProviderA.businessName,
      availableQuantity: 150,
      unitPrice: 50,
      distanceKm: 2.0,
    },
  ];
  const plansSingle = await generateProcurementPlans({
    requestedQuantity: 100,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: candidateSingle,
  });
  check(
    '1. single provider fulfills full quantity',
    plansSingle.length === 1 &&
      plansSingle[0].type === 'single' &&
      plansSingle[0].fulfilledQuantity === 100 &&
      plansSingle[0].fullyFulfilled === true &&
      plansSingle[0].supplierCount === 1
  );

  // 2. Two providers required for full quantity
  const candidateTwo = [
    {
      resourceId: 'res-a-300',
      title: 'Banquet Chairs A',
      category: 'furniture',
      providerId: String(solverProviderA._id),
      providerName: solverProviderA.businessName,
      availableQuantity: 300,
      unitPrice: 60,
      distanceKm: 2.0,
    },
    {
      resourceId: 'res-b-250',
      title: 'Banquet Chairs B',
      category: 'furniture',
      providerId: String(solverProviderB._id),
      providerName: solverProviderB.businessName,
      availableQuantity: 250,
      unitPrice: 55,
      distanceKm: 4.0,
    },
  ];
  const plansTwo = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: candidateTwo,
  });
  check(
    '2. two providers required for full quantity',
    plansTwo.some(
      (p) => p.type === 'split' && p.fulfilledQuantity === 500 && p.supplierCount === 2
    )
  );

  // 3. Three providers when necessary
  const candidateThree = [
    {
      resourceId: 'res-a-200',
      title: 'Chairs A',
      category: 'furniture',
      providerId: String(solverProviderA._id),
      providerName: solverProviderA.businessName,
      availableQuantity: 200,
      unitPrice: 60,
      distanceKm: 2.0,
    },
    {
      resourceId: 'res-b-250',
      title: 'Chairs B',
      category: 'furniture',
      providerId: String(solverProviderB._id),
      providerName: solverProviderB.businessName,
      availableQuantity: 250,
      unitPrice: 55,
      distanceKm: 4.0,
    },
    {
      resourceId: 'res-c-200',
      title: 'Chairs C',
      category: 'furniture',
      providerId: String(solverProviderC._id),
      providerName: solverProviderC.businessName,
      availableQuantity: 200,
      unitPrice: 85,
      distanceKm: 8.0,
    },
  ];
  const plansThree = await generateProcurementPlans({
    requestedQuantity: 600,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: candidateThree,
    maxSuppliersPerPlan: 3,
  });
  check(
    '3. three providers when necessary',
    plansThree.some(
      (p) => p.type === 'split' && p.fulfilledQuantity === 600 && p.supplierCount === 3
    )
  );

  // 4. Max supplier limit respected
  const plansCapped = await generateProcurementPlans({
    requestedQuantity: 600,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: candidateThree,
    maxSuppliersPerPlan: 2,
  });
  check(
    '4. max supplier limit respected',
    plansCapped.every((p) => p.supplierCount <= 2)
  );

  // 5. Paused resource excluded
  const pausedRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Paused Velvet Chairs',
    category: 'furniture',
    totalQuantity: 500,
    pricing: { basePrice: 40 },
    status: 'paused',
  });
  const plansPaused = await generateProcurementPlans({
    requestedQuantity: 100,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [pausedRes],
  });
  check(
    '5. paused resource excluded',
    plansPaused.length === 0
  );

  // 6. Archived resource excluded
  const archivedRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Archived Wooden Chairs',
    category: 'furniture',
    totalQuantity: 500,
    pricing: { basePrice: 40 },
    status: 'archived',
  });
  const plansArchived = await generateProcurementPlans({
    requestedQuantity: 100,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [archivedRes],
  });
  check(
    '6. archived resource excluded',
    plansArchived.length === 0
  );

  // 7. Owner-blocked resource excluded
  const blockedRes = await Resource.create({
    owner: solverProviderB._id,
    title: 'Blocked Banquet Chairs',
    category: 'furniture',
    totalQuantity: 500,
    pricing: { basePrice: 50 },
    status: 'active',
    blockedPeriods: [
      {
        start: new Date(targetDateStart.getTime() - 2 * 3600000),
        end: new Date(targetDateEnd.getTime() + 2 * 3600000),
        reason: 'Private VIP reservation',
      },
    ],
  });
  const plansBlocked = await generateProcurementPlans({
    requestedQuantity: 100,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [blockedRes],
  });
  check(
    '7. owner-blocked resource excluded',
    plansBlocked.length === 0
  );

  // 8. Maintenance excluded
  const maintRes = await Resource.create({
    owner: solverProviderB._id,
    title: 'Maintenance Metal Chairs',
    category: 'furniture',
    totalQuantity: 500,
    pricing: { basePrice: 50 },
    status: 'active',
    blockedPeriods: [
      {
        start: targetDateStart,
        end: targetDateEnd,
        reason: 'Deep cleaning and maintenance',
      },
    ],
  });
  const plansMaint = await generateProcurementPlans({
    requestedQuantity: 100,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [maintRes],
  });
  check(
    '8. maintenance excluded',
    plansMaint.length === 0
  );

  // 9. Buffer conflict excluded
  const bufferRes = await Resource.create({
    owner: solverProviderC._id,
    title: 'Buffered Audio Podiums',
    category: 'furniture',
    totalQuantity: 1,
    pricing: { basePrice: 200 },
    status: 'active',
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 60,
  });
  // Confirmed booking finishes 30 mins before targetDateStart, but buffer requires 60 mins!
  await Booking.create({
    resource: bufferRes._id,
    provider: solverProviderC._id,
    seeker: solverSeeker._id,
    quantity: 1,
    startDateTime: new Date(targetDateStart.getTime() - 4 * 3600000),
    endDateTime: new Date(targetDateStart.getTime() - 30 * 60000),
    status: 'confirmed',
    agreedPrice: 500,
    paymentStatus: 'paid',
  });
  const plansBuffer = await generateProcurementPlans({
    requestedQuantity: 1,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [bufferRes],
  });
  check(
    '9. buffer conflict excluded',
    plansBuffer.length === 0
  );

  // 10. Concurrent booked quantity respected
  const concurrentRes = await Resource.create({
    owner: solverProviderC._id,
    title: 'Stackable Chiavari Chairs',
    category: 'furniture',
    totalQuantity: 300,
    pricing: { basePrice: 65 },
    status: 'active',
  });
  // A confirmed booking holds 120 units during the target window
  await Booking.create({
    resource: concurrentRes._id,
    provider: solverProviderC._id,
    seeker: solverSeeker._id,
    requestedQuantity: 120,
    startDateTime: new Date(targetDateStart.getTime() - 3600000),
    endDateTime: new Date(targetDateEnd.getTime() + 3600000),
    status: 'confirmed',
    agreedPrice: 7800,
    paymentStatus: 'paid',
  });
  // Bookable quantity should be 300 - 120 = 180
  const plansConcurrent = await generateProcurementPlans({
    requestedQuantity: 250,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: [concurrentRes],
  });
  check(
    '10. concurrent booked quantity respected',
    plansConcurrent.length === 1 &&
      plansConcurrent[0].suppliers[0].availableQuantity === 180 &&
      plansConcurrent[0].fulfilledQuantity === 180
  );

  // 11. Split quantity equals requested quantity
  const splitPlan500 = plansTwo.find((p) => p.type === 'split');
  check(
    '11. split quantity equals requested quantity',
    Boolean(splitPlan500) &&
      splitPlan500.suppliers.reduce((sum, s) => sum + s.allocatedQuantity, 0) === 500
  );

  // 12. No supplier over-allocation
  check(
    '12. no supplier over-allocation',
    plansTwo.every((p) =>
      p.suppliers.every((s) => s.allocatedQuantity <= s.availableQuantity)
    )
  );

  // 13. Total price correct
  check(
    '13. total price correct',
    Boolean(splitPlan500) &&
      splitPlan500.totalPrice ===
        splitPlan500.suppliers.reduce((sum, s) => sum + s.allocatedQuantity * s.unitPrice, 0)
  );

  // 14. Budget variance correct
  const plansWithBudget = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    budget: 40000,
    candidates: candidateTwo,
  });
  const budgetPlan = plansWithBudget.find((p) => p.type === 'split');
  check(
    '14. budget variance correct',
    Boolean(budgetPlan) && budgetPlan.budgetVariance === budgetPlan.totalPrice - 40000
  );

  // 15. Split vs single both survive when trade-offs differ
  const resIdA = new mongoose.Types.ObjectId();
  const resIdB = new mongoose.Types.ObjectId();
  const resIdC = new mongoose.Types.ObjectId();

  const tradeOffCandidates = [
    {
      _id: resIdA,
      resourceId: String(resIdA),
      title: 'Chairs A',
      category: 'furniture',
      providerId: String(solverProviderA._id),
      providerName: solverProviderA.businessName,
      availableQuantity: 300,
      unitPrice: 60,
      distanceKm: 2.0,
      pricing: { basePrice: 60 },
      totalQuantity: 300,
      status: 'active',
    },
    {
      _id: resIdB,
      resourceId: String(resIdB),
      title: 'Chairs B',
      category: 'furniture',
      providerId: String(solverProviderB._id),
      providerName: solverProviderB.businessName,
      availableQuantity: 250,
      unitPrice: 55,
      distanceKm: 4.0,
      pricing: { basePrice: 55 },
      totalQuantity: 250,
      status: 'active',
    },
    {
      _id: resIdC,
      resourceId: String(resIdC),
      title: 'Chairs C',
      category: 'furniture',
      providerId: String(solverProviderC._id),
      providerName: solverProviderC.businessName,
      availableQuantity: 500,
      unitPrice: 85,
      distanceKm: 8.0,
      pricing: { basePrice: 85 },
      totalQuantity: 500,
      status: 'active',
    },
  ];
  const tradeOffPlans = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    budget: 40000,
    candidates: tradeOffCandidates,
  });
  const hasSplit = tradeOffPlans.some((p) => p.type === 'split');
  const hasSingle = tradeOffPlans.some((p) => p.type === 'single');
  check(
    '15. split vs single both survive when trade-offs differ',
    hasSplit && hasSingle
  );

  // 16. Dominated option removed
  const planGood = {
    id: 'plan-good',
    totalPrice: 29000,
    maxDistanceKm: 4.0,
    supplierCount: 2,
    fulfilledQuantity: 500,
    suppliers: [{ resourceId: '1', allocatedQuantity: 300 }, { resourceId: '2', allocatedQuantity: 200 }],
  };
  const planDominated = {
    id: 'plan-dominated',
    totalPrice: 35000,
    maxDistanceKm: 5.0,
    supplierCount: 2,
    fulfilledQuantity: 500,
    suppliers: [{ resourceId: '1', allocatedQuantity: 250 }, { resourceId: '3', allocatedQuantity: 250 }],
  };
  const filtered = filterNonDominatedPlans([planGood, planDominated]);
  check(
    '16. dominated option removed',
    filtered.length === 1 && filtered[0].id === 'plan-good' && doesPlanDominate(planGood, planDominated)
  );

  // 17. Cheapest label correct
  const minCost = Math.min(...tradeOffPlans.map((p) => p.totalPrice));
  const cheapestPlan = tradeOffPlans.find((p) => p.totalPrice === minCost);
  check(
    '17. cheapest label correct',
    Boolean(cheapestPlan) && cheapestPlan.labels.includes('CHEAPEST')
  );

  // 18. Nearest label correct
  const minDistance = Math.min(...tradeOffPlans.map((p) => p.maxDistanceKm));
  const nearestPlan = tradeOffPlans.find((p) => p.maxDistanceKm === minDistance);
  check(
    '18. nearest label correct',
    Boolean(nearestPlan) && nearestPlan.labels.includes('NEAREST')
  );

  // 19. Fewest suppliers label correct
  const singleOpt = tradeOffPlans.find((p) => p.supplierCount === 1);
  check(
    '19. fewest suppliers label correct',
    Boolean(singleOpt) && singleOpt.labels.includes('FEWEST_SUPPLIERS')
  );

  // 20. Partial fulfillment returned
  const partialCandidates = [
    {
      resourceId: 'res-part-1',
      title: 'Limited Chairs 1',
      category: 'furniture',
      providerId: String(solverProviderA._id),
      providerName: solverProviderA.businessName,
      availableQuantity: 220,
      unitPrice: 50,
      distanceKm: 3.0,
    },
    {
      resourceId: 'res-part-2',
      title: 'Limited Chairs 2',
      category: 'furniture',
      providerId: String(solverProviderB._id),
      providerName: solverProviderB.businessName,
      availableQuantity: 200,
      unitPrice: 55,
      distanceKm: 5.0,
    },
  ];
  const partialPlans = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    candidates: partialCandidates,
  });
  check(
    '20. partial fulfillment returned',
    partialPlans.length > 0 &&
      partialPlans.some(
        (p) =>
          p.fulfilledQuantity === 420 &&
          p.fulfillmentPercentage === 84 &&
          p.fullyFulfilled === false &&
          p.labels.includes('PARTIALLY_FULFILLED')
      )
  );

  // 21. No duplicate resource allocation inside plan
  check(
    '21. no duplicate resource allocation inside plan',
    tradeOffPlans.every((p) => {
      const resIds = p.suppliers.map((s) => s.resourceId);
      const provIds = p.suppliers.map((s) => s.providerId);
      return new Set(resIds).size === resIds.length && new Set(provIds).size === provIds.length;
    })
  );

  // 22. Unauthorized requirement access rejected
  const testReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: '500 Chairs for Grand Gala',
    category: 'furniture',
    requiredQuantity: 500,
    quantity: 500,
    unit: 'unit',
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    maxBudget: 40000,
    maxPrice: 40000,
    location: {
      address: 'Thane West',
      city: 'Thane',
      coordinates: [72.978, 19.218],
      radiusKm: 25,
    },
    radiusKm: 25,
    status: 'open',
  });
  const unauthRes = await api('GET', `/api/requirements/${testReq._id}/procurement-options`, {
    token: seasons, // Seasons is not the owner of testReq
  });
  check(
    '22. unauthorized requirement access rejected',
    unauthRes.status === 403
  );

  // 23. Existing normal matching unchanged
  const normalMatches = await rankResources(
    tradeOffCandidates.map((c) => ({
      _id: c._id,
      totalQuantity: c.availableQuantity,
      pricing: { basePrice: c.unitPrice },
      distanceKm: c.distanceKm,
    })),
    {
      start: targetDateStart,
      end: targetDateEnd,
      quantity: 500,
    }
  );
  check(
    '23. existing normal matching unchanged',
    normalMatches.length === 1 && normalMatches[0].availableQuantity >= 500
  );

  // 24. Same input produces deterministic ordering
  const run1 = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    budget: 40000,
    candidates: tradeOffCandidates,
  });
  const run2 = await generateProcurementPlans({
    requestedQuantity: 500,
    requestedDates: { start: targetDateStart, end: targetDateEnd },
    budget: 40000,
    candidates: tradeOffCandidates,
  });
  check(
    '24. same input produces deterministic ordering',
    JSON.stringify(run1) === JSON.stringify(run2)
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);

  server.close();
  try {
    await disconnectDB();
  } catch {}
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
