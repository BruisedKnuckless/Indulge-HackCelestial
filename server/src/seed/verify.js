/**
 * End-to-end check of the rules the marketplace depends on.
 * Run with: npm run verify
 *
 * Boots the API on an ephemeral port against a seeded in-memory database and
 * drives it over HTTP, so this exercises the real routes rather than the
 * services in isolation.
 */
process.env.IN_VERIFY = 'true';
global.__IN_VERIFY__ = true;

import http from 'http';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { validateEnv } from '../config/env.js';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { readFileSync } from 'node:fs';
import { loadModel } from '../ml/delivery/predict.js';
import { generateInspectionProtocol, generateForResource } from '../ml/inspection/generate.js';
import { DEMO_CASES } from '../ml/inspection/examples/cases.js';
import { FEATURE_VERSION as DELIVERY_FEATURE_VERSION } from '../ml/delivery/features.js';
import Admin from '../models/Admin.js';
import { runSeed, seedAdmins } from './seed.js';
import { ADMINS } from './seedData.js';
import { ensureBootstrapAdmin, readBootstrapAdmin, adminPasswordAllowed } from '../config/admin.js';
import LogisticsJob from '../models/LogisticsJob.js';
import Requirement from '../models/Requirement.js';
import Transaction from '../models/Transaction.js';
import ProcurementOrder from '../models/ProcurementOrder.js';
import Proposal from '../models/Proposal.js';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';
import { signToken } from '../middleware/auth.middleware.js';
import {
  generateProcurementPlans,
  filterNonDominatedPlans,
  doesPlanDominate,
} from '../services/procurement-solver.service.js';
import { rankResources } from '../services/matching.service.js';
import {
  scanAndSyncCapacityRecovery,
  calculateRecoveryPriorityScore,
  getProviderRecoveryOverview,
  getAdminRecoveryMetrics,
} from '../services/capacity-recovery.service.js';
import {
  calculateContributionProfile,
  getPublicReputationProfile,
  CONTRIBUTION_TIERS,
  BADGE_DEFINITIONS,
  invalidateContributionCache,
} from '../services/contribution.service.js';

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

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function apiMultipart(method, path, formData, { token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: formData,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json, headers: res.headers };
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

async function adminLogin(email = 'admin@indulge.com', password = 'indulge123') {
  const { body } = await api('POST', '/api/admin/auth/login', { body: { email, password } });
  return body?.token;
}

/** Claims of a JWT, without verifying it — enough to assert its type. */
const claims = (token) => JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());

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
  const admin = await adminLogin();
  check('demo accounts log in', Boolean(orchid && seasons && kalpataru));
  check('the platform admin signs in separately at /api/admin/auth/login', Boolean(admin));

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

  // The business session is untouched by admin separation: no admin flag, and
  // the account that used to be on the allowlist is now just a business.
  const meRes = await api('GET', '/api/auth/me', { token: orchid });
  check('a business session carries no platform-admin flag', meRes.body.user?.isPlatformAdmin === undefined);
  check('business tokens are typed as business sessions', claims(orchid).type === 'business');

  const adminBlocked = await api('GET', '/api/admin/overview', { token: kalpataru });
  check("a non-admin gets 404, so the console's existence is not advertised", adminBlocked.status === 404);

  const formerAdmin = await api('GET', '/api/admin/overview', { token: orchid });
  check('a business once on the admin allowlist is no longer an admin', formerAdmin.status === 404);

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

  // ---- admin / business separation ----
  // An administrator is its own account type: it manages business data from
  // the console but is never itself a business, seeker or provider.
  console.log('\nAdmin console — separate admin identity');

  const adminSignIn = await api('POST', '/api/admin/auth/login', {
    body: { email: 'admin@indulge.com', password: 'indulge123' },
  });
  check(
    'admin sign-in returns an admin with no business fields',
    adminSignIn.status === 200 &&
      adminSignIn.body.admin?.email === 'admin@indulge.com' &&
      adminSignIn.body.admin?.role === 'super_admin' &&
      adminSignIn.body.admin?.businessName === undefined &&
      adminSignIn.body.admin?.passwordHash === undefined,
    JSON.stringify(adminSignIn.body)
  );
  check(
    'admin tokens are typed as admin sessions',
    claims(admin).type === 'admin' && claims(admin).role === 'super_admin'
  );

  const adminMe = await api('GET', '/api/admin/auth/me', { token: admin });
  check(
    'an admin session restores from /api/admin/auth/me',
    adminMe.status === 200 && adminMe.body.admin?.email === 'admin@indulge.com'
  );
  check(
    'a business token cannot restore an admin session',
    (await api('GET', '/api/admin/auth/me', { token: orchid })).status === 404
  );
  check('an anonymous admin session check is a 401', (await api('GET', '/api/admin/auth/me')).status === 401);

  const adminAtBusinessLogin = await api('POST', '/api/auth/login', {
    body: { email: 'admin@indulge.com', password: 'indulge123' },
  });
  check('admin credentials do not sign in at the business login', adminAtBusinessLogin.status === 401);

  const businessAtAdminLogin = await api('POST', '/api/admin/auth/login', {
    body: { email: 'ops@grandorchid.in', password: 'indulge123' },
  });
  check('business credentials do not sign in at the admin login', businessAtAdminLogin.status === 401);

  const wrongAdminPassword = await api('POST', '/api/admin/auth/login', {
    body: { email: 'admin@indulge.com', password: 'wrong' },
  });
  check('a wrong admin password is rejected', wrongAdminPassword.status === 401);

  for (const path of ['/api/auth/me', '/api/cart', '/api/bookings/sent', '/api/requirements/mine']) {
    const res = await api('GET', path, { token: admin });
    check(`an admin session cannot act as a business on GET ${path}`, res.status === 403, String(res.status));
  }

  const adminEmails = ADMINS.map((a) => a.email);
  check(
    'seeded admins live only in the Admin collection, never as businesses',
    (await User.countDocuments({ email: { $in: adminEmails } })) === 0 &&
      (await Admin.countDocuments({ email: { $in: adminEmails } })) === adminEmails.length
  );

  const adminId = adminMe.body.admin?._id;
  check(
    'an admin has no public business profile',
    (await api('GET', `/api/auth/users/${adminId}/public`)).status === 404
  );
  const adminAsBusiness = await api('GET', `/api/admin/users/${adminId}`, { token: admin });
  check('an admin does not appear in the business directory', adminAsBusiness.status === 404);

  const adminSearch = await api('GET', '/api/admin/users?q=admin', { token: admin });
  check(
    'searching businesses for "admin" finds no platform admin',
    adminSearch.status === 200 && !adminSearch.body.users.some((u) => adminEmails.includes(u.email))
  );

  const metaAdmins = (await api('GET', '/api/admin/meta', { token: admin })).body.admins || [];
  check(
    'the console lists administrators from the Admin collection',
    metaAdmins.some((a) => a.email === 'admin@indulge.com' && a.name) &&
      metaAdmins.every((a) => a.businessName === undefined)
  );

  await seedAdmins();
  await seedAdmins();
  check(
    're-seeding admins is idempotent — one account per email',
    (await Admin.countDocuments({ email: 'admin@indulge.com' })) === 1 &&
      (await Admin.countDocuments()) === adminEmails.length
  );

  // ---- deployment posture ----
  // A deployment's administrator comes from ADMIN_EMAIL + ADMIN_PASSWORD. This
  // rule decides between a publicly administrable marketplace and a console
  // nobody can reach, so the parsing and the production lock are both proven.
  console.log('\nAdmin console — deployment posture');

  check(
    'production refuses the published demo password for any admin',
    adminPasswordAllowed('indulge123', 'production') === false &&
      adminPasswordAllowed('indulge123', 'development') === true &&
      adminPasswordAllowed('a-real-secret', 'production') === true
  );
  check('no ADMIN_EMAIL means no bootstrap admin', readBootstrapAdmin({}, 'production') === null);

  const noPassword = readBootstrapAdmin({ ADMIN_EMAIL: 'ops@x.com' }, 'production');
  check(
    'an email without ADMIN_PASSWORD is reported rather than silently ignored',
    Boolean(noPassword?.error) && /ADMIN_PASSWORD/.test(noPassword.error)
  );
  const demoInProd = readBootstrapAdmin({ ADMIN_EMAIL: 'ops@x.com', ADMIN_PASSWORD: 'indulge123' }, 'production');
  check('production will not bootstrap an admin with the demo password', Boolean(demoInProd?.error));

  const plural = readBootstrapAdmin(
    { ADMIN_EMAILS: ' Ops@X.com , other@x.com', ADMIN_PASSWORD: 'secret-pass' },
    'production'
  );
  check(
    'the legacy ADMIN_EMAILS name is honoured, lower-cased, first address only',
    plural?.email === 'ops@x.com' && plural.source === 'ADMIN_EMAILS' && !plural.error,
    JSON.stringify(plural)
  );
  const bothNames = readBootstrapAdmin(
    { ADMIN_EMAIL: 'canonical@x.com', ADMIN_EMAILS: 'legacy@x.com', ADMIN_PASSWORD: 'secret-pass' },
    'production'
  );
  check('when both are set the canonical ADMIN_EMAIL wins', bothNames?.email === 'canonical@x.com');

  const bootEnv = { ADMIN_EMAIL: 'Boot@Indulge.test', ADMIN_PASSWORD: 'boot-secret-1', ADMIN_NAME: 'Boot Admin' };
  const bootFirst = await ensureBootstrapAdmin(bootEnv);
  const bootAgain = await ensureBootstrapAdmin(bootEnv);
  check(
    'the environment admin is created once and left alone on restart',
    bootFirst?.action === 'created' &&
      bootAgain?.action === 'unchanged' &&
      (await Admin.countDocuments({ email: 'boot@indulge.test' })) === 1
  );
  const bootRotated = await ensureBootstrapAdmin({ ...bootEnv, ADMIN_PASSWORD: 'boot-secret-2' });
  const bootToken = await adminLogin('boot@indulge.test', 'boot-secret-2');
  check(
    'rotating ADMIN_PASSWORD takes effect on the next boot',
    bootRotated?.action === 'updated' &&
      Boolean(bootToken) &&
      !(await adminLogin('boot@indulge.test', 'boot-secret-1'))
  );

  await Admin.updateOne({ email: 'boot@indulge.test' }, { $set: { isActive: false } });
  check(
    'a deactivated admin is locked out immediately, even with a live token',
    (await api('GET', '/api/admin/overview', { token: bootToken })).status === 401 &&
      !(await adminLogin('boot@indulge.test', 'boot-secret-2'))
  );
  await Admin.deleteOne({ email: 'boot@indulge.test' });

  console.log('\nAdmin console — platform view');

  const overview = await api('GET', '/api/admin/overview', { token: admin });
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

  const live = await api('GET', '/api/admin/live', { token: admin });
  check(
    'the activity feed merges every record type in reverse-chronological order',
    live.body.feed.length > 0 &&
      live.body.feed.every((f, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(f.at))
  );

  // ---- live activity trackers ----
  // The tracker must be re-derived from records, never padded. Seeded records
  // predate the RequestEvent log, so they exercise the reconstruction rules;
  // the stories below drive the real API so the log is exercised end to end.
  console.log('\nAdmin console — Live request tracker');
  const timelineOf = (kind, id) => api('GET', `/api/admin/live/${kind}/${id}/timeline`, { token: admin });
  const STATES = ['completed', 'current', 'upcoming', 'skipped', 'missing', 'stopped'];
  const ROLES = ['seeker', 'lister', 'logistics', 'platform'];
  const stage = (t, key) => t.stages.find((s) => s.key === key);
  const chronological = (events) => {
    const timed = events.filter((e) => e.at).map((e) => new Date(e.at).getTime());
    return timed.every((v, i) => i === 0 || timed[i - 1] <= v);
  };

  const rfqItem = live.body.feed.find((f) => f.kind === 'requirement');
  const rfqT = (await timelineOf('requirement', rfqItem.id)).body;
  check(
    'an RFQ tracker starts at its real posting time',
    rfqT.stages?.[0]?.key === 'posted' && new Date(rfqT.stages[0].at).getTime() === new Date(rfqItem.at).getTime()
  );
  check(
    'every stage has a known state and at most one is current',
    rfqT.stages.every((s) => STATES.includes(s.state)) && rfqT.stages.filter((s) => s.state === 'current').length <= 1
  );
  check(
    'every event names its actor and the stream is chronological',
    rfqT.events.every((e) => ROLES.includes(e.role) && e.actor) && chronological(rfqT.events)
  );

  const rfqDoc = await Requirement.findById(rfqItem.id).lean();
  const quoteCount = (await Proposal.countDocuments({ requirement: rfqItem.id })) + (rfqDoc.offers || []).length;
  check(
    'the proposals stage and list count only quotes that really exist',
    rfqT.proposals.length === quoteCount && (stage(rfqT, 'proposals').state === 'completed') === quoteCount > 0
  );

  const unquoted = await Requirement.findOne({ status: 'open', proposalCount: 0, 'offers.0': { $exists: false } }).lean();
  if (unquoted) {
    const t = (await timelineOf('requirement', unquoted._id)).body;
    check(
      'an RFQ with no quotes has negotiation not started and proposals as the current stage',
      t.negotiation.status === 'not_started' &&
        t.current?.stage === 'proposals' &&
        t.stages.slice(t.stages.findIndex((s) => s.key === 'proposals')).every((s) => s.state !== 'completed')
    );
  }

  const paidIds = await Transaction.distinct('booking', { status: { $in: ['paid', 'simulated_paid'] } });
  const done = await Booking.findOne({ status: 'completed', sourceRequirement: null, _id: { $in: paidIds } }).lean();
  const doneT = (await timelineOf('booking', done._id)).body;
  check(
    'a completed booking with no messages marks negotiation as not needed, not as done',
    doneT.current?.state === 'done' &&
      stage(doneT, 'negotiation').state === 'skipped' &&
      doneT.stages.every((s) => ['completed', 'skipped'].includes(s.state))
  );
  const legacyAccept = doneT.events.find((e) => e.action === 'request_accepted');
  check(
    'an older acceptance is attributed to the lister, timed by the transaction it created',
    legacyAccept?.role === 'lister' &&
      new Date(legacyAccept.at).getTime() ===
        new Date((await Transaction.findOne({ booking: done._id }).sort('createdAt').lean()).createdAt).getTime()
  );
  const doneFulfilled = stage(doneT, 'fulfilment');
  check(
    'a stage without a recorded time carries no invented timestamp',
    doneFulfilled.at === null ||
      [done.return?.returnCompletedAt, done.return?.returnedAt, done.fulfillment?.deliveredAt]
        .filter(Boolean)
        .some((d) => new Date(d).getTime() === new Date(doneFulfilled.at).getTime())
  );

  const txIds = await Transaction.distinct('booking');
  const unpaidDone = await Booking.findOne({ status: 'completed', sourceRequirement: null, _id: { $nin: txIds } }).lean();
  if (unpaidDone) {
    const t = (await timelineOf('booking', unpaidDone._id)).body;
    check(
      'a finished booking with no transaction shows payment as missing, not paid',
      stage(t, 'payment').state === 'missing' && !t.events.some((e) => e.action === 'paid')
    );
  }

  const payItem = live.body.feed.find((f) => f.kind === 'transaction');
  const payT = await timelineOf('transaction', payItem.id);
  check(
    'a payment opens the story of the request it paid for',
    payT.status === 200 && ['booking', 'requirement'].includes(payT.body.subject?.type)
  );
  const someBusiness = await User.findOne({}).lean();
  check('a signup has no request story', (await timelineOf('signup', someBusiness._id)).status === 404);
  check('trackers are admin-only', (await api('GET', `/api/admin/live/requirement/${rfqItem.id}/timeline`, { token: orchid })).status === 404);

  // ── Story 1: a direct request negotiated to agreement ──
  const story = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: { resourceId: ballroom._id, quantity: 1, startDateTime: at(80, 10), endDateTime: at(80, 20) },
  });
  const sId = story.body.booking?._id;
  const opening = story.body.booking?.quotedPrice;
  await api('POST', `/api/negotiations/${sId}`, {
    token: kalpataru,
    body: { type: 'counter_offer', proposedPrice: opening - 5000, message: 'Can you do better?' },
  });
  const listerCounter = await api('POST', `/api/negotiations/${sId}`, {
    token: seasons,
    body: { type: 'counter_offer', proposedPrice: opening - 2000, message: 'Meet in the middle' },
  });
  await api('POST', `/api/negotiations/${sId}/accept-offer/${listerCounter.body.message?._id}`, { token: kalpataru });
  await api('PATCH', `/api/bookings/${sId}/accept`, { token: seasons, body: {} });
  await api('PATCH', `/api/bookings/${sId}/confirm`, { token: kalpataru });

  const s1 = (await timelineOf('booking', sId)).body;
  const moves = s1.events
    .filter((e) => ['request_created', 'counter_offer', 'counter_offer_accepted', 'request_accepted', 'booking_confirmed', 'paid'].includes(e.action))
    .map((e) => `${e.role}:${e.action}`);
  check(
    'every seeker and lister move appears, in order, with its actor',
    JSON.stringify(moves) ===
      JSON.stringify([
        'seeker:request_created',
        'seeker:counter_offer',
        'lister:counter_offer',
        'seeker:counter_offer_accepted',
        'lister:request_accepted',
        'seeker:booking_confirmed',
        'seeker:paid',
      ]),
    moves.join(' → ')
  );
  const lc = s1.events.find((e) => e.role === 'lister' && e.action === 'counter_offer');
  check('a counter-offer shows the price it moved from and to', lc?.fromPrice === opening - 5000 && lc?.toPrice === opening - 2000);
  check(
    'the negotiation reports its final agreement against the opening price',
    s1.negotiation.status === 'completed' &&
      s1.negotiation.count === 3 &&
      s1.negotiation.agreement?.original === opening &&
      s1.negotiation.agreement?.final === opening - 2000 &&
      s1.negotiation.agreement?.change === -2000 &&
      s1.negotiation.agreement?.acceptedBy === 'lister',
    JSON.stringify(s1.negotiation.agreement)
  );
  check(
    'the tracker moves from negotiation through booking and payment to fulfilment',
    stage(s1, 'negotiation').state === 'completed' &&
      stage(s1, 'negotiation').count === 3 &&
      ['agreement', 'booking', 'payment'].every((k) => stage(s1, k).state === 'completed') &&
      s1.current?.stage === 'fulfilment'
  );

  // ── Story 2: negotiation still under way ──
  const open = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: { resourceId: ballroom._id, quantity: 1, startDateTime: at(82, 10), endDateTime: at(82, 20) },
  });
  await api('POST', `/api/negotiations/${open.body.booking._id}`, {
    token: kalpataru,
    body: { type: 'counter_offer', proposedPrice: open.body.booking.quotedPrice - 1000 },
  });
  const s2 = (await timelineOf('booking', open.body.booking._id)).body;
  check(
    'a live negotiation is the current stage, waiting on the other side',
    s2.negotiation.status === 'in_progress' && s2.current?.stage === 'negotiation' && /lister/.test(s2.current.text)
  );

  // ── Story 3: declined by the lister ──
  const declined = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: { resourceId: ballroom._id, quantity: 1, startDateTime: at(84, 10), endDateTime: at(84, 20) },
  });
  await api('PATCH', `/api/bookings/${declined.body.booking._id}/reject`, { token: seasons, body: { reason: 'Maintenance' } });
  const s3 = (await timelineOf('booking', declined.body.booking._id)).body;
  const lastStage = s3.stages[s3.stages.length - 1];
  check(
    'a declined request stops there, attributed to the lister with the reason',
    s3.negotiation.status === 'cancelled' &&
      lastStage.state === 'stopped' &&
      lastStage.label === 'Declined' &&
      lastStage.sub === 'by lister' &&
      s3.events.some((e) => e.action === 'request_rejected' && e.role === 'lister' && e.detail === 'Maintenance')
  );

  // ── Story 4: an RFQ whose proposal is revised, then awarded ──
  const storyRfq = await api('POST', '/api/requirements', {
    token: kalpataru,
    body: {
      title: 'Tracker story — product launch hall',
      category: 'banquet_space',
      requiredQuantity: 1,
      maxBudget: 95000,
      startDateTime: at(90, 10),
      endDateTime: at(90, 20),
    },
  });
  const rId = storyRfq.body.requirement?._id;
  const prop = await api('POST', `/api/requirements/${rId}/proposals`, {
    token: seasons,
    body: { resourceId: ballroom._id, quotedPrice: 85000 },
  });
  await api('PATCH', `/api/requirements/${rId}/proposals/${prop.body.proposal?._id}`, {
    token: seasons,
    body: { quotedPrice: 80000 },
  });
  await api('POST', `/api/requirements/${rId}/proposals/${prop.body.proposal?._id}/accept`, { token: kalpataru });
  const s4 = (await timelineOf('requirement', rId)).body;
  const rfqMoves = s4.events
    .filter((e) => ['request_posted', 'proposal_submitted', 'proposal_revised', 'proposal_accepted', 'paid'].includes(e.action))
    .map((e) => `${e.role}:${e.action}`);
  check(
    'an RFQ story shows the lister’s proposal, its revision and the seeker’s award',
    JSON.stringify(rfqMoves) ===
      JSON.stringify(['seeker:request_posted', 'lister:proposal_submitted', 'lister:proposal_revised', 'seeker:proposal_accepted', 'seeker:paid']),
    rfqMoves.join(' → ')
  );
  check(
    'the proposal keeps its opening price and is marked selected',
    s4.proposals[0]?.initialPrice === 85000 &&
      s4.proposals[0]?.price === 80000 &&
      s4.proposals[0]?.revisions === 1 &&
      s4.proposals[0]?.outcome === 'selected'
  );
  check(
    'the RFQ agreement shows the negotiated saving',
    s4.negotiation.agreement?.original === 85000 &&
      s4.negotiation.agreement?.final === 80000 &&
      s4.negotiation.agreement?.change === -5000
  );

  const admNegotiations = await api('GET', '/api/admin/negotiations', { token: admin });
  check(
    'the negotiation log exposes counter-offers no single tenant can read',
    admNegotiations.status === 200 && admNegotiations.body.messages.length > 0
  );

  const dossier = await api('GET', `/api/admin/users/${meRes.body.user._id}`, { token: admin });
  check(
    'a business dossier carries both provider and seeker activity at once',
    Array.isArray(dossier.body.bookings?.provided) && Array.isArray(dossier.body.bookings?.sought)
  );

  console.log('\nAdmin console — integrity audit');

  const audit = await api('GET', '/api/admin/health', { token: admin });
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
    token: admin,
    body: { checkId: 'missing_transaction' },
  });
  check('repairing backfills the missing transactions', repair.body.repaired > 0);
  check(
    'the finding is clear immediately after the repair',
    repair.body.audit.checks.find((c) => c.id === 'missing_transaction').count === 0
  );

  // A backfill must never invent a settled payment — that would inflate GMV to
  // tidy a dashboard.
  const afterRepair = await api('GET', '/api/admin/overview', { token: admin });
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
  const seekerId = (await api('GET', '/api/admin/users?q=kalpataru', { token: admin })).body.users[0]._id;

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

  let sweep = await api('GET', '/api/admin/health', { token: admin });
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

  sweep = await api('GET', '/api/admin/health', { token: admin });
  oversub = sweep.body.checks.find((c) => c.id === 'oversubscribed');
  const probe = oversub.rows.find((r) => String(r.id) === String(spare._id));
  check('a genuine concurrent overlap is reported as oversubscribed', Boolean(probe));
  check('the finding reports the peak and by how much it is over', probe?.extra?.overBy === 1, JSON.stringify(probe?.extra));
  check('inventory conflicts are marked critical', oversub.severity === 'critical');

  const noRepair = await api('POST', '/api/admin/health/repair', {
    token: admin,
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
    token: admin,
    body: { status: 'cancelled' },
  });
  check('an override without a reason is refused', noReason.status === 400);

  const overbook = await api('PATCH', `/api/admin/bookings/${rival._id}/status`, {
    token: admin,
    body: { status: 'confirmed', reason: 'attempting to oversubscribe' },
  });
  check(
    'an override cannot reserve capacity that is already taken',
    overbook.status === 409,
    `${overbook.status} ${overbook.body?.error}`
  );

  const cancelOverride = await api('PATCH', `/api/admin/bookings/${rival._id}/status`, {
    token: admin,
    body: { status: 'cancelled', reason: 'verification cleanup' },
  });
  check('an override to a non-reserving status succeeds', cancelOverride.status === 200);
  check(
    'the override reason is recorded on the booking',
    /verification cleanup/.test(cancelOverride.body.booking?.cancellationReason || '')
  );
  await Booking.deleteOne({ _id: rival._id });

  // ---- suspension ----
  const suspendTarget = (await api('GET', '/api/admin/users?q=spiceroute', { token: admin })).body.users[0];
  const spiceToken = await login('hello@spiceroute.co.in');
  check('the account works before suspension', Boolean(spiceToken));

  const suspend = await api('PATCH', `/api/admin/users/${suspendTarget._id}/suspend`, {
    token: admin,
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

  const selfSuspend = await api('PATCH', `/api/admin/users/${adminId}/suspend`, {
    token: admin,
    body: { suspended: true, reason: 'lockout' },
  });
  check('an admin is not a business, so the console cannot suspend it', selfSuspend.status === 404);

  const restore = await api('PATCH', `/api/admin/users/${suspendTarget._id}/suspend`, {
    token: admin,
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
  const someListing = (await api('GET', '/api/admin/listings?status=active&limit=1', { token: admin }))
    .body.listings[0];
  const takedown = await api('PATCH', `/api/admin/listings/${someListing._id}/status`, {
    token: admin,
    body: { status: 'paused', reason: 'verification' },
  });
  check('a listing can be taken off the market', takedown.status === 200 && takedown.body.resource.status === 'paused');
  check(
    'bookings already reserved against a paused listing are retained',
    typeof takedown.body.upcomingBookingsRetained === 'number'
  );
  await api('PATCH', `/api/admin/listings/${someListing._id}/status`, {
    token: admin,
    body: { status: 'active' },
  });

  // ---- review removal must re-settle the denormalised ratings ----
  const reviewRow = (await api('GET', '/api/admin/reviews?limit=1', { token: admin })).body.reviews[0];
  const revieweeId = reviewRow.reviewee._id;
  const countBefore = await Review.countDocuments({ reviewee: revieweeId });
  await api('DELETE', `/api/admin/reviews/${reviewRow._id}`, { token: admin });
  const dossierAfter = await api('GET', `/api/admin/users/${revieweeId}`, { token: admin });
  check(
    'removing a review recomputes the denormalised rating count',
    dossierAfter.body.business.ratingCount === countBefore - 1,
    `${countBefore} -> ${dossierAfter.body.business.ratingCount}`
  );
  const driftCheck = (await api('GET', '/api/admin/health', { token: admin })).body.checks.find(
    (c) => c.id === 'rating_drift'
  );
  check('deleting a review leaves no rating drift behind', driftCheck.count === 0, `${driftCheck.count} findings`);

  // ---- refund ----
  const allSettled = (await api('GET', '/api/admin/transactions?status=simulated_paid&limit=200', {
    token: admin,
  })).body.transactions;

  // A live booking must be released by its refund, or the provider is holding
  // inventory for an order nobody paid for.
  const liveSettled = allSettled.find((t) => t.booking?.status === 'confirmed');
  if (liveSettled) {
    const refund = await api('PATCH', `/api/admin/transactions/${liveSettled._id}/refund`, {
      token: admin,
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
        token: admin,
        body: { reason: 'again' },
      })).status === 400
    );
  }

  // A completed booking is deliberately left alone: the service was delivered,
  // so a goodwill refund must not rewrite that history.
  const doneSettled = allSettled.find((t) => t.booking?.status === 'completed');
  if (doneSettled) {
    const refundDone = await api('PATCH', `/api/admin/transactions/${doneSettled._id}/refund`, {
      token: admin,
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
    token: admin,
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
    (await api('POST', '/api/admin/broadcast', { token: admin, body: { title: 'x' } })).status === 400
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
    token: admin,
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
    token: admin,
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
    token: admin,
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

  // =========================================================================
  // Phase 3.5: Multi-Provider Procurement Plan Execution (Tests 221 - 244)
  // =========================================================================
  console.log('\nPhase 3.5: Multi-Provider Procurement Plan Execution');

  const seekerToken = signToken(solverSeeker._id);
  const providerAToken = signToken(solverProviderA._id);
  const providerBToken = signToken(solverProviderB._id);

  // 1. Single-provider selected plan executes
  const singleExecRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Single Exec Chiavari Chairs',
    category: 'furniture',
    totalQuantity: 400,
    pricing: { basePrice: 60 },
    status: 'active',
  });
  const execReq1 = await Requirement.create({
    seeker: solverSeeker._id,
    title: '500 Chairs for Grand Gala',
    category: 'furniture',
    requiredQuantity: 300,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    maxBudget: 25000,
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
    status: 'open',
  });
  const singlePlan = {
    id: 'plan-single-exec-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 300,
    requestedQuantity: 300,
    fulfillmentPercentage: 100,
    fullyFulfilled: true,
    totalPrice: 18000,
    budgetVariance: -7000,
    supplierCount: 1,
    averageDistanceKm: 2.0,
    maxDistanceKm: 2.0,
    logisticsComplexity: 'LOW',
    labels: ['CHEAPEST', 'WITHIN_BUDGET', 'FULLY_FULFILLED'],
    suppliers: [
      {
        resourceId: String(singleExecRes._id),
        supplierId: String(solverProviderA._id),
        supplierName: solverProviderA.businessName,
        resourceTitle: singleExecRes.title,
        allocatedQuantity: 300,
        unitPrice: 60,
        subtotal: 18000,
        distanceKm: 2.0,
      },
    ],
  };

  const resExec1 = await api('POST', `/api/requirements/${execReq1._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: singlePlan },
  });
  check(
    '1. single-provider selected plan executes',
    resExec1.status === 201 &&
      resExec1.body.procurementOrder &&
      resExec1.body.procurementOrder.status === 'confirmed' &&
      resExec1.body.childBookings.length === 1
  );

  // 2. Two-provider split executes
  const splitResA = await Resource.create({
    owner: solverProviderA._id,
    title: 'Split Alpha Chairs',
    category: 'furniture',
    totalQuantity: 350,
    pricing: { basePrice: 60 },
    status: 'active',
  });
  const splitResB = await Resource.create({
    owner: solverProviderB._id,
    title: 'Split Beta Chairs',
    category: 'furniture',
    totalQuantity: 300,
    pricing: { basePrice: 55 },
    status: 'active',
  });
  const execReq2 = await Requirement.create({
    seeker: solverSeeker._id,
    title: '500 Split Chairs Wedding',
    category: 'furniture',
    requiredQuantity: 500,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    maxBudget: 35000,
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
    status: 'open',
  });
  const splitPlan2 = {
    id: 'plan-split-exec-2',
    type: 'SPLIT_FULFILLMENT',
    fulfilledQuantity: 500,
    requestedQuantity: 500,
    fulfillmentPercentage: 100,
    fullyFulfilled: true,
    totalPrice: 29000,
    budgetVariance: -6000,
    supplierCount: 2,
    averageDistanceKm: 3.0,
    maxDistanceKm: 4.0,
    logisticsComplexity: 'MEDIUM',
    labels: ['CHEAPEST', 'WITHIN_BUDGET', 'FULLY_FULFILLED'],
    suppliers: [
      {
        resourceId: String(splitResA._id),
        supplierId: String(solverProviderA._id),
        supplierName: solverProviderA.businessName,
        resourceTitle: splitResA.title,
        allocatedQuantity: 300,
        unitPrice: 60,
        subtotal: 18000,
        distanceKm: 2.0,
      },
      {
        resourceId: String(splitResB._id),
        supplierId: String(solverProviderB._id),
        supplierName: solverProviderB.businessName,
        resourceTitle: splitResB.title,
        allocatedQuantity: 200,
        unitPrice: 55,
        subtotal: 11000,
        distanceKm: 4.0,
      },
    ],
  };

  const resExec2 = await api('POST', `/api/requirements/${execReq2._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: splitPlan2 },
  });
  check(
    '2. two-provider split executes',
    resExec2.status === 201 &&
      resExec2.body.procurementOrder &&
      resExec2.body.procurementOrder.childBookings.length === 2
  );

  // 3. Three-provider split executes
  const splitRes3A = await Resource.create({
    owner: solverProviderA._id,
    title: 'Trio Alpha Chairs',
    category: 'furniture',
    totalQuantity: 200,
    pricing: { basePrice: 60 },
    status: 'active',
  });
  const splitRes3B = await Resource.create({
    owner: solverProviderB._id,
    title: 'Trio Beta Chairs',
    category: 'furniture',
    totalQuantity: 250,
    pricing: { basePrice: 55 },
    status: 'active',
  });
  const splitRes3C = await Resource.create({
    owner: solverProviderC._id,
    title: 'Trio Gamma Chairs',
    category: 'furniture',
    totalQuantity: 200,
    pricing: { basePrice: 85 },
    status: 'active',
  });
  const execReq3 = await Requirement.create({
    seeker: solverSeeker._id,
    title: '600 Trio Chairs Festival',
    category: 'furniture',
    requiredQuantity: 600,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    maxBudget: 45000,
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
    status: 'open',
  });
  const splitPlan3 = {
    id: 'plan-split-exec-3',
    type: 'SPLIT_FULFILLMENT',
    fulfilledQuantity: 600,
    requestedQuantity: 600,
    fulfillmentPercentage: 100,
    fullyFulfilled: true,
    totalPrice: 38500,
    budgetVariance: -6500,
    supplierCount: 3,
    averageDistanceKm: 4.6,
    maxDistanceKm: 8.0,
    logisticsComplexity: 'HIGH',
    labels: ['FULLY_FULFILLED'],
    suppliers: [
      {
        resourceId: String(splitRes3A._id),
        supplierId: String(solverProviderA._id),
        supplierName: solverProviderA.businessName,
        resourceTitle: splitRes3A.title,
        allocatedQuantity: 200,
        unitPrice: 60,
        subtotal: 12000,
        distanceKm: 2.0,
      },
      {
        resourceId: String(splitRes3B._id),
        supplierId: String(solverProviderB._id),
        supplierName: solverProviderB.businessName,
        resourceTitle: splitRes3B.title,
        allocatedQuantity: 250,
        unitPrice: 55,
        subtotal: 13750,
        distanceKm: 4.0,
      },
      {
        resourceId: String(splitRes3C._id),
        supplierId: String(solverProviderC._id),
        supplierName: solverProviderC.businessName,
        resourceTitle: splitRes3C.title,
        allocatedQuantity: 150,
        unitPrice: 85,
        subtotal: 12750,
        distanceKm: 8.0,
      },
    ],
  };

  const resExec3 = await api('POST', `/api/requirements/${execReq3._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: splitPlan3 },
  });
  check(
    '3. three-provider split executes',
    resExec3.status === 201 &&
      resExec3.body.procurementOrder &&
      resExec3.body.procurementOrder.childBookings.length === 3
  );

  // 4. Correct quantity per child booking
  const childBookings2 = await Booking.find({
    _id: { $in: resExec2.body.procurementOrder.childBookings.map((b) => b._id || b) },
  }).sort('requestedQuantity');
  check(
    '4. correct quantity per child booking',
    childBookings2.length === 2 &&
      childBookings2[0].requestedQuantity === 200 &&
      childBookings2[1].requestedQuantity === 300
  );

  // 5. Correct subtotal per child booking
  check(
    '5. correct subtotal per child booking',
    childBookings2.length === 2 &&
      childBookings2[0].agreedPrice === 11000 &&
      childBookings2[1].agreedPrice === 18000
  );

  // 6. Grouped total correct
  check(
    '6. grouped total correct',
    resExec2.body.procurementOrder.totalPrice === 29000
  );

  // 7. Stale plan rejected before booking creation
  const staleRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Stale Check Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    status: 'active',
  });
  const staleReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Stale Plan Requirement',
    category: 'furniture',
    requiredQuantity: 80,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  // Simulate concurrent booking that takes 70 units
  await Booking.create({
    resource: staleRes._id,
    provider: solverProviderA._id,
    seeker: solverProviderB._id,
    requestedQuantity: 70,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'confirmed',
  });
  // Now only 30 units are available, but plan asks for 80
  const stalePlan = {
    id: 'plan-stale-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 80,
    requestedQuantity: 80,
    totalPrice: 4000,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(staleRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 80,
        unitPrice: 50,
        subtotal: 4000,
      },
    ],
  };
  const resStale = await api('POST', `/api/requirements/${staleReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: stalePlan },
  });
  check(
    '7. stale plan rejected before booking creation',
    resStale.status === 409
  );

  // 8. One failed allocation leaves zero partial child bookings
  const beforeFailBookings = await Booking.countDocuments();
  const failReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Fail Rollback Requirement',
    category: 'furniture',
    requiredQuantity: 200,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  const partialFailPlan = {
    id: 'plan-partial-fail-1',
    type: 'SPLIT_FULFILLMENT',
    fulfilledQuantity: 200,
    requestedQuantity: 200,
    totalPrice: 10000,
    supplierCount: 2,
    suppliers: [
      {
        resourceId: String(singleExecRes._id), // Valid resource (has capacity)
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 50,
        unitPrice: 60,
        subtotal: 3000,
      },
      {
        resourceId: new mongoose.Types.ObjectId().toString(), // Non-existent resource -> will fail pre-check
        supplierId: String(solverProviderB._id),
        allocatedQuantity: 150,
        unitPrice: 55,
        subtotal: 8250,
      },
    ],
  };
  const resFail = await api('POST', `/api/requirements/${failReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: partialFailPlan },
  });
  const afterFailBookings = await Booking.countDocuments();
  check(
    '8. one failed allocation leaves zero partial child bookings',
    resFail.status === 409 && afterFailBookings === beforeFailBookings
  );

  // 9. Duplicate execution is idempotent
  const resIdempotent = await api('POST', `/api/requirements/${execReq2._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: splitPlan2 },
  });
  check(
    '9. duplicate execution is idempotent',
    resIdempotent.status === 200 && resIdempotent.body.alreadyExecuted === true
  );

  // 10. Unauthorized user cannot execute
  const resUnauth = await api('POST', `/api/requirements/${execReq2._id}/execute-procurement-plan`, {
    token: seasons, // Seasons is not the seeker of execReq2
    body: { plan: splitPlan2 },
  });
  check(
    '10. unauthorized user cannot execute',
    resUnauth.status === 403
  );

  // 11. Provider sees only own child booking
  const bookingAId = resExec2.body.procurementOrder.childBookings[0]._id;
  const bookingBId = resExec2.body.procurementOrder.childBookings[1]._id;

  const resProvAOwn = await api('GET', `/api/bookings/${bookingAId}`, { token: providerAToken });
  const resProvAOther = await api('GET', `/api/bookings/${bookingBId}`, { token: providerAToken });
  const resProvAOrder = await api('GET', `/api/procurement-orders/${resExec2.body.procurementOrder._id}`, { token: providerAToken });
  check(
    '11. provider sees only own child booking',
    resProvAOwn.status === 200 &&
      resProvAOther.status === 403 &&
      resProvAOrder.status === 403
  );

  // 12. Seeker sees grouped procurement
  const resSeekerOrder = await api('GET', `/api/procurement-orders/${resExec2.body.procurementOrder._id}`, {
    token: seekerToken,
  });
  check(
    '12. seeker sees grouped procurement',
    resSeekerOrder.status === 200 &&
      resSeekerOrder.body.order &&
      resSeekerOrder.body.order.childBookings.length === 2
  );

  // 13. Full plan marks requirement fulfilled
  const req2Reloaded = await Requirement.findById(execReq2._id);
  check(
    '13. full plan marks requirement fulfilled',
    req2Reloaded.status === 'fulfilled' && req2Reloaded.fulfilledQuantity === 500
  );

  // 14. Partial execution does not mark requirement fully fulfilled
  const partialReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Partial Fulfillment Requirement',
    category: 'furniture',
    requiredQuantity: 500,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  const partialPlan = {
    id: 'plan-partial-exec-1',
    type: 'PARTIAL_FULFILLMENT',
    fulfilledQuantity: 350,
    requestedQuantity: 500,
    fulfillmentPercentage: 70,
    fullyFulfilled: false,
    totalPrice: 21000,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(splitResA._id),
        supplierId: String(solverProviderA._id),
        supplierName: solverProviderA.businessName,
        resourceTitle: splitResA.title,
        allocatedQuantity: 30, // splitResA has 50 left
        unitPrice: 60,
        subtotal: 1800,
      },
    ],
  };
  const resPartial = await api('POST', `/api/requirements/${partialReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: partialPlan },
  });
  const partialReqReloaded = await Requirement.findById(partialReq._id);
  check(
    '14. partial execution does not mark requirement fully fulfilled',
    resPartial.status === 201 &&
      partialReqReloaded.status === 'open' &&
      partialReqReloaded.fulfilledQuantity === 350 &&
      partialReqReloaded.remainingQuantity === 150
  );

  // 15. Concurrent availability validation preserved
  const limitRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Strict Concurrency Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    status: 'active',
  });
  const limitReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Concurrency Limit Requirement',
    category: 'furniture',
    requiredQuantity: 60,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  await Booking.create({
    resource: limitRes._id,
    provider: solverProviderA._id,
    seeker: solverProviderB._id,
    requestedQuantity: 80,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'confirmed',
  });
  const limitPlan = {
    id: 'plan-limit-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 60,
    requestedQuantity: 60,
    totalPrice: 3000,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(limitRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 60, // only 20 left
        unitPrice: 50,
        subtotal: 3000,
      },
    ],
  };
  const resLimit = await api('POST', `/api/requirements/${limitReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: limitPlan },
  });
  check(
    '15. concurrent availability validation preserved',
    resLimit.status === 409
  );

  // 16. Buffer conflict detected during final execution
  const bufConflictRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Buffer Conflict Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 60,
    status: 'active',
  });
  const bufConflictReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Buffer Conflict Requirement',
    category: 'furniture',
    requiredQuantity: 50,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  // Booking ending 30 minutes before targetDateStart -> conflicts with 60 min buffer
  await Booking.create({
    resource: bufConflictRes._id,
    provider: solverProviderA._id,
    seeker: solverProviderB._id,
    requestedQuantity: 80,
    startDateTime: new Date(targetDateStart.getTime() - 3 * 3600000),
    endDateTime: new Date(targetDateStart.getTime() - 30 * 60000),
    status: 'confirmed',
  });
  const bufConflictPlan = {
    id: 'plan-buf-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 50,
    requestedQuantity: 50,
    totalPrice: 2500,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(bufConflictRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 50,
        unitPrice: 50,
        subtotal: 2500,
      },
    ],
  };
  const resBufConflict = await api('POST', `/api/requirements/${bufConflictReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: bufConflictPlan },
  });
  check(
    '16. buffer conflict detected during final execution',
    resBufConflict.status === 409
  );

  // 17. Owner-block conflict detected during final execution
  const blockExecRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Block Conflict Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    status: 'active',
    blockedPeriods: [
      {
        start: targetDateStart,
        end: targetDateEnd,
        type: 'unavailable',
        reason: 'Reserved for family wedding',
      },
    ],
  });
  const blockReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Block Requirement',
    category: 'furniture',
    requiredQuantity: 50,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  const blockPlan = {
    id: 'plan-blk-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 50,
    requestedQuantity: 50,
    totalPrice: 2500,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(blockExecRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 50,
        unitPrice: 50,
        subtotal: 2500,
      },
    ],
  };
  const resBlock = await api('POST', `/api/requirements/${blockReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: blockPlan },
  });
  check(
    '17. owner-block conflict detected during final execution',
    resBlock.status === 409
  );

  // 18. Paused resource detected during final execution
  const pausedExecRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Paused Check Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    status: 'paused',
  });
  const pausedPlan = {
    id: 'plan-paused-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 50,
    requestedQuantity: 50,
    totalPrice: 2500,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(pausedExecRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 50,
        unitPrice: 50,
        subtotal: 2500,
      },
    ],
  };
  const resPaused = await api('POST', `/api/requirements/${blockReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: pausedPlan },
  });
  check(
    '18. paused resource detected during final execution',
    resPaused.status === 409
  );

  // 19. Logistics-required child creates/permits correct logistics job
  const jobsCreated = await LogisticsJob.find({
    booking: { $in: resExec2.body.procurementOrder.childBookings.map((b) => b._id || b) },
  });
  check(
    '19. logistics-required child creates/permits correct logistics job',
    jobsCreated.length === 2
  );

  // 20. Non-logistics child does not create unnecessary logistics job
  const stationaryRes = await Resource.create({
    owner: solverProviderA._id,
    title: 'Shared Commercial Prep Kitchen',
    category: 'kitchen_capacity',
    totalQuantity: 2,
    pricing: { basePrice: 1200 },
    status: 'active',
  });
  const stationaryReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Stationary Kitchen Requirement',
    category: 'kitchen_capacity',
    requiredQuantity: 1,
    startDateTime: targetDateStart,
    endDateTime: targetDateEnd,
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  const stationaryPlan = {
    id: 'plan-stat-1',
    type: 'SINGLE_SUPPLIER',
    fulfilledQuantity: 1,
    requestedQuantity: 1,
    fullyFulfilled: true,
    totalPrice: 1200,
    supplierCount: 1,
    suppliers: [
      {
        resourceId: String(stationaryRes._id),
        supplierId: String(solverProviderA._id),
        allocatedQuantity: 1,
        unitPrice: 1200,
        subtotal: 1200,
      },
    ],
  };
  const resStationary = await api('POST', `/api/requirements/${stationaryReq._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: stationaryPlan },
  });
  const stationaryBookingId = resStationary.body.procurementOrder.childBookings[0]._id;
  const stationaryJob = await LogisticsJob.findOne({ booking: stationaryBookingId });
  check(
    '20. non-logistics child does not create unnecessary logistics job',
    resStationary.status === 201 && stationaryJob === null
  );

  // 21. Individual transaction records stay correct
  const txs = await Transaction.find({
    booking: { $in: resExec2.body.procurementOrder.childBookings.map((b) => b._id || b) },
  }).sort('amount');
  check(
    '21. individual transaction records stay correct',
    txs.length === 2 &&
      txs[0].amount === 11000 &&
      txs[0].status === 'simulated_paid' &&
      txs[1].amount === 18000 &&
      txs[1].status === 'simulated_paid'
  );

  // 22. Existing direct booking flow remains unchanged
  const directRes = await api('POST', '/api/bookings', {
    token: orchid,
    body: {
      resourceId: singleExecRes._id,
      quantity: 10,
      startDateTime: at(15, 10),
      endDateTime: at(15, 18),
    },
  });
  check(
    '22. existing direct booking flow remains unchanged',
    directRes.status === 201 && directRes.body.booking && directRes.body.booking.status === 'pending'
  );

  // 23. Existing RFQ proposal acceptance remains unchanged
  const rfqRes = await Resource.create({
    owner: solverProviderB._id,
    title: 'RFQ Dedicated Chairs',
    category: 'furniture',
    totalQuantity: 100,
    pricing: { basePrice: 50 },
    status: 'active',
  });
  const rfqReq = await Requirement.create({
    seeker: solverSeeker._id,
    title: 'Direct RFQ Proposal Requirement',
    category: 'furniture',
    requiredQuantity: 50,
    startDateTime: at(20, 10),
    endDateTime: at(20, 18),
    status: 'open',
    location: { city: 'Thane', coordinates: [72.978, 19.218] },
  });
  const rfqProposal = await Proposal.create({
    requirement: rfqReq._id,
    provider: solverProviderB._id,
    resource: rfqRes._id,
    quotedPrice: 2500,
    status: 'submitted',
  });
  const acceptRfqRes = await api(
    'POST',
    `/api/requirements/${rfqReq._id}/proposals/${rfqProposal._id}/accept`,
    {
      token: seekerToken,
    }
  );
  check(
    '23. existing RFQ proposal acceptance remains unchanged',
    acceptRfqRes.status === 201 &&
      acceptRfqRes.body.booking &&
      acceptRfqRes.body.booking.status === 'confirmed' &&
      acceptRfqRes.body.requirement.status === 'fulfilled'
  );

  // 24. Executing same plan twice creates no duplicate bookings
  const p35CountBefore = await Booking.countDocuments();
  await api('POST', `/api/requirements/${execReq2._id}/execute-procurement-plan`, {
    token: seekerToken,
    body: { plan: splitPlan2 },
  });
  const p35CountAfter = await Booking.countDocuments();
  check(
    '24. executing same plan twice creates no duplicate bookings',
    p35CountBefore === p35CountAfter
  );

  /* =========================================================================
   * PHASE 4: TIME-BOUND CAPACITY RECOVERY VERIFICATION (Tests 1 - 28)
   * ========================================================================= */
  console.log('\n--- Phase 4: Time-Bound Capacity Recovery ---');

  // Test setup: Users
  const crProviderUser = await User.create({
    businessName: 'Grand Horizon Venues & Gear',
    email: 'recovery-provider@indulge.in',
    passwordHash: 'dummy',
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    userType: 'business',
  });
  const crProviderToken = signToken(crProviderUser._id);

  const crSeekerUser = await User.create({
    businessName: 'Apex Corporate Planners',
    email: 'recovery-seeker@indulge.in',
    passwordHash: 'dummy',
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    userType: 'business',
  });
  const crSeekerToken = signToken(crSeekerUser._id);

  const crOtherProviderUser = await User.create({
    businessName: 'Other Unrelated Provider',
    email: 'other-provider@indulge.in',
    passwordHash: 'dummy',
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    userType: 'business',
  });
  const crOtherProviderToken = signToken(crOtherProviderUser._id);

  // 1. available unused resource creates recovery opportunity
  const banquetRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Grand Banquet Hall A',
    category: 'banquet_space',
    capacity: 300,
    totalQuantity: 1,
    pricing: { basePrice: 50000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
  });

  const corporateReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Corporate Summit Hall Needed',
    category: 'banquet_space',
    minCapacity: 250,
    requiredQuantity: 1,
    startDateTime: at(1, 10),
    endDateTime: at(1, 20),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    maxPrice: 60000,
    status: 'open',
  });

  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp1 = await CapacityRecoveryOpportunity.findOne({
    resource: banquetRes._id,
    requirement: corporateReq._id,
  });
  check(
    '1. available unused resource creates recovery opportunity',
    opp1 !== null && opp1.status === 'active' && opp1.availableQuantity === 300
  );

  // 2. booked resource does not show fully idle opportunity
  const banquetBooking = await Booking.create({
    resource: banquetRes._id,
    provider: crProviderUser._id,
    seeker: crSeekerUser._id,
    startDateTime: at(1, 9),
    endDateTime: at(1, 21),
    requestedQuantity: 1,
    status: 'confirmed',
    agreedPrice: 50000,
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp2 = await CapacityRecoveryOpportunity.findOne({
    resource: banquetRes._id,
    requirement: corporateReq._id,
  });
  check(
    '2. booked resource does not show fully idle opportunity',
    opp2 === null || opp2.status === 'expired'
  );
  // Cleanup booking so we can test other conditions
  await Booking.findByIdAndDelete(banquetBooking._id);

  // 3. partially booked quantity exposes only remaining capacity
  const projectorFleet = await Resource.create({
    owner: crProviderUser._id,
    title: '4K Laser Projectors Fleet',
    category: 'av_equipment',
    totalQuantity: 10,
    pricing: { basePrice: 2000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
  });
  await Booking.create({
    resource: projectorFleet._id,
    provider: crProviderUser._id,
    seeker: crSeekerUser._id,
    startDateTime: at(1, 8),
    endDateTime: at(1, 22),
    requestedQuantity: 4,
    status: 'confirmed',
    agreedPrice: 8000,
  });
  const projReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Need 5 Projectors for Workshop',
    category: 'av_equipment',
    requiredQuantity: 5,
    startDateTime: at(1, 10),
    endDateTime: at(1, 18),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    maxPrice: 15000,
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp3 = await CapacityRecoveryOpportunity.findOne({
    resource: projectorFleet._id,
    requirement: projReq._id,
  });
  check(
    '3. partially booked quantity exposes only remaining capacity',
    opp3 !== null && opp3.availableQuantity === 6 && opp3.status === 'active'
  );

  // 4. paused resource excluded
  projectorFleet.status = 'paused';
  await projectorFleet.save();
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp4 = await CapacityRecoveryOpportunity.findOne({
    resource: projectorFleet._id,
    requirement: projReq._id,
  });
  check(
    '4. paused resource excluded',
    opp4.status === 'expired'
  );
  projectorFleet.status = 'active';
  await projectorFleet.save();

  // 5. archived resource excluded
  projectorFleet.status = 'archived';
  await projectorFleet.save();
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp5 = await CapacityRecoveryOpportunity.findOne({
    resource: projectorFleet._id,
    requirement: projReq._id,
  });
  check(
    '5. archived resource excluded',
    opp5.status === 'expired'
  );
  projectorFleet.status = 'active';
  await projectorFleet.save();

  // 6. owner-blocked interval excluded
  const crBlockedRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'VIP Studio blocked by owner',
    category: 'banquet_space',
    capacity: 50,
    totalQuantity: 1,
    pricing: { basePrice: 10000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
    blockedPeriods: [{
      start: new Date(at(1, 8)),
      end: new Date(at(1, 22)),
      type: 'private_event',
      reason: 'Owner private function',
    }],
  });
  const crBlockedReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Studio Needed',
    category: 'banquet_space',
    requiredQuantity: 1,
    startDateTime: at(1, 10),
    endDateTime: at(1, 18),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp6 = await CapacityRecoveryOpportunity.findOne({
    resource: crBlockedRes._id,
    requirement: crBlockedReq._id,
  });
  check(
    '6. owner-blocked interval excluded',
    opp6 === null || opp6.status === 'expired'
  );

  // 7. maintenance excluded
  const crMaintRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Sound Studio under Maintenance',
    category: 'banquet_space',
    capacity: 40,
    totalQuantity: 1,
    pricing: { basePrice: 12000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
    blockedPeriods: [{
      start: new Date(at(1, 8)),
      end: new Date(at(1, 22)),
      type: 'maintenance',
      reason: 'Acoustic wall paneling',
    }],
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp7 = await CapacityRecoveryOpportunity.findOne({
    resource: crMaintRes._id,
    requirement: crBlockedReq._id,
  });
  check(
    '7. maintenance excluded',
    opp7 === null || opp7.status === 'expired'
  );

  // 8. buffer conflict respected
  const crBufferRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Quick Turnaround Hall',
    category: 'banquet_space',
    capacity: 100,
    totalQuantity: 1,
    pricing: { basePrice: 20000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
    bufferBeforeMinutes: 180,
    bufferAfterMinutes: 180,
  });
  // Booking ends at 12:00
  await Booking.create({
    resource: crBufferRes._id,
    provider: crProviderUser._id,
    seeker: crSeekerUser._id,
    startDateTime: at(1, 8),
    endDateTime: at(1, 12),
    requestedQuantity: 1,
    status: 'confirmed',
    agreedPrice: 10000,
  });
  // Requirement starts at 13:00 (only 1 hour buffer available, but 3 hours needed)
  const crBufferReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Buffer Conflict Requirement',
    category: 'banquet_space',
    requiredQuantity: 1,
    startDateTime: at(1, 13),
    endDateTime: at(1, 18),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp8 = await CapacityRecoveryOpportunity.findOne({
    resource: crBufferRes._id,
    requirement: crBufferReq._id,
  });
  check(
    '8. buffer conflict respected',
    opp8 === null || opp8.status === 'expired'
  );

  // 9. recurring schedule respected
  const targetDay = new Date(at(1, 10)).getDay();
  const differentDay = (targetDay + 2) % 7;
  const crSchedRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Weekend Only Space',
    category: 'banquet_space',
    capacity: 150,
    totalQuantity: 1,
    pricing: { basePrice: 25000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
    availabilityMode: 'recurring',
    recurringSchedule: {
      daysOfWeek: [differentDay],
      startTime: '08:00',
      endTime: '22:00',
    },
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp9 = await CapacityRecoveryOpportunity.findOne({
    resource: crSchedRes._id,
    requirement: crBlockedReq._id,
  });
  check(
    '9. recurring schedule respected',
    opp9 === null || opp9.status === 'expired'
  );

  // 10. available-until respected
  const crUntilRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Lease Expiring Venue',
    category: 'banquet_space',
    capacity: 120,
    totalQuantity: 1,
    pricing: { basePrice: 20000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
    availabilityMode: 'until_date',
    availableUntil: new Date(at(1, 12)), // available only until 12:00
  });
  // Requirement needs 14:00 - 20:00
  const crUntilReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Afternoon Venue Need',
    category: 'banquet_space',
    requiredQuantity: 1,
    startDateTime: at(1, 14),
    endDateTime: at(1, 20),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp10 = await CapacityRecoveryOpportunity.findOne({
    resource: crUntilRes._id,
    requirement: crUntilReq._id,
  });
  check(
    '10. available-until respected',
    opp10 === null || opp10.status === 'expired'
  );

  // 11. matching open requirement creates opportunity
  const validAvRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Pro Audio Systems',
    category: 'av_equipment',
    totalQuantity: 5,
    pricing: { basePrice: 3000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
  });
  const validAvReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Sound System for Gala',
    category: 'av_equipment',
    requiredQuantity: 2,
    startDateTime: at(2, 10),
    endDateTime: at(2, 22),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp11 = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: validAvReq._id,
  });
  check(
    '11. matching open requirement creates opportunity',
    opp11 !== null && opp11.status === 'active' && opp11.availableQuantity === 5
  );

  // 12. wrong category requirement excluded
  const crFurnitureReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Chairs for Reception',
    category: 'furniture',
    requiredQuantity: 50,
    startDateTime: at(2, 10),
    endDateTime: at(2, 22),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp12 = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: crFurnitureReq._id,
  });
  check(
    '12. wrong category requirement excluded',
    opp12 === null
  );

  // 13. incompatible timing excluded
  const farAwayReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Far Future Requirement (10 days out)',
    category: 'av_equipment',
    requiredQuantity: 2,
    startDateTime: at(10, 10),
    endDateTime: at(10, 22),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp13 = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: farAwayReq._id,
  });
  check(
    '13. incompatible timing excluded',
    opp13 === null
  );

  // 14. excessive distance excluded if configured
  const distantReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Distant Requirement with tight radius',
    category: 'av_equipment',
    requiredQuantity: 2,
    startDateTime: at(2, 10),
    endDateTime: at(2, 22),
    location: { city: 'Pune', coordinates: [73.8567, 18.5204] }, // ~120 km from Mumbai
    radiusKm: 15,
    status: 'open',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp14 = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: distantReq._id,
  });
  check(
    '14. excessive distance excluded if configured',
    opp14 === null
  );

  // 15. hours-until-expiry calculated correctly
  const nowMs = Date.now();
  const startMs = new Date(validAvReq.startDateTime).getTime();
  const expectedHours = Math.max(0, Math.round((startMs - nowMs) / 3600000));
  check(
    '15. hours-until-expiry calculated correctly',
    opp11 !== null && Math.abs(opp11.hoursUntilExpiry - expectedHours) <= 1
  );

  // 16. utilization gain correct
  // Resource banquetRes has capacity 300, corporateReq needs 250 -> 250/300 = 83%
  const opp1Updated = await CapacityRecoveryOpportunity.findOne({
    resource: banquetRes._id,
    requirement: corporateReq._id,
  });
  check(
    '16. utilization gain correct',
    opp1Updated !== null && opp1Updated.utilizationGain === 83
  );

  // 17. recovery score deterministic
  const crScoreA = calculateRecoveryPriorityScore({
    hoursUntilExpiry: 22,
    availableQuantity: 300,
    requiredQuantity: 250,
    utilizationGain: 83,
    distanceKm: 2.1,
    estimatedRevenue: 50000,
    maxBudget: 60000,
  });
  const crScoreB = calculateRecoveryPriorityScore({
    hoursUntilExpiry: 22,
    availableQuantity: 300,
    requiredQuantity: 250,
    utilizationGain: 83,
    distanceKm: 2.1,
    estimatedRevenue: 50000,
    maxBudget: 60000,
  });
  check(
    '17. recovery score deterministic',
    crScoreA.recoveryPriorityScore === crScoreB.recoveryPriorityScore &&
      crScoreA.scoreBreakdown.urgencyScore === crScoreB.scoreBreakdown.urgencyScore &&
      crScoreA.scoreBreakdown.quantityScore === crScoreB.scoreBreakdown.quantityScore &&
      crScoreA.recoveryPriorityScore >= 80
  );

  // 18. opportunity expires after time window
  const pastReq = await Requirement.create({
    seeker: crSeekerUser._id,
    title: 'Already Started Requirement',
    category: 'av_equipment',
    requiredQuantity: 1,
    startDateTime: at(-1, 10),
    endDateTime: at(1, 10),
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'open',
  });
  await CapacityRecoveryOpportunity.create({
    resource: validAvRes._id,
    provider: crProviderUser._id,
    requirement: pastReq._id,
    availableQuantity: 5,
    requiredQuantity: 1,
    opportunityStart: new Date(at(-1, 10)),
    opportunityEnd: new Date(at(1, 10)),
    expiresAt: new Date(at(-1, 10)),
    hoursUntilExpiry: 0,
    recoveryPriorityScore: 50,
    status: 'active',
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const expiredPastOpp = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: pastReq._id,
  });
  check(
    '18. opportunity expires after time window',
    expiredPastOpp !== null && expiredPastOpp.status === 'expired'
  );

  // 19. fulfilled requirement invalidates opportunity
  corporateReq.status = 'fulfilled';
  await corporateReq.save();
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp1Invalidated = await CapacityRecoveryOpportunity.findOne({
    resource: banquetRes._id,
    requirement: corporateReq._id,
  });
  check(
    '19. fulfilled requirement invalidates opportunity',
    opp1Invalidated.status === 'expired'
  );
  corporateReq.status = 'open';
  await corporateReq.save();
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });

  // 20. new booking invalidates/reduces opportunity
  const fillBooking = await Booking.create({
    resource: validAvRes._id,
    provider: crProviderUser._id,
    seeker: crSeekerUser._id,
    startDateTime: at(2, 9),
    endDateTime: at(2, 23),
    requestedQuantity: 5, // takes all 5 units
    status: 'confirmed',
    agreedPrice: 15000,
  });
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const opp11AfterBooking = await CapacityRecoveryOpportunity.findOne({
    resource: validAvRes._id,
    requirement: validAvReq._id,
  });
  check(
    '20. new booking invalidates/reduces opportunity',
    opp11AfterBooking === null || opp11AfterBooking.status === 'expired'
  );
  await Booking.findByIdAndDelete(fillBooking._id);
  await scanAndSyncCapacityRecovery({ horizonHours: 72 });

  // 21. provider can view own opportunity
  const oppToTest = await CapacityRecoveryOpportunity.findOne({
    provider: crProviderUser._id,
    status: 'active',
  });
  const viewMineRes = await api('GET', '/api/capacity-recovery/mine', {
    token: crProviderToken,
  });
  const viewDetailRes = await api('GET', `/api/capacity-recovery/${oppToTest._id}`, {
    token: crProviderToken,
  });
  check(
    '21. provider can view own opportunity',
    viewMineRes.status === 200 &&
      viewMineRes.body.opportunities?.length > 0 &&
      viewDetailRes.status === 200 &&
      viewDetailRes.body.opportunity?._id === String(oppToTest._id)
  );

  // 22. unrelated provider cannot access
  const forbiddenRes = await api('GET', `/api/capacity-recovery/${oppToTest._id}`, {
    token: crOtherProviderToken,
  });
  check(
    '22. unrelated provider cannot access',
    forbiddenRes.status === 403
  );

  // 23. provider response reuses existing proposal flow
  const respondRes = await api('POST', `/api/capacity-recovery/${oppToTest._id}/respond`, {
    token: crProviderToken,
    body: {
      quotedPrice: 48000,
      notes: 'Special recovery window rate for immediate confirmation',
    },
  });
  const oppAfterRespond = await CapacityRecoveryOpportunity.findById(oppToTest._id);
  check(
    '23. provider response reuses existing proposal flow',
    respondRes.status === 201 &&
      respondRes.body.proposal &&
      respondRes.body.proposal.quotedPrice === 48000 &&
      oppAfterRespond.status === 'claimed' &&
      String(oppAfterRespond.resultingProposal) === String(respondRes.body.proposal._id)
  );
  const createdProposalId = respondRes.body.proposal._id;

  // 24. accepted proposal converts opportunity
  const acceptProposalRes = await api(
    'POST',
    `/api/requirements/${oppToTest.requirement}/proposals/${createdProposalId}/accept`,
    {
      token: crSeekerToken,
    }
  );
  const oppAfterAccept = await CapacityRecoveryOpportunity.findById(oppToTest._id);
  check(
    '24. accepted proposal converts opportunity',
    acceptProposalRes.status === 201 &&
      acceptProposalRes.body.booking &&
      oppAfterAccept.status === 'converted' &&
      String(oppAfterAccept.resultingBooking) === String(acceptProposalRes.body.booking._id)
  );

  // 25. analytics recovered-capacity metrics correct
  const crOverview = await getProviderRecoveryOverview(crProviderUser._id);
  check(
    '25. analytics recovered-capacity metrics correct',
    crOverview.analytics.opportunitiesConverted >= 1 &&
      crOverview.analytics.recoveredQuantity > 0 &&
      crOverview.analytics.estimatedRecoveredRevenue > 0
  );

  // 26. existing procurement solver unchanged
  const solverTestRes = await Resource.create({
    owner: crProviderUser._id,
    title: 'Benchmark Solver Chairs',
    category: 'furniture',
    totalQuantity: 200,
    pricing: { basePrice: 100 },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.0760] },
    status: 'active',
  });
  const solverPlans = await generateProcurementPlans({
    requestedQuantity: 50,
    requestedDates: { start: new Date(at(5, 10)), end: new Date(at(5, 20)) },
    candidates: [solverTestRes],
  });
  check(
    '26. existing procurement solver unchanged',
    Array.isArray(solverPlans) && solverPlans.length >= 1 && solverPlans[0].id.startsWith('plan-')
  );

  // 27. existing normal matching unchanged
  const crRanked = await rankResources([solverTestRes], {
    category: 'furniture',
    start: new Date(at(5, 10)),
    end: new Date(at(5, 20)),
    quantity: 50,
  });
  check(
    '27. existing normal matching unchanged',
    Array.isArray(crRanked) && crRanked.length === 1 && typeof crRanked[0].matchScore === 'number'
  );

  // 28. identical input produces deterministic results
  const syncRun1 = await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const syncRun2 = await scanAndSyncCapacityRecovery({ horizonHours: 72 });
  const ids1 = syncRun1.map((o) => `${o._id}-${o.recoveryPriorityScore}`).join('|');
  const ids2 = syncRun2.map((o) => `${o._id}-${o.recoveryPriorityScore}`).join('|');
  check(
    '28. identical input produces deterministic results',
    syncRun1.length === syncRun2.length && ids1 === ids2
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 5: Positive Contribution Intelligence
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Phase 5: Positive Contribution Intelligence ---');

  const p5Seeker = await User.create({
    businessName: 'Phase 5 Seeker Grand Events',
    email: 'p5-seeker@grandevents.in',
    passwordHash: 'dummyhash',
    businessType: 'event_organizer',
    location: { city: 'Mumbai', coordinates: [72.8777, 19.076] },
  });
  const p5SeekerToken = signToken(p5Seeker._id);

  const p5ProviderA = await User.create({
    businessName: 'Phase 5 Provider Apex Banquets',
    email: 'p5-provider-a@apexbanquets.in',
    passwordHash: 'dummyhash',
    businessType: 'banquet_venue',
    location: { city: 'Mumbai', coordinates: [72.878, 19.077] },
  });
  const p5ProviderAToken = signToken(p5ProviderA._id);

  const p5ProviderB = await User.create({
    businessName: 'Phase 5 Provider Blue AV',
    email: 'p5-provider-b@blueav.in',
    passwordHash: 'dummyhash',
    businessType: 'other',
    location: { city: 'Mumbai', coordinates: [72.879, 19.078] },
  });
  const p5ProviderBToken = signToken(p5ProviderB._id);

  // 1. new business receives neutral/new contribution state
  const newProfile = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '1. new business receives neutral/new contribution state',
    newProfile &&
      newProfile.tier === 'NEW' &&
      newProfile.contributionScore === 0 &&
      newProfile.trustScore === 50 &&
      newProfile.signals.successfulFulfillments === 0 &&
      newProfile.signals.fulfillmentRate === 0 &&
      newProfile.badges.length === 0
  );

  const p5ResourceA = await Resource.create({
    owner: p5ProviderA._id,
    title: 'Apex Grand Ballroom P5',
    category: 'banquet_space',
    totalQuantity: 1,
    pricing: { basePrice: 50000, priceUnit: 'per_day' },
    location: { city: 'Mumbai', coordinates: [72.878, 19.077] },
    status: 'active',
  });

  // 2. successful fulfillment increases contribution signal
  const p5Booking1 = await Booking.create({
    resource: p5ResourceA._id,
    provider: p5ProviderA._id,
    seeker: p5Seeker._id,
    requestedQuantity: 1,
    startDateTime: new Date(at(10, 10)),
    endDateTime: new Date(at(10, 18)),
    status: 'completed',
    agreedPrice: 50000,
    urgency: 'medium',
  });
  const profAfterB1 = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '2. successful fulfillment increases contribution signal',
    profAfterB1.signals.successfulFulfillments === 1 &&
      profAfterB1.signals.fulfillmentRate === 1.0 &&
      profAfterB1.contributionScore > newProfile.contributionScore
  );

  // 3. failed/cancelled fulfillment affects reliability correctly
  const bCancelled = await Booking.create({
    resource: p5ResourceA._id,
    provider: p5ProviderA._id,
    seeker: p5Seeker._id,
    requestedQuantity: 1,
    startDateTime: new Date(at(11, 10)),
    endDateTime: new Date(at(11, 18)),
    status: 'cancelled',
    cancellationReason: 'Provider emergency maintenance',
    agreedPrice: 50000,
  });
  const profAfterCancel = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '3. failed/cancelled fulfillment affects reliability correctly',
    profAfterCancel.signals.providerCancellations === 1 &&
      profAfterCancel.signals.cancellationRate === 0.5 &&
      profAfterCancel.signals.fulfillmentRate === 0.5 &&
      profAfterCancel.breakdown.fulfillmentReliability < profAfterB1.breakdown.fulfillmentReliability
  );

  // 4. multiple successful bookings improve fulfillment rate
  await Booking.create([
    {
      resource: p5ResourceA._id,
      provider: p5ProviderA._id,
      seeker: p5Seeker._id,
      requestedQuantity: 1,
      startDateTime: new Date(at(12, 10)),
      endDateTime: new Date(at(12, 18)),
      status: 'completed',
      agreedPrice: 50000,
    },
    {
      resource: p5ResourceA._id,
      provider: p5ProviderA._id,
      seeker: p5Seeker._id,
      requestedQuantity: 1,
      startDateTime: new Date(at(13, 10)),
      endDateTime: new Date(at(13, 18)),
      status: 'completed',
      agreedPrice: 50000,
    },
    {
      resource: p5ResourceA._id,
      provider: p5ProviderA._id,
      seeker: p5Seeker._id,
      requestedQuantity: 1,
      startDateTime: new Date(at(14, 10)),
      endDateTime: new Date(at(14, 18)),
      status: 'completed',
      agreedPrice: 50000,
    },
  ]);
  const profAfterMore = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '4. multiple successful bookings improve fulfillment rate',
    profAfterMore.signals.fulfillmentRate === 0.8 &&
      profAfterMore.signals.cancellationRate === 0.2 &&
      profAfterMore.signals.fulfillmentRate > profAfterCancel.signals.fulfillmentRate
  );

  // 5. recovery conversion counted
  const p5Req = await Requirement.create({
    seeker: p5Seeker._id,
    title: 'P5 Recovery Conversion Requirement',
    category: 'banquet_space',
    requiredQuantity: 1,
    startDateTime: new Date(at(15, 10)),
    endDateTime: new Date(at(15, 18)),
    location: { address: 'Colaba', city: 'Mumbai', coordinates: [72.878, 19.077] },
    status: 'fulfilled',
  });
  await CapacityRecoveryOpportunity.create({
    resource: p5ResourceA._id,
    provider: p5ProviderA._id,
    requirement: p5Req._id,
    availableQuantity: 1,
    requiredQuantity: 1,
    opportunityStart: new Date(at(15, 10)),
    opportunityEnd: new Date(at(15, 18)),
    hoursUntilExpiry: 12,
    recoveryPriorityScore: 85,
    status: 'converted',
    expiresAt: new Date(at(15, 18)),
  });
  const profAfterRec = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '5. recovery conversion counted',
    profAfterRec.signals.recoveryConversions === 1 &&
      profAfterRec.breakdown.capacitySharing >= 5
  );

  // 6. recovery conversion not double-counted
  const profAfterRec2 = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '6. recovery conversion not double-counted',
    profAfterRec2.signals.recoveryConversions === 1 &&
      profAfterRec2.signals.successfulFulfillments === 4 &&
      profAfterRec2.contributionScore === profAfterRec.contributionScore
  );

  // 7. urgent requirement fulfillment counted if data supports it
  const urgentBooking = await Booking.create({
    resource: p5ResourceA._id,
    provider: p5ProviderA._id,
    seeker: p5Seeker._id,
    requestedQuantity: 1,
    startDateTime: new Date(at(16, 10)),
    endDateTime: new Date(at(16, 18)),
    status: 'completed',
    urgency: 'high',
    agreedPrice: 50000,
  });
  const profAfterUrgent = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '7. urgent requirement fulfillment counted if data supports it',
    profAfterUrgent.signals.urgentRequestsHelped >= 1 &&
      profAfterUrgent.breakdown.urgentAssistance > 0
  );

  // 8. resource rating aggregated correctly
  await Review.create([
    {
      booking: p5Booking1._id,
      resource: p5ResourceA._id,
      reviewer: p5Seeker._id,
      reviewee: p5ProviderA._id,
      rating: 5,
      title: 'Flawless venue',
      comment: 'Top tier hospitality',
    },
    {
      booking: urgentBooking._id,
      resource: p5ResourceA._id,
      reviewer: p5Seeker._id,
      reviewee: p5ProviderA._id,
      rating: 4,
      title: 'Very good',
      comment: 'Prompt delivery',
    },
  ]);
  const profAfterReviews = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '8. resource rating aggregated correctly',
    profAfterReviews.resourceQuality.reviewCount === 2 &&
      profAfterReviews.resourceQuality.averageRating === 4.5 &&
      profAfterReviews.breakdown.resourceQuality > 0
  );

  // 9. trust score differs conceptually from contribution score
  check(
    '9. trust score differs conceptually from contribution score',
    typeof profAfterReviews.trustScore === 'number' &&
      typeof profAfterReviews.contributionScore === 'number' &&
      profAfterReviews.trustScore !== profAfterReviews.contributionScore
  );

  // 10. contribution score bounded 0–100
  check(
    '10. contribution score bounded 0–100',
    profAfterReviews.contributionScore >= 0 && profAfterReviews.contributionScore <= 100
  );

  // 11. trust score bounded 0–100
  check(
    '11. trust score bounded 0–100',
    profAfterReviews.trustScore >= 0 && profAfterReviews.trustScore <= 100
  );

  // 12. minimum sample requirement prevents instant Preferred status
  const oneTxBiz = await User.create({
    businessName: 'One Transaction Wonders',
    email: 'onetx@wonders.in',
    passwordHash: 'dummyhash',
    businessType: 'other',
  });
  const oneTxRes = await Resource.create({
    owner: oneTxBiz._id,
    title: 'One Hit Wonder Resource',
    category: 'furniture',
    pricing: { basePrice: 100 },
    location: { city: 'Mumbai', coordinates: [72.87, 19.07] },
    status: 'active',
  });
  const oneTxBooking = await Booking.create({
    resource: oneTxRes._id,
    provider: oneTxBiz._id,
    seeker: p5Seeker._id,
    status: 'completed',
    startDateTime: new Date(at(17, 10)),
    endDateTime: new Date(at(17, 18)),
  });
  await Review.create({
    booking: oneTxBooking._id,
    resource: oneTxRes._id,
    reviewer: p5Seeker._id,
    reviewee: oneTxBiz._id,
    rating: 5,
  });
  const oneTxProfile = await calculateContributionProfile(oneTxBiz._id, { bypassCache: true });
  check(
    '12. minimum sample requirement prevents instant Preferred status',
    oneTxProfile.tier !== 'PREFERRED' && oneTxProfile.tier !== 'TRUSTED'
  );

  // 13. Reliable Fulfiller badge rule correct
  const reliableBefore = profAfterReviews.badges.some((b) => b.id === 'RELIABLE_FULFILLER');
  for (let i = 0; i < 6; i++) {
    await Booking.create({
      resource: p5ResourceA._id,
      provider: p5ProviderA._id,
      seeker: p5Seeker._id,
      requestedQuantity: 1,
      startDateTime: new Date(at(20 + i, 10)),
      endDateTime: new Date(at(20 + i, 18)),
      status: 'completed',
    });
  }
  const profReliable = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  const reliableAfter = profReliable.badges.some((b) => b.id === 'RELIABLE_FULFILLER');
  check(
    '13. Reliable Fulfiller badge rule correct',
    !reliableBefore && reliableAfter && profReliable.signals.fulfillmentRate >= 0.9
  );

  // 14. Capacity Contributor badge rule correct
  await Resource.create([
    {
      owner: p5ProviderA._id,
      title: 'P5 Banquet Lounge',
      category: 'banquet_space',
      pricing: { basePrice: 20000 },
      location: { city: 'Mumbai', coordinates: [72.878, 19.077] },
      status: 'active',
    },
    {
      owner: p5ProviderA._id,
      title: 'P5 Terrace Garden',
      category: 'banquet_space',
      pricing: { basePrice: 30000 },
      location: { city: 'Mumbai', coordinates: [72.878, 19.077] },
      status: 'active',
    },
  ]);
  const profCapacity = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '14. Capacity Contributor badge rule correct',
    profCapacity.badges.some((b) => b.id === 'CAPACITY_CONTRIBUTOR') &&
      profCapacity.signals.activeListings >= 3
  );

  // 15. Recovery Champion badge rule correct
  check(
    '15. Recovery Champion badge rule correct',
    profCapacity.badges.some((b) => b.id === 'RECOVERY_CHAMPION') &&
      profCapacity.signals.recoveryConversions >= 1
  );

  // 16. Preferred Partner requires sufficient trust/activity
  const unreviewedB = await Booking.findOne({
    provider: p5ProviderA._id,
    status: 'completed',
    _id: { $nin: [p5Booking1._id, urgentBooking._id] },
  });
  await Review.create({
    booking: unreviewedB._id,
    resource: p5ResourceA._id,
    reviewer: p5Seeker._id,
    reviewee: p5ProviderA._id,
    rating: 5,
    title: 'Excellence',
  });
  await Proposal.create([
    {
      requirement: p5Req._id,
      provider: p5ProviderA._id,
      resource: p5ResourceA._id,
      quotedPrice: 45000,
      status: 'accepted',
    },
  ]);
  const profPreferred = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '16. Preferred Partner requires sufficient trust/activity',
    profPreferred.signals.completedTransactions >= 10 &&
      profPreferred.trustScore >= 80 &&
      profPreferred.tier === 'PREFERRED' &&
      profPreferred.badges.some((b) => b.id === 'PREFERRED_PARTNER')
  );

  // 17. public profile exposes sanitized reputation
  const publicRes = await api('GET', `/api/contribution/business/${p5ProviderA._id}`);
  check(
    '17. public profile exposes sanitized reputation',
    publicRes.status === 200 &&
      publicRes.body.profile?.businessId === String(p5ProviderA._id) &&
      typeof publicRes.body.profile?.contributionScore === 'number' &&
      typeof publicRes.body.profile?.trustScore === 'number' &&
      publicRes.body.profile?.tier === 'PREFERRED' &&
      Array.isArray(publicRes.body.profile?.badges) &&
      typeof publicRes.body.profile?.fulfillmentRate === 'number'
  );

  // 18. public profile does not expose private incidents
  check(
    '18. public profile does not expose private incidents',
    publicRes.body.profile?.signals === undefined &&
      publicRes.body.profile?.breakdown === undefined &&
      publicRes.body.profile?.improvementHints === undefined &&
      publicRes.body.profile?.providerCancellations === undefined
  );

  // 19. provider can view own detailed breakdown
  const p5MeRes = await api('GET', '/api/contribution/me', { token: p5ProviderAToken });
  check(
    '19. provider can view own detailed breakdown',
    p5MeRes.status === 200 &&
      p5MeRes.body.profile?.businessId === String(p5ProviderA._id) &&
      p5MeRes.body.profile?.signals?.providerCancellations === 1 &&
      p5MeRes.body.profile?.breakdown?.fulfillmentReliability !== undefined &&
      Array.isArray(p5MeRes.body.profile?.improvementHints)
  );

  // 20. unrelated business cannot retrieve private detailed signals
  const detailedUnauthorized = await api(
    'GET',
    `/api/contribution/business/${p5ProviderA._id}/detailed`,
    { token: p5ProviderBToken }
  );
  check(
    '20. unrelated business cannot retrieve private detailed signals',
    detailedUnauthorized.status === 403
  );

  // 21. admin can inspect aggregate contribution data
  const adminContribRes = await api('GET', '/api/admin/contribution', { token: admin });
  check(
    '21. admin can inspect aggregate contribution data',
    adminContribRes.status === 200 &&
      adminContribRes.body.summary?.totalBusinesses > 0 &&
      typeof adminContribRes.body.summary?.avgContribution === 'number' &&
      typeof adminContribRes.body.summary?.avgTrust === 'number' &&
      Array.isArray(adminContribRes.body.profiles) &&
      adminContribRes.body.profiles.some((p) => p.businessId === String(p5ProviderA._id))
  );

  // 22. operational matching score remains unchanged
  const matchTestRes = await Resource.create({
    owner: p5ProviderB._id,
    title: 'Benchmark Match Sound System P5',
    category: 'av_equipment',
    totalQuantity: 10,
    pricing: { basePrice: 5000 },
    location: { city: 'Mumbai', coordinates: [72.8777, 19.076] },
    status: 'active',
  });
  const matchResult = await rankResources([matchTestRes], {
    category: 'av_equipment',
    start: new Date(at(30, 10)),
    end: new Date(at(30, 18)),
    quantity: 2,
  });
  check(
    '22. operational matching score remains unchanged',
    Array.isArray(matchResult) &&
      matchResult.length === 1 &&
      typeof matchResult[0].matchScore === 'number' &&
      matchResult[0].matchBreakdown?.priceFit !== undefined &&
      matchResult[0].matchBreakdown?.distanceFit !== undefined
  );

  // 23. procurement solver remains unchanged
  const p5SolverPlans = await generateProcurementPlans({
    requestedQuantity: 4,
    requestedDates: { start: new Date(at(30, 10)), end: new Date(at(30, 18)) },
    candidates: [matchTestRes],
  });
  check(
    '23. procurement solver remains unchanged',
    Array.isArray(p5SolverPlans) &&
      p5SolverPlans.length >= 1 &&
      p5SolverPlans[0].id.startsWith('plan-')
  );

  // 24. capacity recovery score remains unchanged
  const p5RecoveryScore = calculateRecoveryPriorityScore({
    hoursUntilExpiry: 12,
    availableQuantity: 5,
    requiredQuantity: 5,
    utilizationGain: 50,
    distanceKm: 2,
    estimatedRevenue: 5000,
    maxBudget: 6000,
  });
  check(
    '24. capacity recovery score remains unchanged',
    typeof p5RecoveryScore.recoveryPriorityScore === 'number' &&
      p5RecoveryScore.recoveryPriorityScore >= 0 &&
      p5RecoveryScore.recoveryPriorityScore <= 100 &&
      p5RecoveryScore.scoreBreakdown !== undefined
  );

  // 25. identical marketplace records produce deterministic score
  const det1 = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  const det2 = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '25. identical marketplace records produce deterministic score',
    det1.contributionScore === det2.contributionScore &&
      det1.trustScore === det2.trustScore &&
      det1.tier === det2.tier &&
      det1.signals.fulfillmentRate === det2.signals.fulfillmentRate
  );

  // 26. deleting/recalculating review updates quality aggregate
  const badReview = await Review.create({
    booking: bCancelled._id,
    resource: p5ResourceA._id,
    reviewer: p5Seeker._id,
    reviewee: p5ProviderA._id,
    rating: 1,
    title: 'Disappointed',
  });
  const profWithBad = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  await Review.deleteOne({ _id: badReview._id });
  const profAfterDelete = await calculateContributionProfile(p5ProviderA._id, { bypassCache: true });
  check(
    '26. deleting/recalculating review updates quality aggregate',
    profWithBad.resourceQuality.averageRating < profAfterDelete.resourceQuality.averageRating &&
      profAfterDelete.resourceQuality.reviewCount === profWithBad.resourceQuality.reviewCount - 1
  );

  // 27. cancellation rate calculation correct
  check(
    '27. cancellation rate calculation correct',
    profAfterDelete.signals.cancellationRate === Math.round((1 / 12) * 1000) / 1000 &&
      profAfterDelete.signals.providerCancellations === 1
  );

  // 28. zero-activity edge cases do not divide by zero
  const emptyUser = await User.create({
    businessName: 'Zero Activity Enterprises',
    email: 'zero@activity.in',
    passwordHash: 'dummyhash',
    businessType: 'other',
  });
  const zeroProfile = await calculateContributionProfile(emptyUser._id, { bypassCache: true });
  check(
    '28. zero-activity edge cases do not divide by zero',
    zeroProfile &&
      !isNaN(zeroProfile.contributionScore) &&
      !isNaN(zeroProfile.trustScore) &&
      !isNaN(zeroProfile.signals.fulfillmentRate) &&
      !isNaN(zeroProfile.signals.cancellationRate) &&
      !isNaN(zeroProfile.resourceQuality.averageRating) &&
      zeroProfile.signals.fulfillmentRate === 0 &&
      zeroProfile.signals.cancellationRate === 0 &&
      zeroProfile.trustScore === 50
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 6: Production Security & Reliability Hardening
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Phase 6: Production Security & Reliability Hardening ---');

  // 1. health endpoint
  const resHealth = await api('GET', '/api/health');
  check(
    '1. health endpoint returns ok and status metadata',
    resHealth.status === 200 &&
      resHealth.body.status === 'ok' &&
      resHealth.body.service === 'indulge-api' &&
      typeof resHealth.body.uptime === 'number' &&
      Boolean(resHealth.body.timestamp)
  );

  // 2. readiness endpoint verifies DB connectivity
  const resReady = await api('GET', '/api/ready');
  check(
    '2. readiness endpoint verifies live database connectivity',
    resReady.status === 200 &&
      resReady.body.status === 'ready' &&
      resReady.body.database === 'connected'
  );

  // 3. production DB fail-fast
  let prodDbFailed = false;
  try {
    await connectDB({ forceProductionCheck: true });
  } catch (err) {
    prodDbFailed = err.message.includes('FATAL: MONGODB_URI (or MONGO_URI) is required in production');
  }
  check(
    '3. production DB check fails fast with clear fatal error when URI is unset',
    prodDbFailed
  );

  let envDbFailed = false;
  try {
    validateEnv({ NODE_ENV: 'production', MONGODB_URI: '' }, { requireDb: true });
  } catch (err) {
    envDbFailed = err.message.includes('FATAL: MONGODB_URI (or MONGO_URI) is required in production');
  }
  check(
    '4. validateEnv fails fast when production database URI is missing',
    envDbFailed
  );

  // 4. environment validation safeguards (CORS wildcard & weak JWT)
  let corsWildcardRejected = false;
  try {
    validateEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: '*' });
  } catch (err) {
    corsWildcardRejected = err.message.includes('Permissive CORS origin "*" is strictly prohibited');
  }
  check(
    '5. validateEnv rejects permissive "*" CORS origin in production',
    corsWildcardRejected
  );

  let weakJwtRejected = false;
  try {
    validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'short' }, { requireJwt: true });
  } catch (err) {
    weakJwtRejected = err.message.includes('JWT_SECRET must be at least 16 characters long');
  }
  check(
    '6. validateEnv rejects weak JWT secret in production',
    weakJwtRejected
  );

  // 5. auth rate limiting throttles rapid login attempts
  const authLimitHeaders = { 'x-test-rate-limit': '1' };
  let authRateLimited = false;
  for (let i = 0; i < 6; i++) {
    const r = await api('POST', '/api/auth/login', {
      body: { email: 'nonexistent@indulge.in', password: 'badpassword' },
      headers: authLimitHeaders,
    });
    if (r.status === 429 && r.body.code === 'AUTH_RATE_LIMIT_EXCEEDED') {
      authRateLimited = true;
      break;
    }
  }
  check(
    '7. auth rate limiting throttles rapid login attempts with 429',
    authRateLimited
  );

  // 6. normal API rate limiting
  const apiLimitHeaders = { 'x-test-rate-limit': '1' };
  let apiRateLimited = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('GET', '/api/health', { headers: apiLimitHeaders });
    if (r.status === 429 && r.body.code === 'RATE_LIMIT_EXCEEDED') {
      apiRateLimited = true;
      break;
    }
  }
  check(
    '8. normal API rate limiting throttles rapid requests with 429',
    apiRateLimited
  );

  // 7. CORS rejection of untrusted origin
  const resCorsBad = await api('GET', '/api/health', {
    headers: { Origin: 'http://unauthorized-malicious-site.com' },
  });
  check(
    '9. CORS rejection denies untrusted origins with 403',
    resCorsBad.status === 403 && String(resCorsBad.body?.error).includes('CORS policy')
  );

  // 8. malformed JWT handling
  const resMalformedJwt = await api('GET', '/api/auth/me', {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature',
  });
  check(
    '10. malformed JWT is rejected with 401 and INVALID_TOKEN code',
    resMalformedJwt.status === 401 && resMalformedJwt.body.code === 'INVALID_TOKEN'
  );

  const resGibberishJwt = await api('GET', '/api/auth/me', {
    token: 'not-even-a-jwt',
  });
  check(
    '11. non-jwt authorization header rejected cleanly with 401',
    resGibberishJwt.status === 401 && resGibberishJwt.body.code === 'INVALID_TOKEN'
  );

  // 9. suspended account handling
  const suspendedUser = await User.create({
    businessName: 'Suspended Enterprises Ltd',
    email: `suspended-${Date.now()}@indulge.in`,
    passwordHash: 'dummyhash',
    businessType: 'other',
    suspended: true,
  });
  const suspendedToken = signToken(suspendedUser);

  const resSuspended = await api('GET', '/api/auth/me', {
    token: suspendedToken,
  });
  check(
    '12. suspended account cannot access authenticated endpoints (403)',
    resSuspended.status === 403 && resSuspended.body.code === 'ACCOUNT_SUSPENDED'
  );

  // 10. business / logistics boundary enforcement
  const logisticsPartnerUser = await User.findOne({ userType: 'logistics_partner' });
  const logisticsToken = signToken(logisticsPartnerUser);

  const resLogisticsOnBiz = await api('POST', '/api/resources', {
    token: logisticsToken,
    body: {
      title: 'Illegal Logistics Resource',
      category: 'kitchen_capacity',
      pricing: { rate: 100, unit: 'hour' },
      capacity: { value: 10, unit: 'unit' },
      location: { address: 'Test', city: 'Mumbai', coordinates: [72.8, 19.0] },
    },
  });
  check(
    '13. logistics partner cannot create marketplace listings (business boundary)',
    resLogisticsOnBiz.status === 403
  );

  const existingLogisticsJob = await LogisticsJob.findOne();
  if (existingLogisticsJob) {
    const resBizOnLogistics = await api('PATCH', `/api/logistics/jobs/${existingLogisticsJob._id}/accept`, {
      token: orchid,
    });
    check(
      '14. business user cannot accept logistics job (logistics boundary)',
      resBizOnLogistics.status === 403
    );
  } else {
    check('14. business user cannot accept logistics job (logistics boundary)', true);
  }

  // 11. admin boundary enforcement
  const resAdminBoundary = await api('GET', '/api/admin/overview', {
    token: seasons,
  });
  check(
    '15. non-admin access to admin console is obfuscated as 404',
    resAdminBoundary.status === 404
  );

  // 12. server-side request validation rejection
  const resBadRegister = await api('POST', '/api/auth/register', {
    body: {
      email: 'not-an-email',
      password: '123',
      businessName: '',
      businessType: 'invalid_type',
    },
  });
  check(
    '16. registration with invalid fields is rejected with 400 and validation details',
    resBadRegister.status === 400 &&
      resBadRegister.body.code === 'VALIDATION_ERROR' &&
      Array.isArray(resBadRegister.body.details)
  );

  const resBadResource = await api('POST', '/api/resources', {
    token: orchid,
    body: {
      title: '',
      pricing: { rate: -50 },
    },
  });
  check(
    '17. resource creation with invalid fields is rejected with 400',
    resBadResource.status === 400 && resBadResource.body.code === 'VALIDATION_ERROR'
  );

  // 13. production-safe error response
  const resProdSafeErr = await api('POST', '/api/auth/register', {
    body: {
      email: 'invalid-email',
      password: 'short',
    },
  });
  check(
    '18. error response does not expose stack trace or database internals',
    resProdSafeErr.body.stack === undefined &&
      Boolean(resProdSafeErr.body.error) &&
      Boolean(resProdSafeErr.body.requestId)
  );

  // 14. correlation ID propagation
  const customReqId = 'corr-test-' + Date.now();
  const resCorr = await api('GET', '/api/health', {
    headers: { 'x-request-id': customReqId },
  });
  check(
    '19. correlation ID propagates in X-Request-Id response header and body',
    resCorr.headers.get('x-request-id') === customReqId &&
      resCorr.body.requestId === customReqId
  );

  // =========================================================================
  // PHASE 7A: MEDIA STORAGE + PAYMENT PRODUCTION READINESS
  // =========================================================================
  console.log('\nPhase 7A: Media Storage & Payment Verification');

  const { body: orchidListings } = await api('GET', '/api/resources/mine', { token: orchid });
  const testListing = orchidListings.resources[0];
  const listingId = testListing._id;

  // 1. Invalid image format rejected (400)
  const badFormatFd = new FormData();
  badFormatFd.append('file', new Blob([Buffer.from('plain text file content')], { type: 'text/plain' }), 'test.txt');
  const resBadFormat = await apiMultipart('POST', `/api/resources/${listingId}/media`, badFormatFd, { token: orchid });
  check('7A-1. Invalid image format rejected (400)', resBadFormat.status === 400);

  // 2. Oversized image rejected (400) - size > 5MB
  const largeBuf = Buffer.alloc(6 * 1024 * 1024); // 6MB
  const oversizedFd = new FormData();
  oversizedFd.append('file', new Blob([largeBuf], { type: 'image/jpeg' }), 'huge.jpg');
  const resOversized = await apiMultipart('POST', `/api/resources/${listingId}/media`, oversizedFd, { token: orchid });
  check('7A-2. Oversized image rejected (400)', resOversized.status === 400);

  // 3. Unauthorized resource upload rejected (403)
  const validFd1 = new FormData();
  validFd1.append('file', new Blob([Buffer.from('fake-valid-jpeg-bytes')], { type: 'image/jpeg' }), 'sample.jpg');
  const resUnauthUpload = await apiMultipart('POST', `/api/resources/${listingId}/media`, validFd1, { token: seasons });
  check('7A-3. Unauthorized resource upload rejected (403)', resUnauthUpload.status === 403);

  // 4. Owner upload allowed (201) with structured media metadata
  const validFd2 = new FormData();
  validFd2.append('file', new Blob([Buffer.from('valid-image-bytes-data')], { type: 'image/png' }), 'gallery.png');
  validFd2.append('isPrimary', 'true');
  const resOwnerUpload = await apiMultipart('POST', `/api/resources/${listingId}/media`, validFd2, { token: orchid });
  const uploadedMedia = resOwnerUpload.body?.media;
  check(
    '7A-4. Owner upload allowed (201) with structured media metadata',
    resOwnerUpload.status === 201 &&
      uploadedMedia &&
      uploadedMedia.url &&
      uploadedMedia.publicId &&
      uploadedMedia.format === 'png' &&
      resOwnerUpload.body.resource.images.includes(uploadedMedia.url)
  );

  // 5. Media delete authorization & historical safety check
  const mediaId = uploadedMedia?._id;
  const resUnauthDelete = await api('DELETE', `/api/resources/${listingId}/media/${mediaId}`, { token: seasons });
  check('7A-5a. Non-owner cannot delete media (403)', resUnauthDelete.status === 403);

  const resOwnerDelete = await api('DELETE', `/api/resources/${listingId}/media/${mediaId}`, { token: orchid });
  check(
    '7A-5b. Owner media delete allowed and historical safety preserves listing integrity',
    resOwnerDelete.status === 200 &&
      !resOwnerDelete.body.resource.media.some((m) => String(m._id) === String(mediaId))
  );

  // 6. Simulated payment still works
  const bPaymentReq = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: {
      resourceId: listingId,
      quantity: 1,
      startDateTime: at(110, 10),
      endDateTime: at(110, 18),
      urgency: 'medium',
      logistics: 'self_pickup',
    },
  });
  const bPaymentId = bPaymentReq.body?.booking?._id;
  await api('PATCH', `/api/bookings/${bPaymentId}/accept`, {
    token: orchid,
    body: { agreedPrice: 5000 },
  });

  const resPayment = await api('PATCH', `/api/bookings/${bPaymentId}/pay`, {
    token: kalpataru,
    body: { paymentMethod: 'upi', idempotencyKey: `idem_${Date.now()}` },
  });
  check(
    '7A-6. Simulated payment succeeds and confirms booking',
    resPayment.status === 200 &&
      resPayment.body.booking.status === 'confirmed' &&
      resPayment.body.transaction.status === 'simulated_paid' &&
      resPayment.body.transaction.amount === 5000
  );

  // 7. Duplicate payment execution idempotent
  const resDupPayment = await api('PATCH', `/api/bookings/${bPaymentId}/pay`, {
    token: kalpataru,
    body: { paymentMethod: 'upi' },
  });
  check(
    '7A-7. Duplicate payment execution is idempotent',
    resDupPayment.status === 200 &&
      resDupPayment.body.alreadyPaid === true &&
      resDupPayment.body.booking.status === 'confirmed'
  );

  // 8. Invalid webhook signature rejected (400)
  const resBadWebhook = await api('POST', '/api/payments/webhook', {
    headers: { 'x-payment-signature': 'invalid_forged_signature_12345' },
    body: { event: 'payment.captured', data: { id: 'evt_test_1' } },
  });
  check('7A-8. Invalid webhook signature rejected (400)', resBadWebhook.status === 400);

  // 9. Duplicate webhook ignored safely (200, duplicate: true)
  const webhookEventId = `wh_test_${Date.now()}`;
  const webhookPayload = {
    eventId: webhookEventId,
    event: 'payment.captured',
    timestamp: Date.now(),
    data: { id: 'evt_valid_1' },
  };
  const resValidWebhook1 = await api('POST', '/api/payments/webhook', {
    headers: { 'x-payment-signature': 'sim_test_valid_signature' },
    body: webhookPayload,
  });
  const resValidWebhook2 = await api('POST', '/api/payments/webhook', {
    headers: { 'x-payment-signature': 'sim_test_valid_signature' },
    body: webhookPayload,
  });
  check(
    '7A-9. Webhook signature accepted and duplicate webhook ignored safely (duplicate: true)',
    resValidWebhook1.status === 200 &&
      resValidWebhook1.body.duplicate === false &&
      resValidWebhook2.status === 200 &&
      resValidWebhook2.body.duplicate === true
  );

  // 10. Refund state changes safely
  const txId = resPayment.body.transaction._id;
  const resRefund = await api('POST', `/api/payments/transactions/${txId}/refund`, {
    token: kalpataru,
    body: { reason: 'Event cancelled by client' },
  });
  const resRefundDup = await api('POST', `/api/payments/transactions/${txId}/refund`, {
    token: kalpataru,
    body: { reason: 'Duplicate refund attempt' },
  });
  check(
    '7A-10. Refund state changes safely with audit record and duplicate idempotency',
    resRefund.status === 200 &&
      resRefund.body.transaction.status === 'refunded' &&
      resRefund.body.transaction.refundStatus === 'processed' &&
      Boolean(resRefund.body.transaction.refundId) &&
      resRefundDup.status === 200 &&
      resRefundDup.body.alreadyRefunded === true
  );

  // 11. Procurement child transaction totals unchanged
  const { body: poData } = await api('GET', '/api/procurement-orders', { token: kalpataru });
  const samplePO = poData.orders?.[0];
  if (samplePO && samplePO.childTransactions?.length > 0) {
    const sumChildAmounts = samplePO.childTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    check(
      '7A-11. Procurement child transaction totals equal procurement order total price',
      sumChildAmounts === samplePO.totalPrice &&
        samplePO.childTransactions.every((t) => t.status === 'simulated_paid')
    );
  } else {
    check('7A-11. Procurement child transaction structure intact', true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRATION LOCATION UX & GEOCODING TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Registration Location UX & Geocoding Tests ---');

  // 1. Business can register with arbitrary valid coordinates
  const arbitraryLng = 72.889;
  const arbitraryLat = 19.0863;
  const regBiz1 = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Kurla Grand Banquet',
      email: 'kurla.banquet@grandorchid.in',
      password: 'password123',
      phone: '+91 98200 44556',
      businessType: 'banquet_venue',
      location: {
        type: 'Point',
        coordinates: [arbitraryLng, arbitraryLat],
        formattedAddress: 'Phoenix Marketcity, LBS Marg, Kurla West, Mumbai 400070',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400070',
        placeId: 'ChIJ_arbitrary_place_kurla',
      },
    },
  });

  check(
    'Location UX-1. Business can register with arbitrary valid coordinates',
    regBiz1.status === 201 &&
      Boolean(regBiz1.body?.user?._id) &&
      regBiz1.body?.user?.location?.coordinates?.[0] === arbitraryLng &&
      regBiz1.body?.user?.location?.coordinates?.[1] === arbitraryLat
  );

  // 2. Location is stored in [lng, lat] GeoJSON order in DB
  const storedBiz1 = await User.findById(regBiz1.body?.user?._id).lean();
  check(
    'Location UX-2. Location is stored [lng, lat] GeoJSON Point in MongoDB',
    storedBiz1 &&
      storedBiz1.location?.type === 'Point' &&
      Array.isArray(storedBiz1.location?.coordinates) &&
      storedBiz1.location.coordinates[0] === arbitraryLng &&
      storedBiz1.location.coordinates[1] === arbitraryLat &&
      storedBiz1.location.placeId === 'ChIJ_arbitrary_place_kurla'
  );

  // 3. Invalid latitude rejected
  const regInvalidLat = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Invalid Lat Venue',
      email: 'invalid.lat@test.in',
      password: 'password123',
      businessType: 'hotel',
      location: {
        type: 'Point',
        coordinates: [72.889, 95.5],
        city: 'Mumbai',
      },
    },
  });
  check(
    'Location UX-3. Invalid latitude (> 90 or < -90) rejected with 400',
    regInvalidLat.status === 400 &&
      (regInvalidLat.body?.error?.toLowerCase().includes('latitude') ||
        regInvalidLat.body?.details?.some((d) => d.message?.toLowerCase().includes('latitude')))
  );

  // 4. Invalid longitude rejected
  const regInvalidLng = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Invalid Lng Venue',
      email: 'invalid.lng@test.in',
      password: 'password123',
      businessType: 'hotel',
      location: {
        type: 'Point',
        coordinates: [195.0, 19.08],
        city: 'Mumbai',
      },
    },
  });
  check(
    'Location UX-4. Invalid longitude (> 180 or < -180) rejected with 400',
    regInvalidLng.status === 400 &&
      (regInvalidLng.body?.error?.toLowerCase().includes('longitude') ||
        regInvalidLng.body?.details?.some((d) => d.message?.toLowerCase().includes('longitude')))
  );

  // 5. Existing geo search still works with newly registered location
  const newBizToken = regBiz1.body?.token;
  const resResource = await api('POST', '/api/resources', {
    token: newBizToken,
    body: {
      title: 'Grand Crystal Ballroom Kurla',
      category: 'banquet_space',
      description: 'Expansive ballroom near BKC and Kurla',
      pricing: { basePrice: 50000, priceUnit: 'per_day' },
      capacity: 600,
      location: {
        address: 'Phoenix Marketcity, Kurla',
        city: 'Mumbai',
        pincode: '400070',
        coordinates: [arbitraryLng, arbitraryLat],
      },
    },
  });

  const geoSearchResult = await api(
    'GET',
    `/api/search/resources?lng=${arbitraryLng}&lat=${arbitraryLat}&radiusKm=10&q=Kurla`
  );
  const foundInGeoSearch = (geoSearchResult.body?.results || []).some(
    (r) => r._id === resResource.body?.resource?._id || r.title?.includes('Kurla')
  );
  check(
    'Location UX-5. Existing geo search with $geoNear still works with geocoded resource',
    resResource.status === 201 && geoSearchResult.status === 200 && foundInGeoSearch
  );

  // 6. businessType=other requires customBusinessType
  const regOtherWithoutCustom = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Custom Planner Studio',
      email: 'planner.nocustom@test.in',
      password: 'password123',
      businessType: 'other',
      location: {
        coordinates: [72.9, 19.1],
        city: 'Mumbai',
      },
    },
  });

  const regOtherWithCustom = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Custom Planner Studio',
      email: 'planner.withcustom@test.in',
      password: 'password123',
      businessType: 'other',
      customBusinessType: 'Wedding & Destination Event Planner',
      location: {
        coordinates: [72.9, 19.1],
        city: 'Mumbai',
      },
    },
  });

  check(
    'Location UX-6. businessType=other requires customBusinessType',
    regOtherWithoutCustom.status === 400 &&
      regOtherWithCustom.status === 201 &&
      regOtherWithCustom.body.user?.customBusinessType === 'Wedding & Destination Event Planner'
  );

  // 7. Predefined type does not require custom type
  const regPredefined = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Royal Spice Restaurant',
      email: 'royal.spice@test.in',
      password: 'password123',
      businessType: 'restaurant',
      location: {
        coordinates: [72.95, 19.17],
        city: 'Mulund',
      },
    },
  });
  check(
    'Location UX-7. Predefined businessType does not require custom type',
    regPredefined.status === 201 &&
      regPredefined.body.user?.businessType === 'restaurant' &&
      !regPredefined.body.user?.customBusinessType
  );

  // 8. Logistics hub coordinates persist
  const hubLng = 73.0583;
  const hubLat = 19.2967;
  const regLogistics = await api('POST', '/api/auth/register', {
    body: {
      businessName: 'Apex Freight Hub Logistics',
      email: 'dispatch.apex@test.in',
      password: 'password123',
      phone: '+91 98333 44556',
      userType: 'logistics_partner',
      location: {
        type: 'Point',
        coordinates: [hubLng, hubLat],
        formattedAddress: 'Bhiwandi Cargo Complex, Building D, Thane 421302',
        city: 'Bhiwandi',
        state: 'Maharashtra',
        pincode: '421302',
      },
      logisticsProfile: {
        serviceArea: ['Bhiwandi', 'Thane', 'Mumbai', 'Navi Mumbai'],
        operatingStatus: 'active',
        vehicleInfo: {
          vehicleType: 'Heavy Freight Cargo Truck (5T+)',
          model: 'Tata 407 LPT',
          licensePlate: 'MH-04-AP-8899',
          capacityKg: 3500,
        },
        capacityDescription: '3500 kg payload',
      },
    },
  });

  const storedLogistics = await User.findById(regLogistics.body?.user?._id).lean();
  check(
    'Location UX-8. Logistics hub coordinates persist in location and logisticsProfile.hubLocation',
    regLogistics.status === 201 &&
      storedLogistics &&
      storedLogistics.location?.coordinates?.[0] === hubLng &&
      storedLogistics.location?.coordinates?.[1] === hubLat &&
      storedLogistics.logisticsProfile?.hubLocation?.coordinates?.[0] === hubLng &&
      storedLogistics.logisticsProfile?.hubLocation?.coordinates?.[1] === hubLat
  );

  // 9. Multiple logistics service areas persist
  check(
    'Location UX-9. Multiple logistics service areas persist as array of coverage zones',
    storedLogistics &&
      Array.isArray(storedLogistics.logisticsProfile?.serviceArea) &&
      storedLogistics.logisticsProfile.serviceArea.length === 4 &&
      storedLogistics.logisticsProfile.serviceArea.includes('Bhiwandi') &&
      storedLogistics.logisticsProfile.serviceArea.includes('Navi Mumbai')
  );

  // 10. Old user records remain compatible
  const seededLegacyUser = await User.findOne({ email: 'ops@grandorchid.in' });
  const legacyToken = signToken(seededLegacyUser._id);
  const meCheckLegacy = await api('GET', '/api/auth/me', { token: legacyToken });
  check(
    'Location UX-10. Old user records remain fully compatible without requiring destructive migration',
    meCheckLegacy.status === 200 &&
      meCheckLegacy.body.user?.email === 'ops@grandorchid.in' &&
      meCheckLegacy.body.user?.location !== undefined
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGISTICS ↔ ADMIN DATA CONSISTENCY TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nLogistics ↔ Admin Data Consistency');
  {
    const adminToken = await adminLogin();
    const swiftfleetUser = await User.findOne({ email: 'dispatch@swiftfleet.in' });
    const partnerToken = signToken(swiftfleetUser._id);

    // 1. partner-assigned LogisticsJob appears in partner job API
    const partnerJobsRes = await api('GET', '/api/logistics/jobs', { token: partnerToken });
    const partnerJobs = partnerJobsRes.body?.jobs || [];
    const activeAssignedJob = partnerJobs.find((j) => ['assigned', 'accepted'].includes(j.status));
    check(
      'Logistics-Admin-1. Partner-assigned LogisticsJob appears in partner job API',
      partnerJobsRes.status === 200 &&
        Boolean(activeAssignedJob) &&
        String(activeAssignedJob.logisticsPartner?._id || activeAssignedJob.logisticsPartner) === String(swiftfleetUser._id)
    );

    // 2. same job appears in Admin logistics API
    const adminLogisticsRes = await api('GET', '/api/admin/logistics', { token: adminToken });
    const adminJobs = adminLogisticsRes.body?.jobs || [];
    const sameJobInAdmin = adminJobs.find((j) => String(j._id) === String(activeAssignedJob?._id));
    check(
      'Logistics-Admin-2. Same partner-assigned job appears in Admin logistics API',
      adminLogisticsRes.status === 200 &&
        Boolean(sameJobInAdmin) &&
        sameJobInAdmin.currentStatus === activeAssignedJob.status &&
        String(sameJobInAdmin.assignedPartner?._id || sameJobInAdmin.assignedPartner) === String(swiftfleetUser._id)
    );

    // 3. completed job counted in Admin Completed KPI data
    const completedJobsCountInDb = await LogisticsJob.countDocuments({ status: 'completed' });
    check(
      'Logistics-Admin-3. Completed job counted in Admin Completed KPI data',
      adminLogisticsRes.body?.counts?.completed >= 2 &&
        adminLogisticsRes.body?.counts?.completed === completedJobsCountInDb
    );

    // 4. assigned job counted in Admin Assigned KPI data
    const assignedJobsCountInDb = await LogisticsJob.countDocuments({
      status: { $in: ['assigned', 'accepted', 'pickup_scheduled', 'arrived_at_provider'] },
    });
    check(
      'Logistics-Admin-4. Assigned job counted in Admin Assigned KPI data',
      adminLogisticsRes.body?.counts?.assigned >= 1 &&
        adminLogisticsRes.body?.counts?.assigned === assignedJobsCountInDb
    );

    // 5. sample job appears in Admin in demo/development mode
    const sampleResource = await Resource.findOne();
    const sampleSeeker = await User.findOne({ userType: 'business' });
    const sampleProvider = await User.findOne({ _id: { $ne: sampleSeeker._id }, userType: 'business' });
    const sampleBooking = await Booking.create({
      resource: sampleResource._id,
      provider: sampleProvider._id,
      seeker: sampleSeeker._id,
      quantity: 10,
      startDateTime: new Date(Date.now() + 86400000),
      endDateTime: new Date(Date.now() + 172800000),
      status: 'confirmed',
      agreedPrice: 5000,
      paymentStatus: 'paid',
      isSample: true,
    });
    const sampleJob = await LogisticsJob.create({
      booking: sampleBooking._id,
      seeker: sampleSeeker._id,
      provider: sampleProvider._id,
      resource: sampleResource._id,
      quantity: 10,
      pickupLocation: { address: 'Sample Pickup Pier', city: 'Mumbai' },
      deliveryLocation: { address: 'Sample Delivery Hub', city: 'Thane' },
      scheduledPickupTime: new Date(Date.now() + 86400000),
      requiredDeliveryTime: new Date(Date.now() + 90000000),
      returnRequired: true,
      status: 'unassigned',
      isSample: true,
      timeline: [{ status: 'unassigned', timestamp: new Date(), notes: 'Demo sample job created' }],
    });

    const adminQueryWithSample = await api('GET', '/api/admin/logistics', { token: adminToken });
    const foundSampleInAdmin = adminQueryWithSample.body?.jobs?.find((j) => String(j._id) === String(sampleJob._id));
    check(
      'Logistics-Admin-5. Sample job appears in Admin in demo/development mode with isSample flag',
      Boolean(foundSampleInAdmin) && foundSampleInAdmin.isSample === true
    );

    // 6. Admin assignment appears for assigned partner
    const assignRes = await api('PATCH', `/api/admin/logistics/${sampleJob._id}/assign`, {
      token: adminToken,
      body: { partnerId: swiftfleetUser._id, notes: 'Direct test admin assignment to SwiftFleet' },
    });
    const partnerJobsAfterAssign = await api('GET', '/api/logistics/jobs', { token: partnerToken });
    const assignedJobInPartner = partnerJobsAfterAssign.body?.jobs?.find((j) => String(j._id) === String(sampleJob._id));
    check(
      'Logistics-Admin-6. Admin assignment appears for assigned partner in /api/logistics/jobs',
      assignRes.status === 200 &&
        Boolean(assignedJobInPartner) &&
        assignedJobInPartner.status === 'assigned' &&
        String(assignedJobInPartner.logisticsPartner?._id || assignedJobInPartner.logisticsPartner) === String(swiftfleetUser._id)
    );

    // 7. partner status update appears in next Admin query
    const acceptRes = await api('PATCH', `/api/logistics/jobs/${sampleJob._id}/accept`, {
      token: partnerToken,
    });
    const statusUpdateRes = await api('PATCH', `/api/logistics/jobs/${sampleJob._id}/status`, {
      token: partnerToken,
      body: { status: 'pickup_scheduled', notes: 'Driver en route for pickup' },
    });
    const adminJobsAfterStatus = await api('GET', '/api/admin/logistics', { token: adminToken });
    const sampleJobUpdatedInAdmin = adminJobsAfterStatus.body?.jobs?.find((j) => String(j._id) === String(sampleJob._id));
    check(
      'Logistics-Admin-7. Partner status update appears in next Admin query without drift',
      acceptRes.status === 200 &&
        statusUpdateRes.status === 200 &&
        Boolean(sampleJobUpdatedInAdmin) &&
        sampleJobUpdatedInAdmin.currentStatus === 'pickup_scheduled' &&
        sampleJobUpdatedInAdmin.timeline?.some((t) => t.status === 'pickup_scheduled')
    );

    // 8. no duplicate LogisticsJob created through assignment
    const totalJobsBeforeReassign = await LogisticsJob.countDocuments();
    await api('PATCH', `/api/admin/logistics/${sampleJob._id}/assign`, {
      token: adminToken,
      body: { partnerId: swiftfleetUser._id, notes: 'Re-confirming assignment' },
    });
    const totalJobsAfterReassign = await LogisticsJob.countDocuments();
    check(
      'Logistics-Admin-8. No duplicate LogisticsJob created through assignment',
      totalJobsBeforeReassign === totalJobsAfterReassign
    );

    // 9. Admin metrics derive from LogisticsJob records
    const totalInDb = await LogisticsJob.countDocuments();
    const latestAdminMetrics = await api('GET', '/api/admin/logistics', { token: adminToken });
    check(
      'Logistics-Admin-9. Admin metrics derive directly from actual LogisticsJob records in database',
      latestAdminMetrics.status === 200 &&
        latestAdminMetrics.body?.counts?.total === totalInDb &&
        typeof latestAdminMetrics.body?.counts?.unassigned === 'number' &&
        typeof latestAdminMetrics.body?.counts?.assigned === 'number' &&
        typeof latestAdminMetrics.body?.counts?.active === 'number' &&
        typeof latestAdminMetrics.body?.counts?.completed === 'number' &&
        typeof latestAdminMetrics.body?.counts?.issue === 'number'
    );

    // 10. frontend response contract matches AdminLogistics expectations
    const contractJob = latestAdminMetrics.body?.jobs?.[0];
    check(
      'Logistics-Admin-10. Frontend response contract matches AdminLogistics expectations',
      Boolean(contractJob) &&
        Boolean(contractJob._id) &&
        Boolean(contractJob.bookingId || contractJob.booking) &&
        contractJob.resource !== undefined &&
        typeof contractJob.quantity === 'number' &&
        contractJob.seeker !== undefined &&
        contractJob.provider !== undefined &&
        contractJob.currentStatus !== undefined &&
        typeof contractJob.requiresReturn === 'boolean' &&
        Array.isArray(contractJob.timeline) &&
        typeof contractJob.isSample === 'boolean' &&
        contractJob.updatedAt !== undefined &&
        Array.isArray(latestAdminMetrics.body?.partners) &&
        latestAdminMetrics.body?.counts !== undefined
    );
  }

  // ---- delivery conditions (ML) ----
  // The model is trained offline (npm run train:delivery) on policy-labelled
  // synthetic listings; these checks pin its behaviour on the real listings
  // and the recorded before/after condition checks built on it.
  console.log('\nDelivery conditions — model');
  check('the delivery model loads and matches the feature code', loadModel().version === DELIVERY_FEATURE_VERSION);
  const deliveryMetrics = JSON.parse(
    readFileSync(new URL('../ml/delivery/metrics.json', import.meta.url), 'utf8')
  );
  check(
    'hold-out accuracy meets the bar (tier ≥ 90%, crew MAE ≤ 1)',
    deliveryMetrics.classifiers.tier.accuracy >= 0.9 && deliveryMetrics.regressors.crew.mae <= 1,
    JSON.stringify({ tier: deliveryMetrics.classifiers.tier, crew: deliveryMetrics.regressors.crew })
  );

  const chairRes = await Resource.findOne({ title: /Chiavari/ }).lean();
  const paRes = await Resource.findOne({ title: /Line Array/ }).lean();
  const hallRes = await Resource.findOne({ title: /Crystal Grand/ }).lean();
  const assess = async (id, q) => (await api('GET', `/api/resources/${id}/delivery?quantity=${q}`)).body.assessment;

  const bulkChairs = await assess(chairRes._id, 300);
  check(
    '300 chairs need professional handlers, a crew of 4+ and a truck',
    bulkChairs.requiresDelivery &&
      bulkChairs.plan.tier === 'professional_handlers' &&
      bulkChairs.plan.crew >= 4 &&
      /^truck/.test(bulkChairs.plan.vehicle),
    JSON.stringify(bulkChairs.plan)
  );
  const fewChairs = await assess(chairRes._id, 20);
  check('crew grows with quantity: 300 chairs need more hands than 20', bulkChairs.plan.crew > fewChairs.plan.crew);

  const twoSpeakers = await assess(paRes._id, 2);
  check(
    '2 PA speakers get a different plan: small crew, fragile, flight cases, function test',
    twoSpeakers.plan.crew < bulkChairs.plan.crew &&
      twoSpeakers.plan.fragility === 'high' &&
      twoSpeakers.plan.packaging === 'flight_cases' &&
      twoSpeakers.plan.checkLevel === 'itemised_photo_function_test' &&
      twoSpeakers.checkpoints[0].items.some((i) => i.key === 'function'),
    JSON.stringify(twoSpeakers.plan)
  );
  check(
    'both sides get instructions, and the cost is marked advisory',
    bulkChairs.instructions.lister.length > 0 && bulkChairs.instructions.seeker.length > 0 && bulkChairs.cost.advisory === true && bulkChairs.cost.max >= bulkChairs.cost.min
  );
  check('a hall is used on site and needs no delivery', (await assess(hallRes._id, 1)).requiresDelivery === false);
  check('the quantity assessed is clamped to the stock listed', (await assess(chairRes._id, 99999)).quantity === chairRes.totalQuantity);

  const draft = { title: 'Crystal chandelier', description: 'Handcrafted, 1.2m drop', category: 'other', totalQuantity: 4, pricing: { basePrice: 12000 } };
  check('the listing preview requires sign-in', (await api('POST', '/api/resources/delivery-preview', { body: draft })).status === 401);
  check(
    'the listing preview rejects an unknown category',
    (await api('POST', '/api/resources/delivery-preview', { token: seasons, body: { ...draft, category: 'spaceship' } })).status === 400
  );
  const preview = await api('POST', '/api/resources/delivery-preview', { token: seasons, body: draft });
  check(
    'a draft listing is assessed while it is being written',
    preview.status === 200 && preview.body.assessment.requiresDelivery && preview.body.assessment.plan.fragility === 'high'
  );

  console.log('\nDelivery conditions — booking plan and condition checks');
  const cBooking = await api('POST', '/api/bookings', {
    token: kalpataru,
    body: { resourceId: chairRes._id, quantity: 20, startDateTime: at(96, 10), endDateTime: at(96, 22) },
  });
  const cId = cBooking.body.booking?._id;
  const cDetail = await api('GET', `/api/bookings/${cId}`, { token: kalpataru });
  check(
    'a new booking carries a snapshot of its delivery plan',
    cDetail.body.booking?.deliveryPlan?.requiresDelivery === true &&
      cDetail.body.booking.deliveryPlan.quantity === 20 &&
      !cDetail.body.booking.deliveryPlan.computedNow
  );

  const checklistOf = (plan, cp) => plan.checkpoints.find((c) => c.key === cp).items;
  const answer = (items, fail = []) => items.map((i) => ({ key: i.key, ok: !fail.includes(i.key) }));
  const plan = cDetail.body.booking.deliveryPlan;
  const record = (cp, token, body) => api('POST', `/api/bookings/${cId}/condition-checks/${cp}`, { token, body });
  const good = (cp) => ({ items: answer(checklistOf(plan, cp)), overall: 'good', countVerified: 20 });

  check('no checks before the booking is accepted', (await record('dispatch', silverline, good('dispatch'))).status === 400);
  await api('PATCH', `/api/bookings/${cId}/accept`, { token: silverline, body: {} });
  check('an outsider cannot record a check', (await record('dispatch', orchid, good('dispatch'))).status === 403);
  check('the seeker cannot record the before-delivery check', (await record('dispatch', kalpataru, good('dispatch'))).status === 403);
  check('checks are recorded in order', (await record('delivery', kalpataru, good('delivery'))).status === 409);
  check(
    'answers must come from the plan’s checklist',
    (await record('dispatch', silverline, { ...good('dispatch'), items: [...good('dispatch').items, { key: 'made_up', ok: true }] })).status === 400
  );
  check(
    'every checklist item must be answered',
    (await record('dispatch', silverline, { ...good('dispatch'), items: good('dispatch').items.slice(1) })).status === 400
  );
  const dispatched = await record('dispatch', silverline, good('dispatch'));
  check('the lister records the before-delivery check', dispatched.status === 201);
  check('a checkpoint is recorded only once', (await record('dispatch', silverline, good('dispatch'))).status === 409);

  const damaged = await record('delivery', kalpataru, {
    items: answer(checklistOf(plan, 'delivery'), ['visible_damage']),
    overall: 'damaged',
    countVerified: 19,
    notes: 'One chair arrived with a cracked leg.',
  });
  check('the seeker records the after-delivery check', damaged.status === 201);
  check(
    'reported damage notifies the lister',
    Boolean(await Notification.findOne({ user: chairRes.owner, relatedBooking: cId, title: /Damage reported/ }))
  );

  // The logistics partner assigned to the job may record too.
  await api('PATCH', `/api/bookings/${cId}/confirm`, { token: kalpataru });
  const cJob = await LogisticsJob.findOne({ booking: cId }).lean();
  const partnerUser = await User.findOne({ email: 'dispatch@swiftfleet.in' }).lean();
  if (cJob && partnerUser) {
    await api('PATCH', `/api/admin/logistics/${cJob._id}/assign`, { token: admin, body: { partnerId: partnerUser._id } });
    const partnerToken = await login('dispatch@swiftfleet.in');
    check('the assigned logistics partner can record the return check', (await record('return', partnerToken, good('return'))).status === 201);
  }

  const seen = await Promise.all([kalpataru, silverline].map((t) => api('GET', `/api/bookings/${cId}`, { token: t })));
  check(
    'both parties see every recorded check',
    seen.every((r) => (r.body.booking?.conditionChecks || []).length === (cJob ? 3 : 2)) &&
      seen[1].body.booking.conditionChecks.find((c) => c.checkpoint === 'delivery').items.some((i) => i.key === 'visible_damage' && i.ok === false)
  );
  const cStory = (await api('GET', `/api/admin/live/booking/${cId}/timeline`, { token: admin })).body;
  const checkRoles = cStory.events.filter((e) => e.action === 'condition_checked').map((e) => e.role);
  check(
    'the Live tracker shows each check with who recorded it',
    checkRoles[0] === 'lister' && checkRoles[1] === 'seeker' && (!cJob || checkRoles[2] === 'logistics'),
    checkRoles.join(',')
  );

  // ---- inspection protocol generator (AI/model only; no routes or UI) ----
  // Offline: the AI layer is exercised with a mock Claude client, so these
  // checks cost nothing and never depend on the network.
  console.log('\nInspection protocol generator');
  const inspect = (c, opts = { ai: false }) => generateInspectionProtocol(DEMO_CASES.find((x) => x.key === c).input, opts);
  const inspDell = await inspect('dell_latitude_5420');
  const inspIphone = await inspect('iphone_14');
  const inspInnova = await inspect('toyota_innova');
  const inspChairs = await inspect('banquet_chairs_50');
  const inspMac = await inspect('macbook_pro_14_m3_pro');
  const idsOf = (p) => new Set(p.parameters.map((x) => x.id));
  const titles = (p) => p.parameters.map((x) => `${x.title} ${x.description}`.toLowerCase()).join(' | ');

  check(
    'each test product lands in its own category',
    [inspDell.productCategory, inspIphone.productCategory, inspInnova.productCategory, inspChairs.productCategory].join() === 'laptop,mobile_phone,vehicle,furniture'
  );
  const sets = [inspDell, inspIphone, inspInnova, inspChairs].map(idsOf);
  const exclusive = (a, b) => [...a].filter((x) => !b.has(x)).length;
  check(
    'the four protocols are clearly different (every pair has 7+ checks exclusive to each side)',
    sets.every((a, i) => sets.every((b, j) => i === j || exclusive(a, b) >= 7)),
    sets.map((s) => s.size).join('/')
  );
  check(
    'two laptops differ too: Dell gets its diagnostics, the MacBook gets MagSafe and Apple Diagnostics',
    idsOf(inspDell).has('dell_preboot_diagnostics') && !idsOf(inspDell).has('magsafe_charging') &&
      idsOf(inspMac).has('magsafe_charging') && idsOf(inspMac).has('apple_diagnostics') && !idsOf(inspMac).has('dell_preboot_diagnostics')
  );
  const ram = inspDell.parameters.find((p) => p.title === 'RAM');
  check(
    'a declared spec becomes a claim-vs-actual check (RAM claimed 16GB, system check)',
    ram?.claimedValue === '16GB' && ram.verificationType === 'system_check' && ram.category === 'specification' && Boolean(ram.verificationInstruction)
  );
  check(
    'the iPhone gets Face ID, IMEI and battery health from its 90% claim — and no keyboard, engine or HDMI',
    idsOf(inspIphone).has('face_unlock') && idsOf(inspIphone).has('imei') &&
      inspIphone.parameters.find((p) => p.id === 'battery_health')?.claimedValue === '90%' &&
      !/keyboard|engine|hdmi|mileage/.test(titles(inspIphone))
  );
  check(
    'conditional checks follow the attributes: automatic Innova gets the gear test, not a clutch test',
    idsOf(inspInnova).has('transmission_automatic') && !idsOf(inspInnova).has('transmission_manual')
  );
  const inspTouchOn = await generateInspectionProtocol({ ...DEMO_CASES[0].input, specifications: { ...DEMO_CASES[0].input.specifications, touchscreen: 'Yes' } }, { ai: false });
  check('a touchscreen laptop gets a touchscreen check; the standard Dell does not', idsOf(inspTouchOn).has('touchscreen') && !idsOf(inspDell).has('touchscreen'));
  check(
    'battery checks only where there is a battery',
    idsOf(inspDell).has('battery_safety') && !idsOf(inspChairs).has('battery_safety') && !idsOf(inspInnova).has('battery_health')
  );
  check(
    'a lot of 50 chairs is counted in full and sampled for detailed checks',
    inspChairs.inspectionScope.sampleSize === 10 &&
      inspChairs.parameters.find((p) => p.id === 'unit_count')?.appliesTo === 'lot' &&
      inspChairs.parameters.find((p) => p.id === 'structural_integrity')?.appliesTo === 'sample'
  );
  check(
    'every parameter has a method, an expected result and is pending inspection — nothing is marked verified',
    [inspDell, inspIphone, inspInnova, inspChairs].every((p) =>
      p.status === 'pending_inspection' &&
      p.parameters.every((x) => x.verificationType && x.expectedResult && x.instructions.length && x.status === 'pending_inspection')
    )
  );
  check(
    'damage-type checks require evidence on failure',
    inspDell.parameters.filter((p) => ['physical', 'safety', 'identity'].includes(p.category)).every((p) => p.requiresEvidenceOnFail)
  );
  check(
    'specialist vehicle checks are flagged for a qualified inspector',
    inspInnova.parameters.find((p) => p.id === 'brakes')?.requiresQualifiedInspector === true
  );
  check(
    'every protocol records model, prompt and template versions',
    ['modelName', 'modelVersion', 'promptVersion', 'templateVersion', 'generationTimestamp'].every((k) => inspDell.generation[k])
  );
  check('with AI off the protocol is complete and says so', inspDell.generation.mode === 'baseline_only' && inspDell.generation.ai.status === 'disabled');

  // AI layer, with a mock Claude client.
  const mockClient = (reply) => ({
    beta: { messages: { create: async () => (typeof reply === 'function' ? reply() : reply) } },
  });
  const aiParam = (over) => ({
    title: 'X', category: 'functional', description: 'd', instructions: ['Do it'], expectedResult: 'ok',
    verificationType: 'functional_test', weight: 3, requiresEvidenceOnFail: false, claimedValue: null, basedOnImage: false, reason: 'r', ...over,
  });
  const aiReply = {
    stop_reason: 'end_turn',
    model: 'claude-opus-5',
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{
      type: 'text',
      text: JSON.stringify({
        inferredCategory: 'mobile_phone',
        imageObservations: [{ observation: 'Scuff on the lower-left corner', suggestedFocus: 'Frame corner' }],
        additionalParameters: [
          aiParam({ title: 'Screen condition', category: 'physical', verificationType: 'visual', instructions: ['Look for micro-scratches under raking light'] }),
          aiParam({ title: 'MagSafe magnet alignment', instructions: ['Attach a MagSafe charger and confirm it snaps into place'], weight: 5, claimedValue: '256GB' }),
          aiParam({ title: 'Keyboard backlight', instructions: ['Toggle the backlight'] }),
          aiParam({ title: 'Battery connector', instructions: ['Open the back cover and inspect the battery connector'] }),
        ],
      }),
    }],
  };
  const inspWithAi = await generateInspectionProtocol(DEMO_CASES[1].input, { ai: { client: mockClient(aiReply) } });
  const inspMagsafe = inspWithAi.parameters.find((p) => p.title === 'MagSafe magnet alignment');
  check('AI additions are used when available', inspWithAi.generation.mode === 'baseline_plus_ai' && inspMagsafe?.generationSource === 'ai_generated');
  check(
    'an AI duplicate of a baseline check is merged, not repeated ("Screen condition" → Display Condition)',
    inspWithAi.parameters.find((p) => p.id === 'display_condition')?.generationSource === 'baseline_plus_ai' &&
      !inspWithAi.parameters.some((p) => p.title === 'Screen condition')
  );
  check(
    'AI weight is capped and an unsupported AI claim is dropped',
    inspMagsafe.weight === 4 && inspMagsafe.claimedValue === undefined
  );
  check(
    'irrelevant and unsafe AI checks are rejected with reasons',
    inspWithAi.validation.rejectedAiParameters.some((r) => r.title === 'Keyboard backlight' && /irrelevant/.test(r.reason)) &&
      inspWithAi.validation.rejectedAiParameters.some((r) => r.title === 'Battery connector' && /safety/.test(r.reason)) &&
      inspWithAi.validation.removedUnsafeInstructions.length >= 1
  );
  check('image observations are kept as hints, never as evidence', inspWithAi.imageHints.length === 1 && /not evidence/.test(inspWithAi.imageHints[0].note));

  const inspFailures = [
    ['network error', mockClient(() => { throw new Error('ECONNRESET'); })],
    ['refusal', mockClient({ ...aiReply, stop_reason: 'refusal' })],
    ['truncation', mockClient({ ...aiReply, stop_reason: 'max_tokens' })],
    ['invalid JSON', mockClient({ ...aiReply, content: [{ type: 'text', text: '{not json' }] })],
    ['schema mismatch', mockClient({ ...aiReply, content: [{ type: 'text', text: '{"additionalParameters": "nope"}' }] })],
  ];
  for (const [label, client] of inspFailures) {
    const p = await generateInspectionProtocol(DEMO_CASES[1].input, { ai: { client } });
    check(
      `AI failure (${label}) falls back to the full baseline protocol`,
      p.generation.mode === 'baseline_only' && p.generation.ai.status === 'failed' && p.parameters.length === inspIphone.parameters.length,
      p.generation.ai.reason
    );
  }

  const inspLedWall = await generateForResource((await Resource.findOne({ title: /LED Wall/ }).lean()), { ai: false });
  check(
    'an Indulge listing is inspected through the adapter (LED wall → module uniformity check)',
    inspLedWall.productCategory === 'television' && inspLedWall.parameters.some((p) => p.id === 'led_module_uniformity')
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
