import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Inline SVG icons ────────────────────────────────────────────────────── */
const Ic = ({ d, size = 20, fill = false }) => (
  <svg
    width={size}
    height={size}
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
  building: 'M3 21h18M3 7l9-4 9 4M4 11h16v10H4zM9 21v-4h6v4',
  badge: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  package: 'M21 10V6a2 2 0 00-1-1.73L12 2 4 4.27A2 2 0 003 6v4M12 22l9-5V10M12 22l-9-5V10M12 12l9-5M12 12L3 7',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35',
  target: 'M12 2a10 10 0 100 20 10 10 0 000-20M12 6a6 6 0 100 12A6 6 0 0012 6m0 4a2 2 0 100 4 2 2 0 000-4',
  compare: 'M18 3H6a3 3 0 00-3 3v12a3 3 0 003 3h12a3 3 0 003-3V6a3 3 0 00-3-3zM9 12h6M9 8h6M9 16h4',
  mail: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 0l8 8 8-8',
  negotiate: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  payment: 'M1 4h22v16H1zM1 10h22',
  check: 'M20 6L9 17l-5-5',
  navigate: 'M3 11l19-9-9 19-2-8-8-2z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  clock: 'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3',
  distance: 'M3 12h18M12 5l7 7-7 7',
  capacity: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  quality: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  budget: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 18a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm12 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
};

/* ── Platform flow steps for Business ───────────────────────────────────── */
const FLOW_STEPS = [
  { n: 1, icon: 'building', title: 'Register your business', sub: 'Create a business account with your name, type, and operating area.' },
  { n: 2, icon: 'badge', title: 'Set up your business profile', sub: 'Add your location, contact details, and GST info to build trust.' },
  { n: 3, icon: 'package', title: 'List a resource or post a requirement', sub: 'Providers list what they have. Seekers post what they need. Both sides benefit.' },
  { n: 4, icon: 'search', title: 'Search & discover', sub: 'Browse resources nearby, filter by category, date, and budget.' },
  { n: 5, icon: 'target', title: 'Smart matching', sub: 'Our engine scores every resource against your requirement across 8 dimensions.' },
  { n: 6, icon: 'compare', title: 'Compare providers', sub: 'View match scores, ratings, completed orders, and reviews before committing.' },
  { n: 7, icon: 'mail', title: 'Request or submit an offer', sub: 'Send a booking request from the marketplace, or respond to an open RFQ.' },
  { n: 8, icon: 'negotiate', title: 'Negotiate terms', sub: 'Message, counter-offer, and agree on pricing before anything is confirmed.' },
  { n: 9, icon: 'payment', title: 'Pay & confirm', sub: 'Select your payment method. Booking is confirmed only after payment is received.' },
  { n: 10, icon: 'navigate', title: 'Navigate to pickup/delivery', sub: 'Get directions directly to the resource location via Google Maps.' },
  { n: 11, icon: 'check', title: 'Complete & review', sub: 'Mark the booking complete, then leave a review to help the community.' },
  { n: 12, icon: 'chart', title: 'Analytics & insights', sub: 'Track earnings, bookings, and resource performance over time.' },
];

/* ── Operational lifecycle steps for Logistics Partners ──────────────────── */
const LOGISTICS_STEPS = [
  { n: 1, icon: 'mail', title: 'Receive Assignment', sub: 'When a confirmed booking in your coverage area requires transportation, it enters your dispatch queue or open claim feed.' },
  { n: 2, icon: 'check', title: 'Review & Accept Job', sub: 'Check cargo dimensions, pickup/drop-off facilities, and loading window. Accept the assignment to commit your vehicle.' },
  { n: 3, icon: 'navigate', title: 'Arrive at Provider', sub: 'Dispatch your vehicle to the provider loading bay or kitchen warehouse and check in at the scheduled pickup window.' },
  { n: 4, icon: 'package', title: 'Confirm Pickup', sub: 'Inspect cargo packaging and quantities with provider staff, confirm pickup in the app, and load goods securely.' },
  { n: 5, icon: 'distance', title: 'Transport Resource', sub: 'Execute transit along the designated delivery route with live status tracking updated for provider and seeker.' },
  { n: 6, icon: 'building', title: 'Deliver to Seeker', sub: 'Arrive at the destination venue or banquet, unload goods at the receiving bay, and collect seeker delivery confirmation.' },
  { n: 7, icon: 'negotiate', title: 'Handle Return if Required', sub: 'For rented equipment, receive return notifications when the event concludes and dispatch pickup on schedule.' },
  { n: 8, icon: 'badge', title: 'Complete Job', sub: 'Deliver returned assets back to the owner, complete final inspection checks, and close the job for instant settlement.' },
];

/* ── Matching criteria ───────────────────────────────────────────────────── */
const MATCH_CRITERIA = [
  { icon: 'package', label: 'Requirement match', desc: 'Category and resource type fit' },
  { icon: 'clock', label: 'Date & time', desc: 'Availability within your window' },
  { icon: 'budget', label: 'Budget fit', desc: 'Price against your max budget' },
  { icon: 'distance', label: 'Distance', desc: 'Proximity of resource to you' },
  { icon: 'package', label: 'Quantity', desc: 'Enough stock for your request' },
  { icon: 'capacity', label: 'Capacity / Compatibility', desc: 'Fit to your event size' },
  { icon: 'quality', label: 'Rating & quality', desc: 'Provider reputation score' },
  { icon: 'badge', label: 'Preferred providers', desc: 'Trusted business bonus' },
];

/* ── Sub-components ──────────────────────────────────────────────────────── */

