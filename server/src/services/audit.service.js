import Booking, { HARD_RESERVED_STATUSES } from '../models/Booking.js';
import Resource from '../models/Resource.js';
import User from '../models/User.js';
import Cart from '../models/Cart.js';
import Transaction from '../models/Transaction.js';
import Requirement from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Review from '../models/Review.js';
import { maxConcurrent, withinAvailabilityWindows } from './availability.service.js';

/**
 * Platform data-integrity audit.
 *
 * Re-derives the marketplace's own invariants from stored state instead of
 * trusting the routes that wrote it. The point is to catch a rule that was
 * violated at some earlier moment — by a bug, a manual DB edit, a partial
 * failure between two writes — because nothing else in the system looks
 * backwards.
 *
 * Every finding names the rule it breaks and links the affected record, so a
 * red row in the console is directly actionable rather than a vague warning.
 *
 * Severity: 'critical' = money or inventory is wrong and a customer can see it.
 *           'warning'  = inconsistent, degrades behaviour, not yet harmful.
 *           'info'     = worth knowing, usually a configuration gap.
 */

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

export async function runIntegrityAudit() {
  const checks = await Promise.all([
    auditMissingTransactions(),
    auditOversubscribedResources(),
    auditBookingsOutsideWindows(),
    auditOrphans(),
    auditRequirementConsistency(),
    auditUnmappableListings(),
    auditInvertedDateRanges(),
    auditStaleCartLines(),
    auditRatingDrift(),
    auditOverdueReturns(),
    auditBrokenFulfillment(),
  ]);

  checks.sort(
    (a, b) =>
      (b.count > 0) - (a.count > 0) ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.count - a.count
  );

  const failing = checks.filter((c) => c.count > 0);

  return {
    checkedAt: new Date(),
    checks,
    summary: {
      total: checks.length,
      clean: checks.length - failing.length,
      failing: failing.length,
      critical: failing.filter((c) => c.severity === 'critical').length,
      warning: failing.filter((c) => c.severity === 'warning').length,
      info: failing.filter((c) => c.severity === 'info').length,
      findings: failing.reduce((n, c) => n + c.count, 0),
    },
  };
}

/** Shape every check returns, so the client renders them uniformly. */
const result = (id, severity, label, rule, rows, { fix } = {}) => ({
  id,
  severity,
  label,
  rule,
  fix: fix || null,
  count: rows.length,
  // Cap the payload — the count is the signal, the rows are for drilling in.
  rows: rows.slice(0, 50),
  truncated: rows.length > 50,
});

/* ───────────────────────────────────────────────────────── money integrity */

/**
 * "A booking created either way carries a Transaction — this was a real bug
 * once." (CLAUDE.md). Both the forward checkout and the requirement-offer
 * accept path must produce one, so a gap means one path regressed.
 */
async function auditMissingTransactions() {
  const bookings = await Booking.find({
    status: { $in: ['accepted', 'confirmed', 'completed'] },
  })
    .select('status agreedPrice quotedPrice provider seeker resource createdAt')
    .populate('resource', 'title')
    .populate('provider', 'businessName')
    .populate('seeker', 'businessName')
    .lean();

  const withTx = new Set(
    (await Transaction.find({}).select('booking').lean()).map((t) => String(t.booking))
  );

  const rows = bookings
    .filter((b) => !withTx.has(String(b._id)))
    .map((b) => ({
      id: b._id,
      link: `/bookings/detail/${b._id}`,
      title: b.resource?.title || 'deleted listing',
      detail: `${b.status} · ${b.seeker?.businessName || '?'} → ${b.provider?.businessName || '?'}`,
      amount: b.agreedPrice ?? b.quotedPrice ?? 0,
      at: b.createdAt,
    }));

  return result(
    'missing_transaction',
    'critical',
    'Committed bookings without a transaction',
    'Every accepted, confirmed or completed booking must carry a Transaction, whichever path created it.',
    rows,
    { fix: 'Backfill a pending transaction from the booking’s agreed price.' }
  );
}

/* ─────────────────────────────────────────────────────── inventory integrity */

/**
 * The core availability rule, checked backwards.
 *
 * Peak concurrent hard-reserved quantity must never exceed totalQuantity. This
 * uses the same exported sweep line as the booking path — deliberately, because
 * a summing re-implementation would flag resources that are perfectly fine.
 */
