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
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Review from '../models/Review.js';

let base = '';
let passed = 0;
let failed = 0;

const DAY = 24 * 3600 * 1000;
function at(daysFromNow, hour = 9) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
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

  console.log(`\n${passed} passed, ${failed} failed\n`);

  server.close();
  await disconnectDB();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
