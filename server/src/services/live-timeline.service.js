import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Requirement from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Transaction from '../models/Transaction.js';
import Review from '../models/Review.js';
import Negotiation from '../models/Negotiation.js';
import LogisticsJob from '../models/LogisticsJob.js';
import RequestEvent from '../models/RequestEvent.js';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';

/**
 * The full story of one request, for the admin Live tracker.
 *
 * Everything is re-derived from stored records; nothing is padded to make the
 * story look complete:
 *
 *   - Proposals, offers, negotiation messages, payments, logistics steps,
 *     fulfilment/return timestamps and reviews already carry their own times.
 *   - Status decisions (accept, reject, confirm, cancel, counter-offer
 *     accepted, proposal revised…) come from RequestEvent, the minimal log
 *     written by the routes that make them.
 *   - For records created before that log existed, a decision is shown only
 *     when the code allows exactly one actor to have made it (only a provider
 *     can accept a request; only the seeker can award a proposal), and only
 *     with a time when another record fixes it (the Transaction created at
 *     acceptance, the Booking created at award). Otherwise the time reads as
 *     not recorded.
 *
 * Every event names its actor: 'seeker' (the business that asked), 'lister'
 * (a business that offered or provides), 'logistics' (a partner), or
 * 'platform' (system matching, refunds, workflow steps).
 *
 * A requirement has no separate publish step — it is open on the board from
 * creation — so Created and Published are one real event and one stage.
 */

const PAID = ['paid', 'simulated_paid'];
const AGREED = ['accepted', 'confirmed', 'completed'];
const BOOKED = ['confirmed', 'completed'];
const LOGISTICS_DONE = ['delivered', 'returned_to_provider', 'completed'];

const name = (u) => u?.businessName || null;
const idOf = (v) => String(v?._id || v || '');
const humanise = (s) => String(s || '').replace(/_/g, ' ');
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const earliest = (dates) => dates.filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;
const latest = (dates) => dates.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;

const place = (loc) => [loc?.address, loc?.city].filter(Boolean).join(', ') || null;
const facts = (rows) =>
  rows
    .filter((r) => r && r[1] != null && r[1] !== '' && !(Array.isArray(r[1]) && !r[1][0]))
    .map(([label, value, type = 'text']) => ({ label, value, type }));

const BOOKING_POPULATE = [
  { path: 'resource', select: 'title category location unit' },
  { path: 'provider', select: 'businessName' },
  { path: 'seeker', select: 'businessName' },
  { path: 'conditionChecks.recordedBy', select: 'businessName' },
];

/* ───────────────────────────────────────────────────────── resolve subject */

/** Resolve any feed item to the request whose lifecycle it belongs to. */
async function resolveSubject(kind, id) {
  if (!mongoose.isValidObjectId(id)) return null;

  if (kind === 'requirement') return { type: 'requirement', id };
  if (kind === 'proposal') {
    const p = await Proposal.findById(id).select('requirement').lean();
    return p && { type: 'requirement', id: p.requirement, focus: String(id) };
  }

  let bookingId = null;
  if (kind === 'booking') bookingId = id;
  if (kind === 'transaction') bookingId = (await Transaction.findById(id).select('booking').lean())?.booking;
  if (kind === 'review') bookingId = (await Review.findById(id).select('booking').lean())?.booking;
  if (!bookingId) return null;

  // A booking awarded from an RFQ is one chapter of that RFQ's story.
  const booking = await Booking.findById(bookingId).select('sourceRequirement').lean();
  if (!booking) return null;
  const parent =
    booking.sourceRequirement ||
    (await Requirement.findOne({ $or: [{ resultingBooking: bookingId }, { fulfilledBooking: bookingId }] })
      .select('_id')
      .lean())?._id;
  return parent
    ? { type: 'requirement', id: parent, focus: String(bookingId) }
    : { type: 'booking', id: bookingId };
}

/* ─────────────────────────────────────────────────────────────── load data */

