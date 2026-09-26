import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Requirement from '../models/Requirement.js';
import Proposal from '../models/Proposal.js';
import Transaction from '../models/Transaction.js';
import Review from '../models/Review.js';
import Negotiation from '../models/Negotiation.js';
import LogisticsJob from '../models/LogisticsJob.js';
import CapacityRecoveryOpportunity from '../models/CapacityRecoveryOpportunity.js';

/**
 * Request lifecycle for one Live-feed activity, re-derived from stored records.
 *
 * Nothing here is inferred to make a timeline look complete: a stage is done
 * only when the record that proves it exists, and it carries a time only when
 * that record stores one. Stages with no evidence either way (matching,
 * negotiation, logistics) are left out rather than shown as skipped, because
 * not every request goes through them.
 *
 *   RFQ     Posted → [Matched] → Quotes → Accepted → [Negotiation] → Paid → [Logistics] → Completed
 *   Direct  Requested → [Negotiation] → Accepted → Paid → [Logistics] → Completed
 *
 * States: completed · current (the next step, still open) · upcoming ·
 * missing (skipped over — later stages are complete but this one has no
 * record) · stopped (cancelled, rejected, expired).
 *
 * A requirement has no separate publish step — it is on the board, status
 * 'open', from the moment it is created — so Created and Published are one
 * real event and are shown as one stage.
 */

const PAID = ['paid', 'simulated_paid'];
const ACCEPTED = ['accepted', 'confirmed', 'completed'];
const LOGISTICS_DONE = ['delivered', 'returned_to_provider', 'completed'];

const name = (u) => u?.businessName || null;
const earliest = (dates) => dates.filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;
const latest = (dates) => dates.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
const humanise = (s) => String(s || '').replace(/_/g, ' ');

/** [label, value, type] rows for the summary; empty values are dropped. */
const facts = (rows) =>
  rows
    .filter((r) => r && r[1] != null && r[1] !== '' && !(Array.isArray(r[1]) && !r[1][0]))
    .map(([label, value, type = 'text']) => ({ label, value, type }));

const place = (loc) => [loc?.address, loc?.city].filter(Boolean).join(', ') || null;

const BOOKING_POPULATE = [
  { path: 'resource', select: 'title category location unit' },
  { path: 'provider', select: 'businessName' },
  { path: 'seeker', select: 'businessName' },
];

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

  // A booking awarded from an RFQ is one step of that RFQ's lifecycle.
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

/** Everything downstream of acceptance, shared by both lifecycles. */
async function bookingEvidence(bookings) {
  const ids = bookings.map((b) => b._id);
  const [transactions, negotiations, jobs] = await Promise.all([
    Transaction.find({ booking: { $in: ids } }).sort('createdAt').lean(),
    Negotiation.find({ booking: { $in: ids } }).sort('createdAt').populate('sender', 'businessName').lean(),
    LogisticsJob.find({ booking: { $in: ids } })
      .sort('createdAt')
      .populate('logisticsPartner', 'businessName')
      .lean(),
  ]);
  return { transactions, negotiations, jobs };
}

/**
 * Accepted → [Negotiation] → Paid → [Logistics] → Completed, for one or more
 * bookings. `acceptedFallback` is the acceptance time when the booking was
 * created already accepted (RFQ awards), since it has no acceptedAt field.
 */
