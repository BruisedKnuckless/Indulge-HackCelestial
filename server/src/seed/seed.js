import mongoose from 'mongoose';
import User from '../models/User.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import Cart from '../models/Cart.js';
import Negotiation from '../models/Negotiation.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import Transaction from '../models/Transaction.js';
import { BUSINESSES, RESOURCES } from './seedData.js';
import { estimatePrice } from '../utils/pricing.js';

const DEMO_PASSWORD = 'indulge123';
const DAY = 24 * 3600 * 1000;

/** Date helper: N days from now at a given hour, in local time. */
function at(daysFromNow, hour = 9) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function runSeed({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;

  await Promise.all([
    User.deleteMany({}),
    Resource.deleteMany({}),
    Booking.deleteMany({}),
    Cart.deleteMany({}),
    Negotiation.deleteMany({}),
    Review.deleteMany({}),
    Notification.deleteMany({}),
    Transaction.deleteMany({}),
  ]);

  const passwordHash = await User.hashPassword(DEMO_PASSWORD);

  const users = {};
  for (const b of BUSINESSES) {
    const { key, ...rest } = b;
    users[key] = await User.create({ ...rest, passwordHash });
  }
  log(`  ✓ ${Object.keys(users).length} businesses`);

  const resources = [];
  for (const r of RESOURCES) {
    const owner = users[r.owner];
    resources.push(
      await Resource.create({
        ...r,
        owner: owner._id,
        location: {
          address: owner.location.address,
          city: owner.location.city,
          coordinates: owner.location.coordinates,
        },
      })
    );
  }
  log(`  ✓ ${resources.length} resources`);

  const find = (fragment) => resources.find((r) => r.title.includes(fragment));

  const ballroom = find('Crystal Grand');
  const orchidHall = find('Orchid Hall');
  const chairs = find('Chiavari');
  const pa = find('Line Array');
  const kitchen = find('Commercial Kitchen');
  const shuttle = find('Guest Shuttle');
  const ledWall = find('LED Wall');
  const parking = find('Covered Parking');

  /** Small helper so the demo bookings below stay readable. */
  const book = (resource, seeker, start, end, status, extra = {}) => {
    const quantity = extra.quantity ?? 1;
    return Booking.create({
      resource: resource._id,
      provider: resource.owner,
      seeker: seeker._id,
      requestedQuantity: quantity,
      startDateTime: start,
      endDateTime: end,
      status,
      quotedPrice: estimatePrice(resource, { quantity, startDateTime: start, endDateTime: end }),
      agreedPrice: ['accepted', 'confirmed', 'completed'].includes(status)
        ? estimatePrice(resource, { quantity, startDateTime: start, endDateTime: end })
        : undefined,
      ...extra,
    });
  };

  // A confirmed booking on the ballroom 14 days out. This is the conflict the
  // demo leans on: requesting the same hall for that date is refused, while the
  // day either side stays open.
  await book(ballroom, users.kalpataru, at(14, 10), at(14, 23), 'confirmed', {
    urgency: 'medium',
    notes: 'Sharma–Mehta wedding reception. Stage and valet included.',
  });

  // Chairs are partially allocated: 300 total, 180 already committed, so a
  // request for 200 fails while 100 succeeds — the partial-quantity story.
  await book(chairs, users.seasons, at(14, 8), at(15, 2), 'confirmed', {
    quantity: 120,
    notes: 'Overflow seating for the Crystal Grand reception.',
  });
  await book(chairs, users.coastal, at(14, 12), at(14, 22), 'accepted', {
    quantity: 60,
    notes: 'Terrace dinner service.',
  });

  // Live inbox items. The Grand Orchid is the primary demo login, so it needs
  // requests waiting on it as a provider, not just ones it has sent.
  await book(pa, users.grandOrchid, at(9, 16), at(9, 23), 'pending', {
    urgency: 'high',
    notes: 'Annual staff awards night — need soundcheck by 4pm.',
  });
  await book(kitchen, users.spiceRoute, at(5, 23), at(6, 7), 'pending', {
    urgency: 'medium',
    notes: 'Overflow prep for a 600-cover corporate lunch.',
  });
  await book(orchidHall, users.kalpataru, at(11, 9), at(11, 21), 'pending', {
    urgency: 'high',
    notes: 'Pharma dealer conference, 180 pax. Need the foyer for registration from 8am.',
  });
  await book(parking, users.seasons, at(14, 17), at(14, 23), 'pending', {
    quantity: 45,
    urgency: 'medium',
    notes: 'Guest overflow parking for the Crystal Grand reception across the road.',
  });
  await book(orchidHall, users.coastal, at(26, 10), at(26, 22), 'accepted', {
    notes: 'Supplier showcase — confirmed verbally, awaiting our sign-off.',
  });

  // Parking history, so the second Grand Orchid listing is not flat at zero.
  for (const [d, qty] of [[-6, 55], [-13, 40], [-20, 62], [-29, 35]]) {
    await book(parking, users.kalpataru, at(d, 17), at(d, 23), 'completed', { quantity: qty });
  }

  // A request mid-negotiation, so the counter-offer thread has content.
  const negotiating = await book(ledWall, users.seasons, at(21, 9), at(21, 22), 'negotiating', {
    notes: 'Product launch backdrop. Can you do better on price for a full-day hire?',
  });
  await Negotiation.create([
    {
      booking: negotiating._id,
      sender: users.seasons._id,
      type: 'message',
      message: 'We have three more launches lined up this quarter. Any flexibility on the day rate?',
    },
    {
      booking: negotiating._id,
      sender: users.silverline._id,
      type: 'counter_offer',
      proposedPrice: 31500,
      message: 'Can do ₹31,500 for the full day if you cover the rigging crew’s dinner.',
    },
  ]);

  // Completed history. Spread across several months and weighted towards the
  // last few weeks so the revenue trend has shape and utilisation reads like a
  // real operating business rather than an empty dashboard.
  const past = [
    { r: orchidHall, seeker: users.kalpataru, d: -21, rating: 5, comment: 'Spotless hall and the pre-function area was perfect for registration. Staff were on it all evening.' },
    { r: orchidHall, seeker: users.spiceRoute, d: -8, rating: 5, comment: 'Second time booking this hall. Handover was quick and the AV points all worked.' },
    { r: orchidHall, seeker: users.coastal, d: -34, rating: 4, comment: 'Good space for the price. Parking got tight once guests arrived.' },
    { r: orchidHall, seeker: users.blueBay, d: -62, rating: 5, comment: 'Ran an overflow conference here at two days notice. They made it work.' },
    { r: shuttle, seeker: users.seasons, d: -14, rating: 4, comment: 'Coach arrived on time and the driver was patient with a delayed group. Interior could be cleaner.' },
    { r: shuttle, seeker: users.kalpataru, d: -40, rating: 5, comment: 'Two coaches, both punctual across a full day of guest transfers.' },
    { r: pa, seeker: users.blueBay, d: -30, rating: 5, comment: 'Technicians handled a difficult open-air setup without fuss. Sound was excellent across the lawn.' },
    { r: pa, seeker: users.grandOrchid, d: -55, rating: 4, comment: 'Great kit. Setup ran slightly past the agreed time but they stayed to finish.' },
    { r: kitchen, seeker: users.kalpataru, d: -45, rating: 4, comment: 'Good equipment and genuinely available overnight. Blast chiller was a lifesaver.' },
    { r: kitchen, seeker: users.spiceRoute, d: -19, rating: 5, comment: 'Cleanest rented kitchen we have used. Booked it again the same week.' },
    { r: chairs, seeker: users.grandOrchid, d: -10, rating: 5, comment: 'Chairs arrived covered and clean, exactly the count we ordered.', quantity: 150 },
    { r: chairs, seeker: users.coastal, d: -27, rating: 4, comment: 'Solid chairs, delivery was an hour late but they called ahead.', quantity: 80 },
    { r: chairs, seeker: users.blueBay, d: -70, rating: 5, comment: 'Hired 200 for a three-day festival. Zero damage disputes.', quantity: 200 },
    { r: ledWall, seeker: users.meridian, d: -48, rating: 5, comment: 'Bright enough for a daylit atrium. Crew rigged it in under two hours.' },
  ];

  for (const p of past) {
    const start = at(p.d, 10);
    const end = at(p.d, 22);
    const booking = await book(p.r, p.seeker, start, end, 'completed', {
      quantity: p.quantity ?? 1,
    });

    await Transaction.create({
      booking: booking._id,
      payer: booking.seeker,
      payee: booking.provider,
      amount: booking.agreedPrice || 0,
      status: 'simulated_paid',
      paidAt: end,
    });

    await Review.create({
      booking: booking._id,
      resource: p.r._id,
      reviewer: p.seeker._id,
      reviewee: p.r.owner,
      rating: p.rating,
      comment: p.comment,
    });
  }

  // Roll the seeded reviews up into the denormalized rating fields.
  for (const Model of [User, Resource]) {
    const field = Model === User ? 'reviewee' : 'resource';
    const agg = await Review.aggregate([
      { $group: { _id: `$${field}`, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    for (const row of agg) {
      if (!row._id) continue;
      await Model.findByIdAndUpdate(row._id, {
        ratingAvg: Math.round(row.avg * 10) / 10,
        ratingCount: row.count,
      });
    }
  }

  // Pending requests should show up in the provider's bell on first load.
  const pendings = await Booking.find({ status: { $in: ['pending', 'negotiating'] } })
    .populate('resource', 'title')
    .populate('seeker', 'businessName');

  for (const b of pendings) {
    await Notification.create({
      user: b.provider,
      type: 'booking_request',
      title: 'New resource request',
      message: `${b.seeker.businessName} requested ${b.requestedQuantity} × ${b.resource.title}`,
      relatedBooking: b._id,
    });
  }

  const bookingCount = await Booking.countDocuments();
  log(`  ✓ ${bookingCount} bookings, ${past.length} reviews`);
  log(`\n  Demo login — any of these emails, password: ${DEMO_PASSWORD}`);
  log(`    ${users.grandOrchid.email}   (hotel, has listings + incoming requests)`);
  log(`    ${users.seasons.email}  (banquet venue)\n`);

  return { users, resources };
}

// Allow `npm run seed` to run this file directly against MONGO_URI.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { connectDB, disconnectDB } = await import('../config/db.js');
  await connectDB();
  console.log('Seeding Indulge demo data…\n');
  await runSeed();
  await disconnectDB();
  process.exit(0);
}