async function load(subject) {
  let requirement = null;
  let proposals = [];
  let matches = [];
  let bookings = [];

  if (subject.type === 'requirement') {
    requirement = await Requirement.findById(subject.id)
      .populate('seeker', 'businessName')
      .populate('offers.provider', 'businessName')
      .populate('offers.resource', 'title')
      .lean();
    if (!requirement) return null;

    [proposals, matches, bookings] = await Promise.all([
      Proposal.find({ requirement: subject.id })
        .sort('createdAt')
        .populate('provider', 'businessName')
        .populate('resource', 'title')
        .lean(),
      CapacityRecoveryOpportunity.find({ requirement: subject.id })
        .sort('-matchScore')
        .populate('provider', 'businessName')
        .populate('resource', 'title')
        .lean(),
      Booking.find({
        $or: [
          { sourceRequirement: subject.id },
          { _id: { $in: [requirement.resultingBooking, requirement.fulfilledBooking].filter(Boolean) } },
        ],
      })
        .sort('createdAt')
        .populate(BOOKING_POPULATE)
        .lean(),
    ]);
  } else {
    const booking = await Booking.findById(subject.id).populate(BOOKING_POPULATE).lean();
    if (!booking) return null;
    bookings = [booking];
  }

  const ids = bookings.map((b) => b._id);
  const [transactions, negotiations, jobs, reviews, events] = await Promise.all([
    Transaction.find({ booking: { $in: ids } }).sort('createdAt').lean(),
    Negotiation.find({ booking: { $in: ids } }).sort('createdAt').populate('sender', 'businessName').lean(),
    LogisticsJob.find({ booking: { $in: ids } }).sort('createdAt').populate('logisticsPartner', 'businessName').lean(),
    Review.find({ booking: { $in: ids } }).sort('createdAt').populate('reviewer', 'businessName').lean(),
    RequestEvent.find({
      $or: [{ booking: { $in: ids } }, ...(requirement ? [{ requirement: requirement._id }] : [])],
    })
      .sort('createdAt')
      .populate('actor', 'businessName')
      .lean(),
  ]);

  return { requirement, proposals, matches, bookings, transactions, negotiations, jobs, reviews, events };
}

/* ───────────────────────────────────────────────────────────── the story */

/**
 * One chronological stream of who did what. Each entry:
 *   { id, at, role, actor, action, label, price, fromPrice, toPrice,
 *     detail, phase, tab, bookingId? }
 */