function downstreamStages(bookings, { transactions, negotiations, jobs }, { fromRfq }) {
  const stages = [];
  const accepted = bookings.filter((b) => ACCEPTED.includes(b.status));
  const txFor = (b) => transactions.filter((t) => String(t.booking) === String(b._id));

  // Acceptance creates the booking's Transaction in every path, so its
  // creation time is the acceptance time; an RFQ award creates the booking
  // itself at that moment.
  const acceptedAt = earliest(
    accepted.map((b) => txFor(b)[0]?.createdAt || (fromRfq ? b.createdAt : null))
  );

  const bookingItems = bookings.map((b) => ({
    id: String(b._id),
    title: b.resource?.title || 'Listing',
    meta: `${name(b.provider) || '?'} · ${b.requestedQuantity} unit(s)`,
    amount: b.agreedPrice ?? b.quotedPrice ?? null,
    status: b.status,
    at: b.createdAt,
  }));

  // Negotiation only exists for requests that were actually negotiated.
  const negotiated = negotiations.length > 0 || bookings.some((b) => b.status === 'negotiating');
  const negotiation = negotiated && {
    key: 'negotiation',
    label: 'Negotiation',
    done: accepted.length > 0 || bookings.every((b) => !['pending', 'negotiating'].includes(b.status)),
    at: negotiations[0]?.createdAt || null,
    currentText: 'Negotiation in progress',
    info: [
      ['Messages', String(negotiations.length)],
      negotiations.length && ['Last message', negotiations[negotiations.length - 1].createdAt, 'date'],
    ],
    items: negotiations.map((n) => ({
      id: String(n._id),
      title: `${name(n.sender) || '?'} · ${humanise(n.type)}`,
      meta: n.message ? n.message.slice(0, 140) : '',
      amount: n.proposedPrice ?? null,
      at: n.createdAt,
    })),
    tab: 'negotiations',
  };

  const acceptedStage = {
    key: 'accepted',
    label: fromRfq ? 'Booking' : 'Accepted',
    done: accepted.length > 0,
    at: acceptedAt,
    currentText: fromRfq ? 'Awaiting the business to accept a quote' : 'Awaiting the provider’s response',
    info: [
      ['Bookings', String(bookings.length)],
      accepted.length && ['Provider', [...new Set(accepted.map((b) => name(b.provider)))].join(', ')],
      accepted.length && ['Agreed', accepted.reduce((s, b) => s + (b.agreedPrice ?? b.quotedPrice ?? 0), 0), 'money'],
    ],
    items: bookingItems,
    tab: 'bookings',
  };

  // For a direct request the conversation happens before acceptance; for an
  // RFQ the price was set by the quote, so any messages come afterwards.
  if (negotiation && !fromRfq) stages.push(negotiation);
  stages.push(acceptedStage);
  if (negotiation && fromRfq) stages.push(negotiation);

  const acceptedTx = accepted.flatMap(txFor);
  const paidTx = acceptedTx.filter((t) => PAID.includes(t.status));
  stages.push({
    key: 'paid',
    label: 'Payment',
    done: accepted.length > 0 && accepted.every((b) => txFor(b).some((t) => PAID.includes(t.status))),
    at: latest(paidTx.map((t) => t.paidAt)) || null,
    currentText: 'Awaiting payment',
    info: [
      ['Settled', paidTx.reduce((s, t) => s + (t.amount || 0), 0), 'money'],
      ['Transactions', String(acceptedTx.length)],
    ],
    items: acceptedTx.map((t) => ({
      id: String(t._id),
      title: `Transaction · ${humanise(t.paymentMethod)}`,
      meta: t.paidAt ? 'paid' : '',
      amount: t.amount,
      status: t.status,
      at: t.paidAt || t.createdAt,
    })),
    tab: 'ledger',
  });

  // Logistics only appears when a job was actually raised.
  if (jobs.length) {
    const last = jobs[jobs.length - 1];
    stages.push({
      key: 'logistics',
      label: 'Logistics',
      done: jobs.every((j) => LOGISTICS_DONE.includes(j.status)),
      at: jobs[0].createdAt,
      currentText: `Logistics: ${humanise(last.status)}`,
      info: [
        ['Status', humanise(last.status)],
        ['Partner', name(last.logisticsPartner) || 'Unassigned'],
      ],
      items: jobs.flatMap((j) =>
        (j.timeline || []).map((t, i) => ({
          id: `${j._id}-${i}`,
          title: humanise(t.status),
          meta: [name(j.logisticsPartner), t.notes].filter(Boolean).join(' · '),
          at: t.timestamp,
        }))
      ),
      tab: 'logistics',
    });
  }

  const completed = bookings.filter((b) => b.status === 'completed');
  stages.push({
    key: 'completed',
    label: 'Completed',
    done: accepted.length > 0 && accepted.every((b) => b.status === 'completed'),
    // Only a recorded delivery or return time counts; a booking has no completedAt.
    at: latest(
      completed.map((b) => b.return?.returnCompletedAt || b.return?.returnedAt || b.fulfillment?.deliveredAt)
    ),
    currentText: 'Awaiting completion',
    info: [['Completed', `${completed.length} of ${accepted.length || bookings.length}`]],
    items: [],
  });

  return stages;
}