function FlowStep({ step, last }) {
  return (
    <div className="flex gap-5" style={{ animationDelay: `${step.n * 60}ms` }}>
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
            <Ic d={ICONS[step.icon] || ICONS.truck} size={16} />
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
        <span className="text-ink-soft"><Ic d={ICONS[icon] || ICONS.truck} size={18} /></span>
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
  const { user } = useAuth();
  const isPartner = user?.userType === 'logistics_partner';

  if (isPartner) {
    return (
      <div className="bg-surface min-h-screen">
        {/* ── Logistics Partner Hero ─────────────────────────────────── */}
        <div className="border-b border-line bg-surface-alt">
          <div className="shell py-16 max-w-3xl">
            <p className="text-xs text-ink-soft mb-4">
              <Link to="/logistics" className="link">
                Logistics Dispatch
              </Link>
              {' › '}
              <span>How Indulge Logistics Works</span>
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo/30 bg-indigo/10 text-indigo text-xs font-semibold mb-4">
              <Ic d={ICONS.truck} size={14} />
              Logistics Partner Network
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink mb-4">
              How Indulge Logistics Works
            </h1>
            <p className="text-base text-ink-soft leading-relaxed">
              Indulge connects verified transport providers with hotels, banquets, and caterers.
              You receive scheduled dispatch jobs, execute forward equipment deliveries, and coordinate safe asset returns.
            </p>
          </div>
        </div>

        {/* ── Logistics Operational Flow ─────────────────────────────── */}
        <div className="shell py-16 max-w-3xl">
          <div className="mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2 block">
              Step-by-step
            </span>
            <h2 className="text-2xl font-semibold mb-2">The complete dispatch & fulfillment cycle</h2>
            <p className="text-sm text-ink-soft">
              From receiving an assignment to final handover and settlement.
            </p>
          </div>

          <div className="relative">
            {LOGISTICS_STEPS.map((step, idx) => (
              <FlowStep
                key={step.n}
                step={step}
                last={idx === LOGISTICS_STEPS.length - 1}
              />
            ))}
          </div>

          {/* ── Logistics Pillars ───────────────────────────────────── */}
          <div className="mt-14 mb-16 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SideCard
              title="Forward Fulfillment"
              icon="truck"
              accent="border-line bg-surface-alt"
              items={[
                'Instant alerts for jobs assigned in your service area',
                'One-click acceptance and automatic routing',
                'Clear loading bay address and provider contact numbers',
                'Status progression from pickup through in-transit to delivery',
                'Live digital handover confirmation with destination contact',
              ]}
            />
            <SideCard
              title="Asset Returns & Safeguards"
              icon="negotiate"
              accent="border-line bg-surface"
              items={[
                'Scheduled return pickups when events conclude',
                'Coordinated return transit back to owner facility',
                'Post-event damage and inventory verification',
                'Security deposit release authorization on completion',
                'Direct dispatch earnings tracking per completed job',
              ]}
            />
          </div>

          {/* ── Partner CTA ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-surface-sunk p-10 text-center">
            <h2 className="text-2xl font-semibold mb-3">Ready to dispatch?</h2>
            <p className="text-sm text-ink-soft mb-6 max-w-md mx-auto">
              Open your dispatch center to manage assigned orders, claim available jobs, or update vehicle specifications.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/logistics" className="btn-primary">
                Open Logistics Dispatch
              </Link>
              <Link to="/account/profile" className="btn-secondary">
                View Fleet & Hub Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal Business How It Works View ──────────────────────────────
  return (
    <div className="bg-surface min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b border-line bg-surface-alt">
        <div className="shell py-16 max-w-3xl">
          <p className="text-xs text-ink-soft mb-4">
            <Link to="/home" className="link">
              Home
            </Link>
            {' › '}
            <span>How it works</span>
          </p>
          <span className="badge-indigo text-xs mb-3 inline-block">Platform guide</span>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink mb-4">
            How Indulge works
          </h1>
          <p className="text-base text-ink-soft leading-relaxed">
            Indulge connects hospitality businesses so they can share excess capacity and fulfill
            urgent resource needs. Whether you own resources or need them, the platform handles
            discovery, matching, negotiation, and payment.
          </p>
        </div>
      </div>

      {/* ── Main steps ──────────────────────────────────────────────── */}
      <div className="shell py-16 max-w-3xl">
        <div className="mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2 block">
            Step-by-step
          </span>
          <h2 className="text-2xl font-semibold mb-2">The complete transaction lifecycle</h2>
          <p className="text-sm text-ink-soft">
            From registration to review — here is how every booking moves through the platform.
          </p>
        </div>

        <div className="relative">
          {FLOW_STEPS.map((step, idx) => (
            <FlowStep
              key={step.n}
              step={step}
              last={idx === FLOW_STEPS.length - 1}
            />
          ))}
        </div>

        {/* ── Both sides of the market ──────────────────────────────── */}
        <div className="mt-14 mb-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2 block">
              Two sides, one account
            </span>
            <h2 className="text-2xl font-semibold mb-3">Every business can provide and seek</h2>
            <p className="text-sm text-ink-soft max-w-xl mx-auto leading-relaxed">
              You do not need separate accounts. A hotel that lists its banquet hall on weekdays can
              request extra catering equipment for a weekend wedding from the same login.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SideCard
              title="Resource provider"
              icon="package"
              accent="border-line bg-surface-alt"
              items={[
                'List spaces, equipment, vehicles, or staff during downtime',
                'Set custom daily rates and deposit requirements',
                'Receive direct requests or respond to open RFQs',
                'Accept, decline, or counter-offer on incoming requests',
                'Keep 100% of agreed price — platform takes no listing fee',
                'Mark bookings complete and get reviewed',
                'Track revenue and asset utilisation over time',
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