function buildEvents(d, subject) {
  const { requirement, proposals, matches, bookings, transactions, negotiations, jobs, reviews, events } = d;
  const out = [];
  const push = (e) => {
    const entry = { price: null, fromPrice: null, toPrice: null, detail: null, ...e };
    // A move that did not change the price is shown with just the price.
    if (entry.fromPrice != null && entry.fromPrice === entry.toPrice) entry.fromPrice = null;
    out.push(entry);
  };
  const logged = (action, pred = () => true) => events.filter((e) => e.action === action && pred(e));
  const seekerId = idOf(requirement?.seeker || bookings[0]?.seeker);
  const roleOf = (userId) => (idOf(userId) === seekerId ? 'seeker' : 'lister');
  const fromLog = (e) => ({ id: String(e._id), at: e.createdAt, actor: name(e.actor), role: e.role || roleOf(e.actor), action: e.action });

  /* request */
  if (requirement) {
    push({
      id: `req-${requirement._id}`,
      at: requirement.createdAt,
      role: 'seeker',
      actor: name(requirement.seeker),
      action: 'request_posted',
      label: 'Posted the request',
      price: requirement.maxBudget ?? requirement.maxPrice ?? null,
      detail: `${requirement.requiredQuantity || requirement.quantity || 1} ${requirement.unit || 'unit'}(s) · published to the requirement board`,
      phase: 'request',
      tab: 'rfqs',
    });
    for (const e of logged('requirement_updated')) {
      push({
        ...fromLog(e),
        label: e.fromPrice != null ? 'Changed the budget' : 'Edited the request',
        fromPrice: e.fromPrice ?? null,
        toPrice: e.toPrice ?? null,
        phase: 'request',
        tab: 'rfqs',
      });
    }
    if (matches.length) {
      const listers = new Set(matches.map((m) => idOf(m.provider))).size;
      push({
        id: `match-${requirement._id}`,
        at: earliest(matches.map((m) => m.createdAt)),
        role: 'platform',
        actor: 'Indulge matching',
        action: 'matched',
        label: `Matched ${listers} lister${listers === 1 ? '' : 's'} with spare capacity`,
        detail: [...new Set(matches.map((m) => name(m.provider)).filter(Boolean))].slice(0, 5).join(', '),
        phase: 'matching',
      });
    }

    /* proposals and offers — the listers' opening positions */
    for (const p of proposals) {
      const revisions = logged('proposal_revised', (e) => idOf(e.proposal) === String(p._id));
      push({
        id: `prop-${p._id}`,
        at: p.createdAt,
        role: 'lister',
        actor: name(p.provider),
        action: 'proposal_submitted',
        label: 'Submitted a proposal',
        // The opening price: before the first logged revision, if any.
        price: revisions[0]?.fromPrice ?? p.quotedPrice,
        detail: [p.resource?.title, p.notes].filter(Boolean).join(' · ') || null,
        phase: 'proposals',
        tab: 'rfqs',
        focus: String(p._id) === subject.focus,
      });
      for (const e of revisions) {
        push({ ...fromLog(e), label: 'Revised the proposal price', fromPrice: e.fromPrice ?? null, toPrice: e.toPrice ?? null, phase: 'negotiation', tab: 'rfqs' });
      }
      for (const e of logged('proposal_withdrawn', (x) => idOf(x.proposal) === String(p._id))) {
        push({ ...fromLog(e), label: 'Withdrew the proposal', price: e.fromPrice ?? null, phase: 'negotiation', tab: 'rfqs' });
      }
    }
    for (const o of requirement.offers || []) {
      push({
        id: `offer-${o._id}`,
        at: o.createdAt,
        role: 'lister',
        actor: name(o.provider),
        action: 'offer_made',
        label: 'Made an offer',
        price: o.price,
        detail: [o.resource?.title, o.message].filter(Boolean).join(' · ') || null,
        phase: 'proposals',
        tab: 'rfqs',
      });
      for (const e of logged('offer_withdrawn', (x) => x.note === String(o._id))) {
        push({ ...fromLog(e), label: 'Withdrew the offer', price: e.fromPrice ?? null, phase: 'negotiation', tab: 'rfqs' });
      }
    }

    // The award. Only the seeker can accept a proposal or offer, and doing so
    // creates the booking in the same request — so its creation is the time.
    const awards = [...logged('proposal_accepted'), ...logged('offer_accepted')];
    for (const e of awards) {
      const b = bookings.find((x) => idOf(x) === idOf(e.booking));
      push({
        ...fromLog(e),
        // The award creates the booking (then its payment) in one request, so
        // the booking's creation is the moment of the decision; the log line
        // is written a few milliseconds later.
        at: b?.createdAt || e.createdAt,
        label: `Accepted ${name(b?.provider) || 'the lister'}’s ${e.action === 'offer_accepted' ? 'offer' : 'proposal'}`,
        toPrice: e.toPrice ?? null,
        phase: 'agreement',
        tab: 'bookings',
        bookingId: idOf(e.booking),
      });
    }
    const awarded = new Set(awards.map((e) => idOf(e.booking)));
    for (const b of bookings.filter((x) => !awarded.has(String(x._id)))) {
      push({
        id: `award-${b._id}`,
        at: b.createdAt,
        role: 'seeker',
        actor: name(requirement.seeker),
        action: 'awarded',
        label: `Accepted ${name(b.provider) || 'the lister'}’s quote`,
        toPrice: b.agreedPrice ?? b.quotedPrice ?? null,
        phase: 'agreement',
        tab: 'bookings',
        bookingId: String(b._id),
      });
    }

    const ended = [...logged('requirement_closed'), ...logged('requirement_cancelled')][0];
    if (ended) {
      push({ ...fromLog(ended), label: ended.action === 'requirement_closed' ? 'Closed the request' : 'Cancelled the request', phase: 'agreement', tab: 'rfqs' });
    } else if (['closed', 'cancelled', 'expired'].includes(requirement.status) && !bookings.length) {
      const expired = requirement.status === 'expired';
      push({
        id: `end-${requirement._id}`,
        at: null,
        role: expired ? 'platform' : 'seeker',
        actor: expired ? 'Indulge' : name(requirement.seeker),
        action: `requirement_${requirement.status}`,
        label: expired ? 'Request expired' : `${requirement.status === 'closed' ? 'Closed' : 'Cancelled'} the request`,
        phase: 'agreement',
        tab: 'rfqs',
      });
    }
  }

  for (const b of bookings) {
    const bid = String(b._id);
    const forB = (e) => idOf(e.booking) === bid;
    const txs = transactions.filter((t) => idOf(t.booking) === bid);
    const msgs = negotiations.filter((n) => idOf(n.booking) === bid);
    const created = logged('request_created', forB)[0];
    const lister = name(b.provider);

    if (!requirement) {
      // The price asked at creation: from the log, or from the booking itself
      // when no counter-offer has since overwritten it.
      const counterOffered = msgs.some((m) => m.type === 'counter_offer');
      push({
        id: `booking-${bid}`,
        at: b.createdAt,
        role: 'seeker',
        actor: name(b.seeker),
        action: 'request_created',
        label: `Requested ${b.requestedQuantity} × ${b.resource?.title || 'listing'}`,
        price: created?.toPrice ?? (counterOffered ? null : b.quotedPrice ?? null),
        detail: [lister && `from ${lister}`, b.notes].filter(Boolean).join(' · ') || null,
        phase: 'request',
        tab: 'bookings',
        bookingId: bid,
      });
    }

    /* negotiation — the stored message thread on this booking */
    let running = created?.toPrice ?? null;
    for (const m of msgs) {
      const priced = m.proposedPrice != null;
      push({
        id: String(m._id),
        at: m.createdAt,
        role: roleOf(m.sender),
        actor: name(m.sender),
        action: m.type,
        label: m.type === 'counter_offer' ? 'Sent a counter-offer' : m.type === 'quotation' ? 'Sent a quotation' : 'Sent a message',
        fromPrice: priced && running != null && running !== m.proposedPrice ? running : null,
        toPrice: priced ? m.proposedPrice : null,
        detail: [m.message, m.proposedStart && m.proposedEnd ? 'Proposed new dates' : null].filter(Boolean).join(' · ') || null,
        phase: 'negotiation',
        tab: 'negotiations',
        bookingId: bid,
      });
      if (priced) running = m.proposedPrice;
    }
    for (const e of logged('counter_offer_accepted', forB)) {
      push({ ...fromLog(e), label: 'Accepted the counter-offer', fromPrice: e.fromPrice ?? null, toPrice: e.toPrice ?? null, phase: 'negotiation', tab: 'negotiations', bookingId: bid });
    }

    /* agreement on a direct request */
    if (!requirement) {
      const accepted = logged('request_accepted', forB)[0];
      if (accepted) {
        push({
          ...fromLog(accepted),
          label: 'Accepted the request',
          fromPrice: accepted.fromPrice != null && accepted.fromPrice !== accepted.toPrice ? accepted.fromPrice : null,
          toPrice: accepted.toPrice ?? null,
          phase: 'agreement',
          tab: 'bookings',
          bookingId: bid,
        });
      } else if (AGREED.includes(b.status) || (b.status === 'cancelled' && txs.length)) {
        // Only the provider can accept a request, and acceptance creates its Transaction.
        push({ id: `accept-${bid}`, at: txs[0]?.createdAt || null, role: 'lister', actor: lister, action: 'request_accepted', label: 'Accepted the request', toPrice: b.agreedPrice ?? b.quotedPrice ?? null, phase: 'agreement', tab: 'bookings', bookingId: bid });
      }
      const rejected = logged('request_rejected', forB)[0];
      if (rejected) {
        push({ ...fromLog(rejected), label: 'Declined the request', detail: rejected.note || null, phase: 'agreement', tab: 'bookings', bookingId: bid });
      } else if (b.status === 'rejected') {
        // Only the provider can reject a request; when is not recorded.
        push({ id: `reject-${bid}`, at: null, role: 'lister', actor: lister, action: 'request_rejected', label: 'Declined the request', detail: b.rejectionReason || null, phase: 'agreement', tab: 'bookings', bookingId: bid });
      }
    }

    /* booking */
    for (const e of logged('booking_confirmed', forB)) {
      push({ ...fromLog(e), label: 'Confirmed the booking', toPrice: e.toPrice ?? null, phase: 'booking', tab: 'bookings', bookingId: bid });
    }
    const cancelled = logged('booking_cancelled', forB)[0];
    if (cancelled) {
      push({ ...fromLog(cancelled), label: 'Cancelled the booking', detail: cancelled.note || null, phase: 'booking', tab: 'bookings', bookingId: bid });
    } else if (b.status === 'cancelled') {
      // Either party can cancel, so for older records the actor is unknown.
      push({ id: `cancel-${bid}`, at: null, role: 'platform', actor: 'Actor not recorded', action: 'booking_cancelled', label: 'Booking cancelled', detail: b.cancellationReason || null, phase: 'booking', tab: 'bookings', bookingId: bid });
    }

    /* payment */
    for (const t of txs) {
      if (PAID.includes(t.status) || t.paidAt) {
        push({ id: `pay-${t._id}`, at: t.paidAt || null, role: 'seeker', actor: name(b.seeker), action: 'paid', label: `Paid ${lister || 'the lister'}`, price: t.amount, detail: `via ${humanise(t.paymentMethod)}`, phase: 'payment', tab: 'ledger', bookingId: bid });
      }
      if (t.status === 'refunded') {
        push({ id: `refund-${t._id}`, at: t.refundedAt || null, role: 'platform', actor: 'Indulge', action: 'refunded', label: 'Payment refunded', price: t.amount, detail: t.refundReason || null, phase: 'payment', tab: 'ledger', bookingId: bid });
      }
    }

    /* logistics */
    for (const j of jobs.filter((x) => idOf(x.booking) === bid)) {
      push({ id: `job-${j._id}`, at: j.createdAt, role: 'platform', actor: 'Indulge', action: 'logistics_raised', label: 'Logistics job raised', detail: humanise(j.status), phase: 'logistics', tab: 'logistics', bookingId: bid });
      (j.timeline || []).forEach((t, i) =>
        push({ id: `job-${j._id}-${i}`, at: t.timestamp, role: 'logistics', actor: name(j.logisticsPartner) || 'Logistics', action: t.status, label: capitalise(humanise(t.status)), detail: t.notes || null, phase: 'logistics', tab: 'logistics', bookingId: bid })
      );
    }

    /* fulfilment — dispatch is provider-only; a return is started by the seeker */
    const f = b.fulfillment || {};
    const r = b.return || {};
    [
      [f.packedAt, 'lister', 'Packed the order'],
      [f.loadingAt, 'lister', 'Loading for dispatch'],
      [f.outForDeliveryAt, 'lister', 'Out for delivery'],
      [f.deliveredAt, 'lister', 'Delivered'],
      [r.returnRequestedAt, 'seeker', 'Requested the return'],
      [r.returnPickupScheduledAt, null, 'Return pickup scheduled'],
      [r.returnInTransitAt, null, 'Return in transit'],
      [r.returnedAt, null, 'Returned to the lister'],
      [r.returnCompletedAt, null, 'Return completed'],
    ].forEach(([at, role, label], i) => {
      if (!at) return;
      push({
        id: `ful-${bid}-${i}`,
        at,
        role: role || 'platform',
        actor: role === 'lister' ? lister : role === 'seeker' ? name(b.seeker) : 'Return workflow',
        action: 'fulfilment',
        label,
        phase: 'fulfilment',
        tab: 'bookings',
        bookingId: bid,
      });
    });
    /* condition checks — stored on the booking with who recorded them */
    const CHECK_LABEL = { dispatch: 'before-delivery', delivery: 'after-delivery', return: 'return' };
    for (const c of b.conditionChecks || []) {
      const failed = (c.items || []).filter((i) => !i.ok).map((i) => i.label);
      push({
        id: `check-${bid}-${c.checkpoint}`,
        at: c.recordedAt,
        role: c.role === 'logistics' ? 'logistics' : c.role,
        actor: name(c.recordedBy),
        action: 'condition_checked',
        label: `Recorded the ${CHECK_LABEL[c.checkpoint] || c.checkpoint} condition check — ${humanise(c.overall)}`,
        detail: [
          c.countVerified != null ? `${c.countVerified} of ${b.requestedQuantity} counted` : null,
          failed.length ? `Failed: ${failed.join('; ')}` : null,
          c.notes,
        ].filter(Boolean).join(' · ') || null,
        phase: 'fulfilment',
        tab: 'bookings',
        bookingId: bid,
      });
    }
    for (const e of logged('booking_completed', forB)) {
      push({ ...fromLog(e), label: 'Marked the booking complete', phase: 'fulfilment', tab: 'bookings', bookingId: bid });
    }

    /* reviews */
    for (const v of reviews.filter((x) => idOf(x.booking) === bid)) {
      push({ id: `review-${v._id}`, at: v.createdAt, role: roleOf(v.reviewer), actor: name(v.reviewer), action: 'reviewed', label: `Left a ${v.rating}★ review`, detail: v.comment || null, phase: 'review', tab: 'reviews', bookingId: bid });
    }
  }

  // Chronological; decisions whose time is not recorded go last, which is
  // where the status that proves them places them in the story.
  return out.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return new Date(a.at) - new Date(b.at);
  });
}