/** Turn evidence into completed / current / upcoming, or a stopped request. */
function finalise(stages, stopped) {
  // info rows are [label, value, type?] — type tells the client to format money or dates.
  const toInfo = (rows) =>
    (rows || [])
      .filter((r) => r && r[1] != null && r[1] !== '')
      .map(([label, value, type = 'text']) => ({ label, value, type }));
  const shaped = stages.map(({ done, currentText, ...s }) => ({ ...s, done, currentText, info: toInfo(s.info) }));

  if (stopped) {
    // A cancelled request never reaches its later stages; show what really
    // happened, then where it stopped.
    const lastDone = shaped.map((s) => s.done).lastIndexOf(true);
    return {
      stages: [
        ...shaped.slice(0, lastDone + 1).filter((s) => s.done).map((s) => ({ ...s, state: 'completed' })),
        { key: 'stopped', label: stopped.label, state: 'stopped', at: stopped.at, info: toInfo(stopped.info), items: [] },
      ],
      current: { state: 'stopped', text: stopped.text },
    };
  }

  // A gap before a later completed stage is not "in progress" — the record
  // that should prove it is missing (the integrity audit flags the same
  // thing), so it is shown as such rather than as the current step.
  const lastDone = shaped.map((s) => s.done).lastIndexOf(true);
  const currentIdx = shaped.findIndex((s, i) => !s.done && i > lastDone);
  const out = shaped.map((s, i) => ({
    ...s,
    state: s.done ? 'completed' : i < lastDone ? 'missing' : i === currentIdx ? 'current' : 'upcoming',
  }));
  const current = out[currentIdx];
  return {
    stages: out,
    current: current ? { state: 'current', stage: current.key, text: current.currentText } : { state: 'done', text: 'Request completed' },
  };
}

