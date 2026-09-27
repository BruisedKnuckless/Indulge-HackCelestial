import { matchesRecurringSchedule, validateBookingRequest, withinAvailabilityWindows } from '../services/availability.service.js';
import { runWeatherSimulation } from '../services/digital-twin.service.js';
import { getPublicSignals } from '../services/public-signals.service.js';
import Booking from '../models/Booking.js';
import LogisticsJob from '../models/LogisticsJob.js';
import Resource from '../models/Resource.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { signToken } from '../middleware/auth.middleware.js';

export async function verifyPolish({ api, check, token }) {
  console.log('\nMarketplace polish regressions');
  const day = (date, hour, minute = 0) => new Date(2030, 0, date, hour, minute);
  const schedule = { startTime: '09:00', endTime: '18:00' };
  check('POLISH: daily hours allow a booking entirely inside the window', matchesRecurringSchedule(schedule, day(7, 9), day(7, 18)));
  check('POLISH: closing overnight gap cannot be booked', !matchesRecurringSchedule(schedule, day(7, 10), day(8, 12)));
  check('POLISH: midnight end cannot bypass closing time', !matchesRecurringSchedule(schedule, day(7, 10), day(8, 0)));
  check('POLISH: a 24-hour schedule allows adjacent days', matchesRecurringSchedule({ startTime: '00:00', endTime: '24:00' }, day(7, 10), day(8, 12)));
  check('POLISH: time-only custom schedules are enforced', !withinAvailabilityWindows({ availabilityMode: 'custom', recurringSchedule: schedule }, day(7, 7), day(7, 8)));
  check('POLISH: exact closing time remains valid', matchesRecurringSchedule(schedule, day(7, 17), day(7, 18)));
  for (const quantity of [0, -1, 1.5, NaN, Infinity, undefined]) {
    const verdict = await validateBookingRequest({ resource: {}, quantity, start: day(7, 9), end: day(7, 18) });
    check(`POLISH: invalid quantity ${String(quantity)} fails before database access`, !verdict.ok && /whole number/.test(verdict.reason));
  }
  const search = await api('GET', '/api/search/resources?lat=19.2183&lng=72.9781', { token });
  const publicFields = new Set(['_id', 'businessName', 'ratingAvg', 'ratingCount', 'location']);
  check('POLISH: geographic search exposes only public provider fields', search.body.results.length > 0 && search.body.results.every((r) => Object.keys(r.owner).every((key) => publicFields.has(key))));
  const reserved = await Booking.findOne({ status: 'confirmed' }).populate('resource');
  const params = new URLSearchParams({ start: reserved.startDateTime.toISOString(), end: reserved.endDateTime.toISOString(), quantity: String(reserved.resource.totalQuantity) });
  const guestSearch = await api('GET', `/api/search/resources?${params}`);
  check('POLISH: guest date searches also respect committed stock', guestSearch.status === 200 && !guestSearch.body.results.some((r) => r._id === String(reserved.resource._id)));
  const invalidSearch = await api('GET', '/api/search/resources?start=invalid&end=invalid');
  check('POLISH: malformed search dates return a useful 400', invalidSearch.status === 400);

  const noAuth = await api('POST', '/api/digital-twin/simulate', { body: { location: 'Thane', scenario: {} } });
  check('POLISH: twin denies anonymous access to booking details', noAuth.status === 401);
  const invalid = await api('POST', '/api/digital-twin/simulate', { token, body: { location: 'Thane', scenario: { rainfallMmPerHour: -10 } } });
  check('POLISH: invalid weather scenario returns 400', invalid.status === 400 && /rainfall/.test(invalid.body.error));

  // Stub only external feeds. Local HTTP still exercises the real API, auth,
  // database filters, and serialization. Never spend API credits in this test.
  const originalFetch = globalThis.fetch;
  const weatherKey = process.env.OPENWEATHER_API_KEY;
  globalThis.fetch = (url, options) => String(url).startsWith('http://localhost:')
    ? originalFetch(url, options)
    : Promise.resolve(new Response('<rss><channel></channel></rss>', { status: 200 }));
  process.env.OPENWEATHER_API_KEY = '';
  try {
    const scenario = { rainfallMmPerHour: 90, windSpeedMps: 15, temperature: 28, durationHours: 5 };
    const me = (await api('GET', '/api/auth/me', { token })).body.user;
    const ownBookings = await Booking.find({ $or: [{ provider: me._id }, { seeker: me._id }] }).lean();
    const ownIds = new Set(ownBookings.map((b) => String(b._id)));
    const ownJobs = await LogisticsJob.find({ $or: [{ provider: me._id }, { seeker: me._id }, { logisticsPartner: me._id }] }).lean();
    const ownJobIds = new Set(ownJobs.map((j) => String(j._id)));
    const before = JSON.stringify(await Booking.find().sort('_id').lean());
    const storm = await api('POST', '/api/digital-twin/simulate', { token, body: { location: 'Thane', scenario } });
    check('POLISH: twin computes a real scenario', storm.status === 200 && storm.body.metrics.totalResourcesScanned > 0);
    check('POLISH: twin only exposes own booking records', storm.body.affectedBookings.every((b) => ownIds.has(b.bookingId)) && await Booking.countDocuments() > ownIds.size);
    check('POLISH: twin only exposes own logistics records', storm.body.affectedLogisticsJobs.every((j) => ownJobIds.has(j.jobId)));
    check('POLISH: storm comparison lowers availability against the same clear baseline', storm.body.comparison.delta.availabilityPercentagePoints < 0 && storm.body.comparison.baselineMetrics.avgAvailabilityFactor === 1);
    check('POLISH: clear baseline has no demand surge or at-risk bookings', storm.body.comparison.baselineMetrics.surgeRequirements === 0 && storm.body.comparison.baselineMetrics.totalBookingsAtRisk === 0);
    const calm = await api('POST', '/api/digital-twin/simulate', { token, body: { location: 'Thane', scenario: { rainfallMmPerHour: 0, windSpeedMps: 0, temperature: 25, durationHours: 5 } } });
    check('POLISH: clear scenario has zero comparison deltas', Object.values(calm.body.comparison.delta).every((v) => v === 0));
    const remote = await api('POST', '/api/digital-twin/simulate', { token, body: { location: { lat: 0, lon: 0, name: 'Empty test region' }, scenario } });
    check('POLISH: equator coordinates work and empty regions never import distant resources', remote.status === 200 && remote.body.metrics.totalResourcesScanned === 0 && remote.body.affectedLogisticsJobs.length === 0);
    const live = await api('POST', '/api/digital-twin/simulate', { token, body: { location: 'Thane', scenario, useLiveWeather: true } });
    check('POLISH: unavailable live weather returns 503 without inventing conditions', live.status === 503 && !live.body.success);
    const signals = await getPublicSignals('Regression empty feed', true);
    check('POLISH: empty public feed never fabricates reports', signals.signals.length === 0 && signals.clusters.length === 0 && signals.isLiveFeed === false);
    globalThis.fetch = () => Promise.resolve(new Response(`<rss><channel>
      <item><title>Old flood report</title><pubDate>${new Date(Date.now() - 72 * 3600_000).toUTCString()}</pubDate></item>
      <item><title>Undated storm report</title></item>
      <item><title>Current rain report</title><pubDate>${new Date().toUTCString()}</pubDate><link>https://example.com/report</link></item>
    </channel></rss>`, { status: 200 }));
    const datedSignals = await getPublicSignals('Regression dated feed', true);
    check('POLISH: social signals exclude old and undated reports', datedSignals.signals.length === 1 && datedSignals.signals[0].title === 'Current rain report');
    check('POLISH: simulations leave booking records unchanged', before === JSON.stringify(await Booking.find().sort('_id').lean()));
    const invalidCoords = await runWeatherSimulation({ location: { lat: 91, lon: 181 }, scenario });
    check('POLISH: invalid coordinates fail before querying', !invalidCoords.success);
  } finally {
    globalThis.fetch = originalFetch;
    if (weatherKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = weatherKey;
  }
}

export async function verifyPaymentPolish({ api, check }) {
  console.log('\nPayment polish regressions');
  const seeker = await User.create({ businessName: 'Payment Regression Seeker', email: 'polish-payment@test.example', passwordHash: 'test-only', businessType: 'other' });
  const resource = await Resource.findOne({ status: 'active' });
  const provider = await User.findById(resource.owner);
  const token = signToken(seeker);
  const providerToken = signToken(provider);
  const booking = await Booking.create({ resource: resource._id, provider: provider._id, seeker: seeker._id,
    requestedQuantity: 4, quotedPrice: 2000, startDateTime: new Date(Date.now() + 100 * 86400_000),
    endDateTime: new Date(Date.now() + 101 * 86400_000), status: 'pending', logistics: 'self_pickup' });
  const quote = await api('GET', `/api/wallet/quote/${booking._id}`, { token });
  check('POLISH: quantity is not charged twice in payment quote', quote.body.feeBreakdown.resourceSubtotal === 2000);
  const beforeLedger = await WalletTransaction.countDocuments();
  const forbidden = await api('PATCH', `/api/bookings/${booking._id}/pay`, { token: providerToken, body: { paymentMethod: 'upi' } });
  check('POLISH: unauthorized payment has no wallet side effects', forbidden.status === 403 && await WalletTransaction.countDocuments() === beforeLedger);
  const pending = await api('PATCH', `/api/bookings/${booking._id}/pay`, { token, body: { paymentMethod: 'upi' } });
  const pendingWallet = await api('POST', '/api/wallet/pay-booking', { token, body: { bookingId: booking._id, autoTopUp: true } });
  check('POLISH: unaccepted bookings cannot credit or reserve wallet funds', pending.status === 400 && pendingWallet.status === 400 && await WalletTransaction.countDocuments() === beforeLedger);
  booking.status = 'accepted';
  booking.agreedPrice = 2000;
  await booking.save();
  const invalid = await api('PATCH', `/api/bookings/${booking._id}/pay`, { token, body: { paymentMethod: 'invalid' } });
  check('POLISH: invalid payment method has no wallet side effects', invalid.status === 400 && await WalletTransaction.countDocuments() === beforeLedger);
  const paid = await api('PATCH', `/api/bookings/${booking._id}/pay`, { token, body: { paymentMethod: 'upi', idempotencyKey: 'polish-payment-1' } });
  check('POLISH: actual payment uses the quoted rental total once', paid.status === 200 && paid.body.feeBreakdown.resourceSubtotal === 2000 && paid.body.booking.status === 'confirmed');
  const balance = JSON.stringify(await Wallet.findOne({ user: seeker._id }).lean());
  const ledgerCount = await WalletTransaction.countDocuments();
  const retry = await api('PATCH', `/api/bookings/${booking._id}/pay`, { token, body: { paymentMethod: 'upi', idempotencyKey: 'polish-payment-2' } });
  const walletRetry = await api('POST', '/api/wallet/pay-booking', { token, body: { bookingId: booking._id, autoTopUp: true, idempotencyKey: 'polish-payment-3' } });
  check('POLISH: payment retries across both routes do not debit or credit again', retry.body.alreadyPaid && walletRetry.body.alreadyPaid && await WalletTransaction.countDocuments() === ledgerCount && balance === JSON.stringify(await Wallet.findOne({ user: seeker._id }).lean()));
}