async function auditOversubscribedResources() {
  const bookings = await Booking.find({ status: { $in: HARD_RESERVED_STATUSES } })
    .select('resource startDateTime endDateTime requestedQuantity')
    .lean();

  if (!bookings.length) return result('oversubscribed', 'critical', OVERSUB_LABEL, OVERSUB_RULE, []);

  const byResource = new Map();
  for (const b of bookings) {
    const key = String(b.resource);
    if (!byResource.has(key)) byResource.set(key, []);
    byResource.get(key).push(b);
  }

  const resources = await Resource.find({ _id: { $in: [...byResource.keys()] } })
    .select('title totalQuantity owner unit')
    .populate('owner', 'businessName')
    .lean();

  const rows = [];
  for (const r of resources) {
    const mine = byResource.get(String(r._id)) || [];
    const start = new Date(Math.min(...mine.map((b) => +new Date(b.startDateTime))));
    const end = new Date(Math.max(...mine.map((b) => +new Date(b.endDateTime))));
    const peak = maxConcurrent(mine, start, end);
    const total = r.totalQuantity ?? 1;

    if (peak > total) {
      rows.push({
        id: r._id,
        link: `/r/${r._id}`,
        title: r.title,
        detail: `${r.owner?.businessName || '?'} · peak ${peak} of ${total} ${r.unit || 'unit'}(s) reserved at once`,
        amount: null,
        at: start,
        extra: { peak, total, overBy: peak - total, bookings: mine.length },
      });
    }
  }

  return result('oversubscribed', 'critical', OVERSUB_LABEL, OVERSUB_RULE, rows, {
    fix: 'Cancel or re-date the excess bookings, or raise the listing’s total quantity.',
  });
}

const OVERSUB_LABEL = 'Oversubscribed listings';
const OVERSUB_RULE =
  'Peak concurrent accepted/confirmed quantity must never exceed a listing’s total quantity (sweep line, not a sum).';

/**
 * A booking sitting outside every window the provider declared. Windows are a
 * separate concept from other bookings — "when it is offered at all" — and the
 * booking path checks them, so a breach here means the windows were narrowed
 * after the fact.
 */
async function auditBookingsOutsideWindows() {
  const resources = await Resource.find({
    'availabilityWindows.0': { $exists: true },
  })
    .select('title availabilityWindows owner')
    .populate('owner', 'businessName')
    .lean();

  if (!resources.length)
    return result('outside_window', 'warning', WINDOW_LABEL, WINDOW_RULE, []);

  const bookings = await Booking.find({
    resource: { $in: resources.map((r) => r._id) },
    status: { $in: HARD_RESERVED_STATUSES },
  })
    .select('resource startDateTime endDateTime seeker')
    .populate('seeker', 'businessName')
    .lean();

  const byId = new Map(resources.map((r) => [String(r._id), r]));

  const rows = bookings
    .filter((b) => {
      const r = byId.get(String(b.resource));
      return r && !withinAvailabilityWindows(r, new Date(b.startDateTime), new Date(b.endDateTime));
    })
    .map((b) => {
      const r = byId.get(String(b.resource));
      return {
        id: b._id,
        link: `/bookings/detail/${b._id}`,
        title: r.title,
        detail: `held by ${b.seeker?.businessName || '?'} outside the provider’s declared windows`,
        amount: null,
        at: b.startDateTime,
      };
    });

  return result('outside_window', 'warning', WINDOW_LABEL, WINDOW_RULE, rows, {
    fix: 'Widen the listing’s availability windows or move the booking.',
  });
}

const WINDOW_LABEL = 'Bookings outside declared availability windows';
const WINDOW_RULE =
  'A reserved booking must sit entirely inside one of its listing’s availability windows, when any are declared.';

/* ───────────────────────────────────────────────────────── referential holes */

