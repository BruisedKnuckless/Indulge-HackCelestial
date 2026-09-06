import { Link } from 'react-router-dom';

/* ── Inline SVG icons ────────────────────────────────────────────────────── */
const Ic = ({ d, size = 20, fill = false }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  building:    'M3 21h18M3 7l9-4 9 4M4 11h16v10H4zM9 21v-4h6v4',
  badge:       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  package:     'M21 10V6a2 2 0 00-1-1.73L12 2 4 4.27A2 2 0 003 6v4M12 22l9-5V10M12 22l-9-5V10M12 12l9-5M12 12L3 7',
  search:      'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35',
  target:      'M12 2a10 10 0 100 20 10 10 0 000-20M12 6a6 6 0 100 12A6 6 0 0012 6m0 4a2 2 0 100 4 2 2 0 000-4',
  compare:     'M18 3H6a3 3 0 00-3 3v12a3 3 0 003 3h12a3 3 0 003-3V6a3 3 0 00-3-3zM9 12h6M9 8h6M9 16h4',
  mail:        'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 0l8 8 8-8',
  negotiate:   'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  payment:     'M1 4h22v16H1zM1 10h22',
  check:       'M20 6L9 17l-5-5',
  navigate:    'M3 11l19-9-9 19-2-8-8-2z',
  star:        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  chart:       'M18 20V10M12 20V4M6 20v-6',
  clock:       'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3',
  distance:    'M3 12h18M12 5l7 7-7 7',
  capacity:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  quality:     'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  budget:      'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
};

/* ── Platform flow steps ─────────────────────────────────────────────────── */
const FLOW_STEPS = [
  { n: 1,  icon: 'building',  title: 'Register your business',      sub: 'Create a business account with your name, type, and operating area.' },
  { n: 2,  icon: 'badge',     title: 'Set up your business profile', sub: 'Add your location, contact details, and GST info to build trust.' },
  { n: 3,  icon: 'package',   title: 'List a resource or post a requirement', sub: 'Providers list what they have. Seekers post what they need. Both sides benefit.' },
  { n: 4,  icon: 'search',    title: 'Search & discover',           sub: 'Browse resources nearby, filter by category, date, and budget.' },
  { n: 5,  icon: 'target',    title: 'Smart matching',              sub: 'Our engine scores every resource against your requirement across 8 dimensions.' },
  { n: 6,  icon: 'compare',   title: 'Compare providers',           sub: 'View match scores, ratings, completed orders, and reviews before committing.' },
  { n: 7,  icon: 'mail',      title: 'Request or submit an offer',  sub: 'Send a booking request from the marketplace, or respond to an open RFQ.' },
  { n: 8,  icon: 'negotiate', title: 'Negotiate terms',             sub: 'Message, counter-offer, and agree on pricing before anything is confirmed.' },
  { n: 9,  icon: 'payment',   title: 'Pay & confirm',               sub: 'Select your payment method. Booking is confirmed only after payment is received.' },
  { n: 10, icon: 'navigate',  title: 'Navigate to pickup/delivery', sub: 'Get directions directly to the resource location via Google Maps.' },
  { n: 11, icon: 'check',     title: 'Complete & review',           sub: 'Mark the booking complete, then leave a review to help the community.' },
  { n: 12, icon: 'chart',     title: 'Analytics & insights',        sub: 'Track earnings, bookings, and resource performance over time.' },
];

/* ── Matching criteria ───────────────────────────────────────────────────── */
const MATCH_CRITERIA = [
  { icon: 'package',  label: 'Requirement match',    desc: 'Category and resource type fit' },
  { icon: 'clock',    label: 'Date & time',           desc: 'Availability within your window' },
  { icon: 'budget',   label: 'Budget fit',            desc: 'Price against your max budget' },
  { icon: 'distance', label: 'Distance',              desc: 'Proximity of resource to you' },
  { icon: 'package',  label: 'Quantity',              desc: 'Enough stock for your request' },
  { icon: 'capacity', label: 'Capacity / Compatibility', desc: 'Fit to your event size' },
  { icon: 'quality',  label: 'Rating & quality',      desc: 'Provider reputation score' },
  { icon: 'badge',    label: 'Preferred providers',   desc: 'Trusted business bonus' },
];

/* ── Sub-components ──────────────────────────────────────────────────────── */

function FlowStep({ step, last }) {
  return (
    <div
      className="flex gap-5"
      style={{ animationDelay: `${step.n * 60}ms` }}
    >
      {/* Left: number + connector line */}
      <div className="flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface-sunk border border-line flex items-center justify-center text-sm font-semibold text-ink shrink-0">
          {step.n}
        </div>
        {!last && <div className="w-px flex-1 bg-line mt-2 mb-0" style={{ minHeight: '2.5rem' }} />}
      </div>

      {/* Right: content */}
      <div className={`pb-8 ${last ? '' : ''}`}>
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-ink-soft">
            <Ic d={ICONS[step.icon]} size={16} />
          </span>
          <h3 className="text-base font-semibold">{step.title}</h3>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">{step.sub}</p>
      </div>
    </div>
  );
}