/* ───────────────────────────────────────────────────── negotiation summary */

function buildNegotiation(d, events) {
  const { requirement, bookings, proposals } = d;
  const talk = events.filter((e) => e.phase === 'negotiation');
  const accepts = events.filter((e) => e.phase === 'agreement' && /accepted|awarded/.test(e.action));
  const agreed = bookings.filter((b) => AGREED.includes(b.status));
  const main = agreed[0] || bookings[0] || null;

  const seeker = name(requirement?.seeker) || name(main?.seeker);
  const listers = [
    ...new Set(
      [
        ...bookings.map((b) => name(b.provider)),
        ...talk.filter((e) => e.role === 'lister').map((e) => e.actor),
        ...proposals.map((p) => name(p.provider)),
        ...(requirement?.offers || []).map((o) => name(o.provider)),
      ].filter(Boolean)
    ),
  ];

  const stopped =
    (!agreed.length && bookings.some((b) => ['rejected', 'cancelled'].includes(b.status))) ||
    (requirement && ['cancelled', 'closed', 'expired'].includes(requirement.status) && !bookings.length);

  let status;
  let text;
  if (agreed.length || bookings.some((b) => b.status === 'cancelled' && accepts.some((e) => e.bookingId === String(b._id)))) {
    status = 'completed';
    text = talk.length ? 'Terms agreed after negotiation' : 'Accepted as quoted — no negotiation was needed';
  } else if (stopped) {
    status = 'cancelled';
    text = requirement && !bookings.length ? `Request ${requirement.status} without an agreement` : `Request ${bookings[0]?.status} before agreement`;
  } else if (bookings.some((b) => b.status === 'negotiating') || talk.length) {
    status = 'in_progress';
    const last = talk[talk.length - 1];
    text = last ? `Waiting on the ${last.role === 'seeker' ? 'lister' : 'seeker'} to respond` : 'Terms are being negotiated';
  } else {
    status = 'not_started';
    const quotes = requirement ? proposals.length + (requirement.offers || []).length : 0;
    text = requirement
      ? quotes
        ? `${quotes} quote${quotes === 1 ? '' : 's'} awaiting the seeker’s decision`
        : 'Waiting for listers to quote'
      : 'Awaiting the lister’s response';
  }

  // Final agreement: the winning side's opening price against the agreed one.
  let agreement = null;
  const winner = agreed[0];
  if (winner) {
    const opening = events.find(
      (e) =>
        e.price != null &&
        ((!requirement && e.action === 'request_created' && e.bookingId === String(winner._id)) ||
          (requirement && ['proposal_submitted', 'offer_made'].includes(e.action) && e.actor === name(winner.provider)))
    );
    const original = opening?.price ?? null;
    const final = winner.agreedPrice ?? winner.quotedPrice ?? null;
    const accepted = accepts.filter((e) => !e.bookingId || e.bookingId === String(winner._id)).pop();
    agreement = {
      seeker,
      lister: name(winner.provider),
      original,
      final,
      change: original != null && final != null ? final - original : null,
      acceptedAt: accepted?.at || null,
      acceptedBy: accepted?.role || null,
    };
  }

  return { status, text, seeker, listers, count: talk.length, agreement };
}