async function requirementTimeline(id, focus) {
  const requirement = await Requirement.findById(id)
    .populate('seeker', 'businessName')
    .populate('offers.provider', 'businessName')
    .populate('offers.resource', 'title')
    .lean();
  if (!requirement) return null;

  const [proposals, matches, bookings] = await Promise.all([
    Proposal.find({ requirement: id })
      .sort('createdAt')
      .populate('provider', 'businessName')
      .populate('resource', 'title')
      .lean(),
    CapacityRecoveryOpportunity.find({ requirement: id })
      .sort('-matchScore')
      .populate('provider', 'businessName')
      .populate('resource', 'title')
      .lean(),
    Booking.find({
      $or: [
        { sourceRequirement: id },
        { _id: { $in: [requirement.resultingBooking, requirement.fulfilledBooking].filter(Boolean) } },
      ],
    })
      .sort('createdAt')
      .populate(BOOKING_POPULATE)
      .lean(),
  ]);

  const quotes = [
    ...proposals.map((p) => ({
      id: String(p._id),
      title: name(p.provider) || '?',
      meta: `Proposal · ${p.resource?.title || ''}`,
      amount: p.quotedPrice,
      status: p.status,
      at: p.createdAt,
      focus: String(p._id) === focus,
    })),
    ...(requirement.offers || []).map((o) => ({
      id: String(o._id),
      title: name(o.provider) || '?',
      meta: `Offer · ${o.resource?.title || ''}`,
      amount: o.price,
      status: o.status,
      at: o.createdAt,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  const stages = [
    {
      key: 'posted',
      label: 'Posted',
      done: true,
      at: requirement.createdAt,
      info: [
        ['Business', name(requirement.seeker)],
        ['Published', 'Open on the requirement board from creation'],
      ],
      items: [],
      tab: 'rfqs',
    },
  ];

  // Providers the system matched to this RFQ (capacity recovery), when any.
  if (matches.length) {
    stages.push({
      key: 'matched',
      label: 'Matched',
      done: true,
      at: earliest(matches.map((m) => m.createdAt)),
      info: [['Providers', String(new Set(matches.map((m) => String(m.provider?._id))).size)]],
      items: matches.map((m) => ({
        id: String(m._id),
        title: name(m.provider) || '?',
        meta: m.resource?.title || '',
        status: m.status,
        score: m.matchScore,
        at: m.createdAt,
      })),
    });
  }

  stages.push({
    key: 'quotes',
    label: 'Quotes',
    done: quotes.length > 0,
    at: quotes[0]?.at || null,
    currentText: 'Awaiting quotes from providers',
    info: [
      ['Received', String(quotes.length)],
      quotes.length && ['Lowest', Math.min(...quotes.map((q) => q.amount ?? Infinity)), 'money'],
    ],
    items: quotes,
    tab: 'rfqs',
  });

  const evidence = await bookingEvidence(bookings);
  stages.push(...downstreamStages(bookings, evidence, { fromRfq: true }));

  // Cancelled, closed or expired without an award ends the lifecycle there.
  const ended = ['cancelled', 'closed', 'expired'].includes(requirement.status) && !bookings.length;
  const stopped = ended && {
    label: requirement.status === 'expired' ? 'Expired' : requirement.status === 'closed' ? 'Closed' : 'Cancelled',
    at: null,
    text: `RFQ ${requirement.status} without an award`,
  };

  return {
    subject: { type: 'requirement', id: String(requirement._id) },
    summary: {
      business: name(requirement.seeker),
      title: requirement.title,
      category: requirement.category,
      amount: requirement.maxBudget ?? requirement.maxPrice ?? null,
      status: requirement.status,
      providers: [...new Set(bookings.map((b) => name(b.provider)).filter(Boolean))],
      description: requirement.description || null,
      facts: facts([
        ['Quantity', `${requirement.requiredQuantity || requirement.quantity || 1} ${requirement.unit || 'unit'}(s)`],
        ['When', [requirement.startDateTime, requirement.endDateTime], 'range'],
        ['Location', place(requirement.location)],
        ['Budget', requirement.maxBudget ?? requirement.maxPrice, 'money'],
        ['Urgency', requirement.urgency],
        ['Min capacity', requirement.minCapacity],
        ['Search radius', requirement.location?.radiusKm ?? requirement.radiusKm, 'km'],
        ['Quotes', String(quotes.length)],
        bookings.length && ['Awarded to', [...new Set(bookings.map((b) => name(b.provider)))].join(', ')],
      ]),
    },
    ...finalise(stages, stopped),
  };
}

async function bookingTimeline(id) {
  const booking = await Booking.findById(id).populate(BOOKING_POPULATE).lean();
  if (!booking) return null;

  const evidence = await bookingEvidence([booking]);
  const stages = [
    {
      key: 'requested',
      label: 'Requested',
      done: true,
      at: booking.createdAt,
      info: [
        ['Business', name(booking.seeker)],
        ['Provider', name(booking.provider)],
        ['Quantity', String(booking.requestedQuantity)],
      ],
      items: [],
      tab: 'bookings',
    },
    ...downstreamStages([booking], evidence, { fromRfq: false }),
  ];

  const stopped = ['rejected', 'cancelled'].includes(booking.status) && {
    label: booking.status === 'rejected' ? 'Rejected' : 'Cancelled',
    at: null,
    text: `Request ${booking.status}`,
    info: [['Reason', booking.status === 'rejected' ? booking.rejectionReason : booking.cancellationReason]],
  };

  return {
    subject: { type: 'booking', id: String(booking._id) },
    summary: {
      business: name(booking.seeker),
      title: booking.resource?.title || 'Listing',
      category: booking.resource?.category || null,
      amount: booking.agreedPrice ?? booking.quotedPrice ?? null,
      status: booking.status,
      providers: [name(booking.provider)].filter(Boolean),
      description: booking.notes || null,
      facts: facts([
        ['Provider', name(booking.provider)],
        ['Quantity', `${booking.requestedQuantity} ${booking.resource?.unit || 'unit'}(s)`],
        ['When', [booking.startDateTime, booking.endDateTime], 'range'],
        ['Location', place(booking.resource?.location)],
        ['Quoted', booking.quotedPrice, 'money'],
        ['Agreed', booking.agreedPrice, 'money'],
        ['Urgency', booking.urgency],
        ['Logistics', humanise(booking.logistics)],
        booking.matchScore != null && ['Match score', `${Math.round(booking.matchScore * 100)}%`],
      ]),
    },
    ...finalise(stages, stopped),
  };
}

/** Timeline for a Live-feed item, or null when it has no request lifecycle. */
export async function getLiveTimeline(kind, id) {
  const subject = await resolveSubject(kind, id);
  if (!subject) return null;
  return subject.type === 'requirement'
    ? requirementTimeline(subject.id, subject.focus)
    : bookingTimeline(subject.id);
}