/** Records pointing at rows that no longer exist. Each one breaks a page. */
async function auditOrphans() {
  const [userIds, resourceIds, bookingIds, requirementIds] = await Promise.all([
    User.find({}).select('_id').lean(),
    Resource.find({}).select('_id').lean(),
    Booking.find({}).select('_id').lean(),
    Requirement.find({}).select('_id').lean(),
  ]);

  const users = new Set(userIds.map((u) => String(u._id)));
  const resources = new Set(resourceIds.map((r) => String(r._id)));
  const bookings = new Set(bookingIds.map((b) => String(b._id)));
  const requirements = new Set(requirementIds.map((r) => String(r._id)));

  const rows = [];
  const flag = (kind, id, detail, link) => rows.push({ id, link, title: kind, detail, at: null });

  const allBookings = await Booking.find({})
    .select('resource provider seeker createdAt')
    .lean();
  for (const b of allBookings) {
    if (!resources.has(String(b.resource)))
      flag('Booking', b._id, 'references a listing that no longer exists', `/bookings/detail/${b._id}`);
    else if (!users.has(String(b.provider)) || !users.has(String(b.seeker)))
      flag('Booking', b._id, 'references a business that no longer exists', `/bookings/detail/${b._id}`);
  }

  for (const t of await Transaction.find({}).select('booking').lean()) {
    if (!bookings.has(String(t.booking)))
      flag('Transaction', t._id, 'references a booking that no longer exists', null);
  }

  for (const p of await Proposal.find({}).select('requirement resource provider').lean()) {
    if (!requirements.has(String(p.requirement)))
      flag('Proposal', p._id, 'references a requirement that no longer exists', null);
    else if (!resources.has(String(p.resource)))
      flag('Proposal', p._id, 'offers a listing that no longer exists', `/requirements/${p.requirement}`);
  }

  for (const r of await Review.find({}).select('booking reviewee').lean()) {
    if (!bookings.has(String(r.booking)))
      flag('Review', r._id, 'references a booking that no longer exists', null);
  }

  return result(
    'orphans',
    'warning',
    'Orphaned references',
    'Every foreign key must resolve — an orphan renders as a broken or empty page.',
    rows,
    { fix: 'Delete the orphaned record, or restore what it pointed at.' }
  );
}

/* ───────────────────────────────────────────── reverse-marketplace integrity */

/**
 * Both marketplace directions must land in equivalent state. A fulfilled
 * requirement with no booking, or an accepted proposal whose requirement never
 * closed, means the accept path half-committed.
 */
async function auditRequirementConsistency() {
  const rows = [];

  const fulfilled = await Requirement.find({ status: 'fulfilled' })
    .select('title resultingBooking fulfilledBooking acceptedProposal seeker updatedAt')
    .lean();
  for (const r of fulfilled) {
    if (!r.resultingBooking && !r.fulfilledBooking) {
      rows.push({
        id: r._id,
        link: `/requirements/${r._id}`,
        title: r.title,
        detail: 'marked fulfilled but carries no resulting booking',
        at: r.updatedAt,
      });
    }
  }

  const accepted = await Proposal.find({ status: 'accepted' })
    .select('requirement provider updatedAt')
    .populate('provider', 'businessName')
    .lean();
  const byReq = new Map(
    (
      await Requirement.find({ _id: { $in: accepted.map((p) => p.requirement) } })
        .select('status title')
        .lean()
    ).map((r) => [String(r._id), r])
  );
  for (const p of accepted) {
    const req = byReq.get(String(p.requirement));
    if (req && req.status === 'open') {
      rows.push({
        id: p._id,
        link: `/requirements/${p.requirement}`,
        title: req.title,
        detail: `proposal from ${p.provider?.businessName || '?'} was accepted but the requirement is still open`,
        at: p.updatedAt,
      });
    }
  }

  const openPast = await Requirement.countDocuments({
    status: 'open',
    endDateTime: { $lt: new Date() },
  });
  if (openPast) {
    const stale = await Requirement.find({ status: 'open', endDateTime: { $lt: new Date() } })
      .select('title endDateTime')
      .lean();
    for (const r of stale) {
      rows.push({
        id: r._id,
        link: `/requirements/${r._id}`,
        title: r.title,
        detail: 'still open although its requested window has already passed',
        at: r.endDateTime,
      });
    }
  }

  return result(
    'requirement_state',
    'warning',
    'Requirement / proposal state mismatches',
    'Accepting a proposal must close the requirement and produce a booking; both marketplace directions land in equivalent state.',
    rows,
    { fix: 'Close the requirement, or re-run the accept so it produces its booking.' }
  );
}

/* ────────────────────────────────────────────────────── configuration gaps */

/**
 * $geoNear must be the first stage of the search aggregation, and it silently
 * omits documents with no coordinates — so a listing without them is invisible
 * in search while looking perfectly healthy on its own page.
 */
async function auditUnmappableListings() {
  const listings = await Resource.find({
    status: { $ne: 'archived' },
    $or: [
      { 'location.coordinates': { $exists: false } },
      { 'location.coordinates': { $size: 0 } },
      { 'location.coordinates': null },
    ],
  })
    .select('title owner status createdAt')
    .populate('owner', 'businessName')
    .lean();

  const rows = listings.map((r) => ({
    id: r._id,
    link: `/r/${r._id}`,
    title: r.title,
    detail: `${r.owner?.businessName || '?'} · no coordinates, so it never appears in search`,
    at: r.createdAt,
  }));

  return result(
    'unmappable',
    'warning',
    'Listings invisible to search',
    'Search begins with $geoNear, which drops documents without coordinates — such a listing is unreachable.',
    rows,
    { fix: 'Set the listing’s coordinates from its owner’s business location.' }
  );
}