/* ───────────────────────────────────────────────────────── proposals list */

function buildProposals(d, events) {
  const { requirement, proposals, bookings } = d;
  if (!requirement) return [];
  const awarded = bookings.length > 0;
  const outcomeOf = (status) =>
    ({ accepted: 'selected', rejected: 'not_selected', declined: 'not_selected', withdrawn: 'withdrawn' }[status] ||
    (awarded ? 'not_selected' : 'awaiting'));

  return [
    ...proposals.map((p) => ({
      id: String(p._id),
      kind: 'Proposal',
      lister: name(p.provider),
      resource: p.resource?.title || null,
      price: p.quotedPrice,
      initialPrice: events.find((e) => e.id === `prop-${p._id}`)?.price ?? p.quotedPrice,
      revisions: events.filter((e) => e.action === 'proposal_revised' && e.actor === name(p.provider)).length,
      status: p.status,
      outcome: outcomeOf(p.status === 'submitted' ? 'submitted' : p.status),
      at: p.createdAt,
      notes: p.notes || null,
    })),
    ...(requirement.offers || []).map((o) => ({
      id: String(o._id),
      kind: 'Offer',
      lister: name(o.provider),
      resource: o.resource?.title || null,
      price: o.price,
      initialPrice: o.price,
      revisions: 0,
      status: o.status,
      outcome: outcomeOf(o.status === 'offered' ? 'submitted' : o.status),
      at: o.createdAt,
      notes: o.message || null,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
}

/* ─────────────────────────────────────────────────────────────── stages */

function buildStages(d, events, negotiation) {
  const { requirement, proposals, matches, bookings, transactions, jobs, reviews } = d;
  const count = (phase) => events.filter((e) => e.phase === phase).length;
  const firstAt = (phase) => earliest(events.filter((e) => e.phase === phase).map((e) => e.at));
  const agreed = bookings.filter((b) => AGREED.includes(b.status));
  const booked = bookings.filter((b) => BOOKED.includes(b.status));
  const txFor = (b) => transactions.filter((t) => idOf(t.booking) === String(b._id));
  const stages = [];

  if (requirement) {
    stages.push({ key: 'posted', phase: 'request', label: 'Created', sub: 'Published', done: true, at: requirement.createdAt });
    if (matches.length) {
      const n = new Set(matches.map((m) => idOf(m.provider))).size;
      stages.push({ key: 'matched', phase: 'matching', label: 'Matched', sub: `${n} lister${n === 1 ? '' : 's'}`, done: true, at: firstAt('matching') });
    }
    const quotes = proposals.length + (requirement.offers || []).length;
    stages.push({ key: 'proposals', phase: 'proposals', label: 'Proposals', sub: quotes ? `${quotes} received` : null, done: quotes > 0, at: firstAt('proposals'), currentText: 'Waiting for listers to quote' });
  } else {
    stages.push({ key: 'requested', phase: 'request', label: 'Requested', sub: name(bookings[0]?.provider), done: true, at: bookings[0]?.createdAt });
  }

  // Negotiation is its own stage, carrying the number of moves in it. When
  // the deal closed without any, it is "not needed" rather than done.
  stages.push({
    key: 'negotiation',
    phase: 'negotiation',
    label: 'Negotiation',
    sub: negotiation.count ? `${negotiation.count} event${negotiation.count === 1 ? '' : 's'}` : null,
    done: negotiation.status === 'completed' && negotiation.count > 0,
    skipped: negotiation.status === 'completed' && negotiation.count === 0,
    active: negotiation.status === 'in_progress',
    at: firstAt('negotiation'),
    currentText: negotiation.text,
  });

  stages.push({
    key: 'agreement',
    phase: 'agreement',
    label: 'Accepted',
    sub: agreed.length ? [...new Set(agreed.map((b) => name(b.provider)))].join(', ') : null,
    done: agreed.length > 0,
    at: latest(events.filter((e) => e.phase === 'agreement' && /accepted|awarded/.test(e.action)).map((e) => e.at)),
    currentText: negotiation.status === 'not_started' ? negotiation.text : requirement ? 'Waiting for the seeker to accept a quote' : 'Waiting for the lister to accept',
  });

  // An awarded proposal creates the booking already confirmed; a direct
  // request is confirmed by the seeker, which also settles its payment.
  const confirmedAt =
    latest(events.filter((e) => e.action === 'booking_confirmed').map((e) => e.at)) ||
    (requirement
      ? earliest(booked.map((b) => b.createdAt))
      : latest(booked.flatMap((b) => txFor(b).map((t) => t.paidAt))));
  stages.push({
    key: 'booking',
    phase: 'booking',
    label: 'Booking',
    sub: booked.length ? 'Confirmed' : null,
    done: agreed.length > 0 && agreed.every((b) => BOOKED.includes(b.status)),
    at: booked.length ? confirmedAt : null,
    currentText: 'Waiting for the seeker to confirm the booking',
  });

  const paid = agreed.flatMap(txFor).filter((t) => PAID.includes(t.status));
  stages.push({
    key: 'payment',
    phase: 'payment',
    label: 'Payment',
    sub: paid.length ? `₹${paid.reduce((s, t) => s + (t.amount || 0), 0).toLocaleString('en-IN')}` : null,
    done: agreed.length > 0 && agreed.every((b) => txFor(b).some((t) => PAID.includes(t.status))),
    at: latest(paid.map((t) => t.paidAt)),
    currentText: 'Awaiting payment',
  });

  if (jobs.length) {
    const last = jobs[jobs.length - 1];
    stages.push({
      key: 'logistics',
      phase: 'logistics',
      label: 'Logistics',
      sub: humanise(last.status),
      done: jobs.every((j) => LOGISTICS_DONE.includes(j.status)),
      at: jobs[0].createdAt,
      currentText: `Logistics: ${humanise(last.status)}`,
    });
  }

  const completed = bookings.filter((b) => b.status === 'completed');
  stages.push({
    key: 'fulfilment',
    phase: 'fulfilment',
    label: 'Fulfilled',
    sub: completed.length ? 'Completed' : null,
    done: agreed.length > 0 && agreed.every((b) => b.status === 'completed'),
    // Only a recorded completion, return or delivery time counts.
    at:
      latest(events.filter((e) => e.action === 'booking_completed').map((e) => e.at)) ||
      latest(completed.map((b) => b.return?.returnCompletedAt || b.return?.returnedAt || b.fulfillment?.deliveredAt)),
    currentText: 'Awaiting fulfilment',
  });

  if (reviews.length) {
    stages.push({ key: 'review', phase: 'review', label: 'Reviewed', sub: `${reviews.length} review${reviews.length === 1 ? '' : 's'}`, done: true, at: reviews[0].createdAt });
  }

  return stages.map((s) => ({ ...s, count: count(s.phase) }));
}

/** States: completed · current · upcoming · skipped · missing · stopped */
function finalise(stages, stop) {
  const reached = (s) => s.done || s.skipped;
  const lastReached = stages.map(reached).lastIndexOf(true);
  const clean = ({ done, skipped, active, currentText, ...s }) => s;

  if (stop) {
    const kept = stages.slice(0, lastReached + 1).filter(reached);
    return {
      stages: [
        ...kept.map((s) => ({ ...clean(s), state: s.skipped ? 'skipped' : 'completed' })),
        { key: 'stopped', phase: stop.phase, label: stop.label, sub: stop.sub || null, state: 'stopped', at: stop.at || null, count: 0 },
      ],
      current: { state: 'stopped', text: stop.text },
    };
  }

  // A gap before a later completed stage has no record rather than being "in
  // progress" (the integrity audit flags the same thing). Negotiation that is
  // actively under way is the current stage even before earlier gaps close.
  let currentIdx = stages.findIndex((s, i) => !reached(s) && i > lastReached);
  const activeIdx = stages.findIndex((s) => s.active);
  if (activeIdx !== -1 && activeIdx > lastReached) currentIdx = activeIdx;

  const out = stages.map((s, i) => ({
    ...clean(s),
    state: s.done ? 'completed' : s.skipped ? 'skipped' : i < lastReached ? 'missing' : i === currentIdx ? 'current' : 'upcoming',
  }));
  const current = stages[currentIdx];
  return {
    stages: out,
    current: current
      ? { state: 'current', stage: current.key, text: current.currentText || `${current.label} in progress` }
      : { state: 'done', text: 'Request completed' },
  };
}

/* ───────────────────────────────────────────────────────────────── entry */

/** The full story of a Live-feed item, or null when it has no request behind it. */
export async function getLiveTimeline(kind, id) {
  const subject = await resolveSubject(kind, id);
  if (!subject) return null;
  const d = await load(subject);
  if (!d) return null;

  const { requirement, bookings } = d;
  const events = buildEvents(d, subject);
  const negotiation = buildNegotiation(d, events);
  const proposals = buildProposals(d, events);
  const main = bookings.find((b) => AGREED.includes(b.status)) || bookings[0];

  // Where a request stopped, and who stopped it when that is recorded.
  let stop = null;
  const endEvent = (re) => [...events].reverse().find((e) => re.test(e.action));
  if (negotiation.status === 'cancelled') {
    const status = requirement && !bookings.length ? requirement.status : main?.status;
    const end = endEvent(/rejected|cancelled|closed|expired/);
    stop = {
      phase: 'agreement',
      label: { rejected: 'Declined', cancelled: 'Cancelled', closed: 'Closed', expired: 'Expired' }[status] || 'Stopped',
      sub: end && ['seeker', 'lister'].includes(end.role) ? `by ${end.role}` : null,
      at: end?.at || null,
      text: negotiation.text,
    };
  } else if (bookings.length && bookings.every((b) => b.status === 'cancelled')) {
    const end = endEvent(/booking_cancelled/);
    stop = {
      phase: 'booking',
      label: 'Cancelled',
      sub: end && ['seeker', 'lister'].includes(end.role) ? `by ${end.role}` : null,
      at: end?.at || null,
      text: 'Booking cancelled after agreement',
    };
  }

  const { stages, current } = finalise(buildStages(d, events, negotiation), stop);
  const base = requirement
    ? {
        type: 'RFQ',
        ref: shortRef(requirement._id),
        business: name(requirement.seeker),
        title: requirement.title,
        category: requirement.category,
        amount: requirement.maxBudget ?? requirement.maxPrice ?? null,
        amountLabel: 'Budget',
        status: requirement.status,
        description: requirement.description || null,
        createdAt: requirement.createdAt,
        facts: facts([
          ['Quantity', `${requirement.requiredQuantity || requirement.quantity || 1} ${requirement.unit || 'unit'}(s)`],
          ['When', [requirement.startDateTime, requirement.endDateTime], 'range'],
          ['Location', place(requirement.location)],
          ['Budget', requirement.maxBudget ?? requirement.maxPrice, 'money'],
          ['Urgency', requirement.urgency],
          ['Min capacity', requirement.minCapacity],
          ['Search radius', requirement.location?.radiusKm ?? requirement.radiusKm, 'km'],
        ]),
      }
    : {
        type: 'Request',
        ref: shortRef(main._id),
        business: name(main.seeker),
        title: main.resource?.title || 'Listing',
        category: main.resource?.category || null,
        amount: main.agreedPrice ?? main.quotedPrice ?? null,
        amountLabel: main.agreedPrice != null ? 'Agreed' : 'Quoted',
        status: main.status,
        description: main.notes || null,
        createdAt: main.createdAt,
        facts: facts([
          ['Lister', name(main.provider)],
          ['Quantity', `${main.requestedQuantity} ${main.resource?.unit || 'unit'}(s)`],
          ['When', [main.startDateTime, main.endDateTime], 'range'],
          ['Location', place(main.resource?.location)],
          ['Urgency', main.urgency],
          ['Logistics', humanise(main.logistics)],
          main.matchScore != null && ['Match score', `${Math.round(main.matchScore * 100)}%`],
        ]),
      };

  return {
    subject: { type: subject.type, id: String(requirement?._id || main._id) },
    summary: { ...base, lastActivityAt: latest(events.map((e) => e.at)) },
    stages,
    current,
    negotiation,
    proposals,
    events,
  };
}