function MatchCriterion({ criterion }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-line bg-surface hover:bg-surface-sunk transition-colors duration-150">
      <span className="text-ink-soft mt-0.5 shrink-0">
        <Ic d={ICONS[criterion.icon]} size={18} />
      </span>
      <div>
        <p className="text-sm font-semibold">{criterion.label}</p>
        <p className="text-xs text-ink-mute mt-0.5">{criterion.desc}</p>
      </div>
    </div>
  );
}

function SideCard({ title, icon, items, accent }) {
  return (
    <div className={`rounded-2xl border p-6 ${accent}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-ink-soft"><Ic d={ICONS[icon]} size={18} /></span>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="mt-0.5 shrink-0 text-success">
              <Ic d={ICONS.check} size={13} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   HowItWorks page  —  /how-it-works
   ════════════════════════════════════════════════════════════════════════════ */
export default function HowItWorks() {
  return (
    <div className="bg-surface min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b border-line bg-surface-alt">
        <div className="shell py-16 max-w-3xl">
          <p className="text-xs text-ink-soft mb-4">
            <Link to="/" className="link">
              Home
            </Link>
            {' › '}
            <span>How it works</span>
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-3">
            Platform guide
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight mb-4">
            How Indulge works
          </h1>
          <p className="text-lg text-ink-soft leading-relaxed mb-8 max-w-2xl">
            Indulge is a B2B resource exchange platform for the hospitality industry.
            Hotels, restaurants, caterers, and event organisers share what they have
            and access what they need — for the hours they actually need it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary">Get started free</Link>
            <Link to="/s" className="btn-secondary">Browse resources</Link>
          </div>
        </div>
      </div>

      <div className="shell py-16">

        {/* ── Platform flow ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-16 mb-20">
          {/* Sticky label column */}
          <div>
            <div className="lg:sticky lg:top-24">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-ink-mute mb-3">
                Platform flow
              </span>
              <h2 className="text-2xl font-semibold leading-snug mb-4">
                From discovery to completion
              </h2>
              <p className="text-sm text-ink-soft leading-relaxed">
                Every transaction on Indulge follows this lifecycle — whether you are
                listing resources or sourcing them.
              </p>
            </div>
          </div>

          {/* Flow steps */}
          <div className="pt-1">
            {FLOW_STEPS.map((step, i) => (
              <FlowStep key={step.n} step={step} last={i === FLOW_STEPS.length - 1} />
            ))}
          </div>
        </div>

        {/* ── Who is this for ───────────────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2 block">
              Two sides, one platform
            </span>
            <h2 className="text-2xl font-semibold">Who uses Indulge?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SideCard
              title="Resource provider"
              icon="package"
              accent="border-line bg-surface"
              items={[
                'List halls, kitchens, vehicles, staff, AV equipment, and more',
                'Set quantity, pricing, and availability windows',
                'Receive booking requests and RFQ offers in one inbox',
                'Accept, reject, or counter-offer with negotiation tools',
                'Get paid via UPI, card, or net banking',
                'Build a verified business profile with ratings',
                'Track performance on the analytics dashboard',
              ]}
            />
            <SideCard
              title="Resource seeker"
              icon="search"
              accent="border-line bg-surface"
              items={[
                'Post a requirement (RFQ) and receive competitive offers',
                'Search resources by category, date, and location',
                'See intelligent match scores and ranking explanations',
                'Compare providers by rating, price, and completed orders',
                'Negotiate directly before committing',
                'Pay securely and receive booking confirmation instantly',
                'Get directions to the pickup/delivery point',
                'Leave reviews to help the community',
              ]}
            />
          </div>
        </div>

        {/* ── Smart matching ────────────────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2 block">
              Intelligence
            </span>
            <h2 className="text-2xl font-semibold mb-3">Smart matching — how we rank results</h2>
            <p className="text-sm text-ink-soft max-w-xl mx-auto leading-relaxed">
              Every resource in your search is scored against 8 dimensions. The match score
              tells you exactly how well it fits your requirement — before you request.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MATCH_CRITERIA.map((c) => (
              <MatchCriterion key={c.label} criterion={c} />
            ))}
          </div>

          <p className="text-center text-xs text-ink-mute mt-5">
            Match scores update live as you change dates, quantity, and location.
            Mark providers as preferred to give trusted businesses a priority boost.
          </p>
        </div>

        {/* ── CTA strip ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-line bg-surface-sunk p-10 text-center">
          <h2 className="text-2xl font-semibold mb-3">Ready to get started?</h2>
          <p className="text-sm text-ink-soft mb-6 max-w-md mx-auto">
            Register your business in 60 seconds. No subscription — pay only when you use it.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary">Create a free account</Link>
            <Link to="/s" className="btn-secondary">Browse resources first</Link>
            <Link to="/requirements/board" className="btn-ghost">View open requirements</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