/** end <= start should be impossible through the API. */
async function auditInvertedDateRanges() {
  const rows = [];

  const bookings = await Booking.find({ $expr: { $lte: ['$endDateTime', '$startDateTime'] } })
    .select('startDateTime endDateTime resource')
    .populate('resource', 'title')
    .lean();
  for (const b of bookings) {
    rows.push({
      id: b._id,
      link: `/bookings/detail/${b._id}`,
      title: b.resource?.title || 'Booking',
      detail: 'ends at or before it starts',
      at: b.startDateTime,
    });
  }

  const requirements = await Requirement.find({
    $expr: { $lte: ['$endDateTime', '$startDateTime'] },
  })
    .select('title startDateTime')
    .lean();
  for (const r of requirements) {
    rows.push({
      id: r._id,
      link: `/requirements/${r._id}`,
      title: r.title,
      detail: 'requested window ends at or before it starts',
      at: r.startDateTime,
    });
  }

  return result(
    'inverted_dates',
    'critical',
    'Impossible date ranges',
    'End must be strictly after start — the pricing and sweep-line maths both assume a positive duration.',
    rows,
    { fix: 'Correct the dates or cancel the record.' }
  );
}

/** Cart lines the seeker can never check out. */
async function auditStaleCartLines() {
  const carts = await Cart.find({ 'items.0': { $exists: true } })
    .populate('seeker', 'businessName')
    .lean();

  const live = new Set(
    (await Resource.find({ status: 'active' }).select('_id').lean()).map((r) => String(r._id))
  );

  const rows = [];
  for (const cart of carts) {
    for (const item of cart.items) {
      if (!live.has(String(item.resource))) {
        rows.push({
          id: item._id,
          link: null,
          title: cart.seeker?.businessName || 'Cart',
          detail: 'holds a line for a listing that is paused, archived or deleted',
          at: item.addedAt,
        });
      }
    }
  }

  return result(
    'stale_cart',
    'info',
    'Cart lines for unavailable listings',
    'A cart line whose listing is no longer active can never be checked out.',
    rows,
    { fix: 'Prune the line so checkout stops reporting it as unavailable.' }
  );
}

/**
 * ratingAvg / ratingCount are denormalised onto User and Resource. If they
 * drift from the Review collection, every card on the platform shows a number
 * that cannot be reproduced from the data.
 */
