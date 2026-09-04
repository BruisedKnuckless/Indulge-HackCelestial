/**
 * End-to-end check of the rules the marketplace depends on.
 * Run with: npm run verify
 *
 * Boots the API on an ephemeral port against a seeded in-memory database and
 * drives it over HTTP, so this exercises the real routes rather than the
 * services in isolation.
 */
import http from 'http';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { runSeed } from './seed.js';

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

  const confirm = await api('PATCH', `/api/bookings/${target._id}/confirm`, { token: kalpataru });
  check('seeker can confirm', confirm.status === 200 && confirm.body.booking.status === 'confirmed');

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

  console.log(`\n${passed} passed, ${failed} failed\n`);

  server.close();
  await disconnectDB();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