async function auditRatingDrift() {
  const rows = [];

  const [byUser, byResource] = await Promise.all([
    Review.aggregate([
      { $group: { _id: '$reviewee', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    Review.aggregate([
      { $match: { resource: { $ne: null } } },
      { $group: { _id: '$resource', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
  ]);

  const compare = async (Model, agg, kind, linkFor, nameField) => {
    const truth = new Map(agg.map((a) => [String(a._id), a]));
    const docs = await Model.find({
      $or: [{ ratingCount: { $gt: 0 } }, { _id: { $in: agg.map((a) => a._id) } }],
    })
      .select(`${nameField} ratingAvg ratingCount`)
      .lean();

    for (const doc of docs) {
      const t = truth.get(String(doc._id));
      const expectedCount = t?.count || 0;
      const expectedAvg = t ? Math.round(t.avg * 10) / 10 : 0;
      const storedAvg = Math.round((doc.ratingAvg || 0) * 10) / 10;

      if (expectedCount !== (doc.ratingCount || 0) || Math.abs(expectedAvg - storedAvg) > 0.05) {
        rows.push({
          id: doc._id,
          link: linkFor(doc),
          title: doc[nameField],
          detail: `${kind} shows ${storedAvg} from ${doc.ratingCount || 0} review(s); the reviews say ${expectedAvg} from ${expectedCount}`,
          at: null,
        });
      }
    }
  };

  await compare(User, byUser, 'Business', (d) => `/provider/${d._id}`, 'businessName');
  await compare(Resource, byResource, 'Listing', (d) => `/r/${d._id}`, 'title');

  return result(
    'rating_drift',
    'warning',
    'Ratings out of sync with reviews',
    'Denormalised ratingAvg / ratingCount must equal the aggregate of the Review collection.',
    rows,
    { fix: 'Recompute the ratings from the reviews.' }
  );
}

/* ──────────────────────────────────────────────────────── logistics exposure */

/**
 * Goods delivered, the hire window closed, and nothing has come back.
 *
 * This is the platform's live exposure in physical stock, and it is invisible
 * on either party's own dashboard: the provider sees a confirmed booking, the
 * seeker sees a delivered one. Only a cross-tenant view makes it a number.
 */
async function auditOverdueReturns() {
  const bookings = await Booking.find({
    status: 'confirmed',
    'fulfillment.status': 'delivered',
    endDateTime: { $lt: new Date() },
    $or: [{ 'return.status': { $exists: false } }, { 'return.status': null }],
  })
    .select('endDateTime requestedQuantity agreedPrice quotedPrice rentalExpiryNotified resource seeker provider')
    .populate('resource', 'title unit')
    .populate('seeker', 'businessName')
    .populate('provider', 'businessName')
    .lean();

  const rows = bookings.map((b) => {
    const daysOver = Math.floor((Date.now() - new Date(b.endDateTime)) / (24 * 3600 * 1000));
    return {
      id: b._id,
      link: `/bookings/detail/${b._id}`,
      title: b.resource?.title || 'deleted listing',
      detail: `${b.requestedQuantity} ${b.resource?.unit || 'unit'}(s) with ${b.seeker?.businessName || '?'} · ${daysOver} day(s) past the hire window${
        b.rentalExpiryNotified ? '' : ' · seeker never notified'
      }`,
      amount: b.agreedPrice ?? b.quotedPrice ?? 0,
      at: b.endDateTime,
      extra: { daysOver, notified: Boolean(b.rentalExpiryNotified) },
    };
  });

  return result(
    'overdue_return',
    'warning',
    'Delivered stock past its return date',
    'A delivered booking whose hire window has closed should have a return underway.',
    rows,
    { fix: 'Fire the rental-expiry notice to every seeker who has not had one.' }
  );
}

/**
 * Fulfillment or return progress recorded against a booking that is no longer
 * confirmed. Both state machines are gated on `confirmed`, so this means the
 * booking moved underneath an in-flight delivery.
 */
async function auditBrokenFulfillment() {
  const bookings = await Booking.find({
    status: { $in: ['pending', 'negotiating', 'rejected', 'cancelled'] },
    $or: [
      { 'fulfillment.status': { $nin: [null] } },
      { 'return.status': { $nin: [null] } },
    ],
  })
    .select('status fulfillment.status return.status resource seeker updatedAt')
    .populate('resource', 'title')
    .populate('seeker', 'businessName')
    .lean();

  const rows = bookings
    .filter((b) => b.fulfillment?.status || b.return?.status)
    .map((b) => ({
      id: b._id,
      link: `/bookings/detail/${b._id}`,
      title: b.resource?.title || 'deleted listing',
      detail: `booking is ${b.status} but carries ${
        b.return?.status ? `return “${b.return.status}”` : `fulfillment “${b.fulfillment.status}”`
      }`,
      amount: null,
      at: b.updatedAt,
    }));

  return result(
    'broken_fulfillment',
    'critical',
    'Delivery progress on a non-confirmed booking',
    'Fulfillment and return state machines only run on confirmed bookings — physical goods may be out against a cancelled order.',
    rows,
    { fix: 'Needs a human: either restore the booking or recover the goods.' }
  );
}

/* ───────────────────────────────────────────────────────────────── repairs */

/**
 * Recompute the denormalised rating fields from the Review collection. Shared
 * by the audit's repair action and anything else that deletes a review — the
 * seed does the same roll-up, and both must agree.
 */
export async function recomputeRatings(ids = {}) {
  const targets = [
    { Model: User, field: 'reviewee', only: ids.users },
    { Model: Resource, field: 'resource', only: ids.resources },
  ];

  for (const { Model, field, only } of targets) {
    const match = only?.length ? [{ $match: { [field]: { $in: only } } }] : [];
    const agg = await Review.aggregate([
      ...match,
      { $group: { _id: `$${field}`, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const seen = new Set();
    for (const row of agg) {
      if (!row._id) continue;
      seen.add(String(row._id));
      await Model.findByIdAndUpdate(row._id, {
        ratingAvg: Math.round(row.avg * 10) / 10,
        ratingCount: row.count,
      });
    }

    // A target whose last review was just deleted has no aggregate row at all,
    // so it has to be zeroed explicitly rather than left at its old average.
    const stale = only?.length
      ? only.filter((id) => !seen.has(String(id)))
      : (await Model.find({ ratingCount: { $gt: 0 } }).select('_id').lean())
          .map((d) => d._id)
          .filter((id) => !seen.has(String(id)));

    for (const id of stale) {
      await Model.findByIdAndUpdate(id, { ratingAvg: 0, ratingCount: 0 });
    }
  }
}
