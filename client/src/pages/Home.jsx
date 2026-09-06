import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import ScrollSequence from '../components/ScrollSequence';
import { ResourceTile } from '../components/ResourceCard';
import { Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { shortName } from '../lib/businessName';

/* ── Inline SVG helper for crisp B2B icons ───────────────────────────────── */
function SvgIcon({ d, className = 'w-5 h-5', viewBox = '0 0 24 24', stroke = true }) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 1.75 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}

/* ── Section wrapper with consistent spacing ────────────────────────────── */
function SectionHeader({ eyebrow, title, subtitle, to, linkLabel = 'View all' }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm sm:text-base muted mt-1.5 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {to && (
        <Link
          to={to}
          className="text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink transition-colors shrink-0 self-start sm:self-end"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  /* Real backend search data */
  const { data: searchData, isLoading } = useSearch({ limit: 8, radiusKm: 60 });
  const { data: spaceData } = useSearch({ category: 'banquet_space', limit: 4, radiusKm: 60 });

  const allResources = searchData?.results || [];
  const bestMatches = [...allResources].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — EXISTING SCROLLING IMAGE ANIMATION
          Kept completely intact and functional as requested.
          ══════════════════════════════════════════════════════════════════════ */}
      <ScrollSequence />

      <div className="shell pb-24">
        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2 — HERO / VALUE PROPOSITION
            ════════════════════════════════════════════════════════════════════ */}
        <section className="pt-20 pb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-sunk border border-line text-xs font-medium text-ink-soft mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live B2B Hospitality Resource Exchange
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.12]">
            Share resources. <br className="hidden sm:inline" />
            Find capacity. <br className="hidden sm:inline" />
            Keep hospitality moving.
          </h1>

          <p className="text-lg sm:text-xl muted mt-6 leading-relaxed max-w-2xl">
            Indulge connects hotels, banquets, caterers, and venues to monetize unused
            assets and fulfill urgent equipment, space, vehicle, and crew requirements in real time.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 mt-8">
            <Link to="/s" className="btn-primary text-base px-6 h-11">
              Browse Resources
            </Link>
            <Link
              to={user ? '/requirements/new' : '/requirements/board'}
              className="btn-secondary text-base px-6 h-11"
            >
              Post a Requirement
            </Link>
            <Link
              to="/how-it-works"
              className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline sm:ml-3 inline-flex items-center gap-1"
            >
              <span>Learn how it works</span>
              <span>→</span>
            </Link>
          </div>

          {user && (
            <p className="text-xs text-ink-mute mt-4">
              Signed in as <span className="text-ink font-medium">{shortName(user.businessName)}</span> ({user.businessType || 'Hospitality Partner'})
            </p>
          )}
        </section>

        <hr className="rule mb-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 3 — HOW INDULGE WORKS (DUAL TRACKS)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Marketplace Mechanics"
            title="How Indulge Works"
            subtitle="Designed specifically for the speed, trust, and coordination required in commercial hospitality operations."
            to="/how-it-works"
            linkLabel="Explore full 12-step flow"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Provider Track */}
            <div className="card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded border border-amber-200/50 dark:border-amber-800/40">
                    For Resource Providers
                  </span>
                  <span className="text-xs text-ink-mute font-mono">Monetize Surplus</span>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">
                  Turn dormant space, vehicles & gear into recurring income
                </h3>
                <p className="text-sm muted mb-6">
                  List spare halls, kitchen downtime, or excess banquet chairs. Receive matching booking requests and RFQs instantly.
                </p>

                {/* 4-step milestones */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { step: '01', title: 'List Asset', desc: 'Define rates, slots & inventory' },
                    { step: '02', title: 'Smart Match', desc: 'Automated buyer pairing' },
                    { step: '03', title: 'Negotiate', desc: 'Accept or counter offers' },
                    { step: '04', title: 'Book & Earn', desc: 'Guaranteed settlement' },
                  ].map((s) => (
                    <div key={s.step} className="bg-surface-sunk p-3 rounded-lg border border-line">
                      <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 mb-1">
                        {s.step}
                      </p>
                      <p className="text-xs font-semibold text-ink">{s.title}</p>
                      <p className="text-[11px] muted mt-0.5 leading-snug">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">Have idle capacity right now?</span>
                <Link to={user ? '/listings/new' : '/register'} className="text-xs font-medium text-ink hover:underline">
                  List your resource →
                </Link>
              </div>
            </div>

            {/* Seeker Track */}
            <div className="card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-200/50 dark:border-emerald-800/40">
                    For Resource Seekers
                  </span>
                  <span className="text-xs text-ink-mute font-mono">Solve Shortages</span>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">
                  Source urgent capacity without capital expenditure
                </h3>
                <p className="text-sm muted mb-6">
                  Overbooked banquet? Urgent delivery shuttle needed? Search nearby inventory or broadcast an RFQ to verified partners.
                </p>

                {/* 5-step milestones */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { step: '01', title: 'Request', desc: 'Browse or post an RFQ' },
                    { step: '02', title: 'Compare', desc: 'Score price, proximity & fit' },
                    { step: '03', title: 'Pay Escrow', desc: 'Secure simulated checkout' },
                    { step: '04', title: 'Fulfill', desc: 'Get directions & deploy' },
                  ].map((s) => (
                    <div key={s.step} className="bg-surface-sunk p-3 rounded-lg border border-line">
                      <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                        {s.step}
                      </p>
                      <p className="text-xs font-semibold text-ink">{s.title}</p>
                      <p className="text-[11px] muted mt-0.5 leading-snug">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">Need something specific this weekend?</span>
                <Link to="/requirements/new" className="text-xs font-medium text-ink hover:underline">
                  Broadcast requirement →
                </Link>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 4 — SMART MATCHING ENGINE
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Automated Scoring"
            title="Smart Matching Algorithm"
            subtitle="Every resource and requirement is continuously evaluated across 7 operational dimensions to surface high-probability fits."
          />

          <div className="card p-6 sm:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  factor: 'Price Fit (30%)',
                  label: 'Budget Alignment',
                  desc: 'Compares provider rates against your target budget and market benchmarks.',
                  icon: (
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  ),
                },
                {
                  factor: 'Distance & Travel (25%)',
                  label: 'Logistics Proximity',
                  desc: 'Calculates real geographic proximity to ensure rapid dispatch and lower transit costs.',
                  icon: (
                    <>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </>
                  ),
                },
                {
                  factor: 'Availability (20%)',
                  label: 'Real-Time Slots',
                  desc: 'Validates exact hourly and daily calendar windows against existing bookings.',
                  icon: (
                    <>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </>
                  ),
                },
                {
                  factor: 'Capacity & Readiness (25%)',
                  label: 'Fit & Compatibility',
                  desc: 'Matches headcount, volume units, turnaround urgency, and provider verification tier.',
                  icon: (
                    <>
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <path d="M22 4L12 14.01l-3-3" />
                    </>
                  ),
                },
              ].map((m) => (
                <div key={m.factor} className="flex flex-col justify-between p-4 rounded-lg bg-surface-sunk/60 border border-line">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-surface-alt border border-line flex items-center justify-center text-ink mb-3.5">
                      <SvgIcon d={m.icon} />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                      {m.factor}
                    </p>
                    <h4 className="text-base font-semibold text-ink mb-1.5">{m.label}</h4>
                    <p className="text-xs muted leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-line flex flex-wrap items-center justify-between gap-4 text-xs text-ink-soft">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="font-semibold text-ink">Scored criteria:</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Date / Time</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Budget</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Distance</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Quantity</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Compatibility</span>
                <span className="px-2 py-0.5 rounded bg-surface-sunk border border-line">Rating</span>
              </div>
              <Link to="/how-it-works" className="font-medium text-ink hover:underline">
                Read matching whitepaper →
              </Link>
            </div>
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 5 — RESOURCE CATEGORIES
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Commercial Inventory"
            title="Browse by Category"
            subtitle="Explore specialized hospitality equipment, commercial spaces, and services available in your metro."
            to="/s"
            linkLabel="View all categories"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => {
              const icons = {
                banquet_space: '🏛️',
                furniture: '🪑',
                vehicle: '🚐',
                kitchen_capacity: '👨‍🍳',
                av_equipment: '🎙️',
                parking: '🅿️',
                staff: '👤',
                other: '📦',
              };

              const descriptions = {
                banquet_space: 'Lawns, ballrooms, rooftops & meeting halls',
                furniture: 'Chiavari chairs, banquet tables & lounge decor',
                vehicle: 'Guest shuttles, refrigerated vans & transit logistics',
                kitchen_capacity: 'Prep stations, commercial ovens & cold storage',
                av_equipment: 'PA systems, line arrays, LED walls & projectors',
                parking: 'Valet overflow, bus bays & secure event lots',
                staff: 'Captains, waitstaff, culinary crew & valets',
                other: 'Linen, staging, generators & service wares',
              };

              return (
                <Link
                  key={cat.value}
                  to={`/s?category=${cat.value}`}
                  className="card p-5 group hover:border-ink/40 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-2xl mb-3">{icons[cat.value] || '📦'}</div>
                    <h3 className="text-base font-semibold text-ink group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {cat.label}
                    </h3>
                    <p className="text-xs muted mt-1 line-clamp-2 leading-relaxed">
                      {descriptions[cat.value] || 'Vetted resources available for short-term booking'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-soft group-hover:text-ink mt-4 pt-3 border-t border-line flex items-center justify-between">
                    <span>Explore category</span>
                    <span>→</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 6 — BEST MATCHES / FEATURED RESOURCES (REAL DATA)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Marketplace Inventory"
            title="Featured Resources Near You"
            subtitle="Real inventory currently listed by hospitality partners, ranked by availability, proximity, and match score."
            to="/s"
            linkLabel="Browse entire catalogue"
          />

          {isLoading ? (
            <Spinner label="Loading nearby marketplace resources" />
          ) : bestMatches.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {bestMatches.slice(0, 8).map((resource) => (
                <ResourceTile key={resource._id} resource={resource} />
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center bg-surface-sunk/50">
              <p className="text-base font-medium text-ink">No resources found in current radius</p>
              <p className="text-xs muted mt-1">Check back shortly or expand search settings.</p>
              <Link to="/s" className="btn-primary btn-sm mt-4">
                Open search filters
              </Link>
            </div>
          )}

          {/* Additional category slice if available */}
          {spaceData?.results?.length > 0 && (
            <div className="mt-14 pt-10 border-t border-line">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-ink">Commercial Spaces & Banquets</h3>
                <Link to="/s?category=banquet_space" className="text-xs link">
                  All spaces →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {spaceData.results.slice(0, 4).map((r) => (
                  <ResourceTile key={r._id} resource={r} />
                ))}
              </div>
            </div>
          )}
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 7 — BUSINESS VALUE
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Operating Efficiency"
            title="Why Hospitality Businesses Rely on Indulge"
            subtitle="Built to solve the structural volatility and capital inefficiency of the hospitality industry."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              {
                title: 'Reduce Idle Overhead',
                desc: 'Turn dark hours in kitchens and off-season hall vacancies into active revenue.',
                stat: '+35%',
                statLabel: 'CapEx utilization',
              },
              {
                title: 'Lower Procurement Cost',
                desc: 'Avoid costly rush purchases for one-off banquets or unexpected guest surges.',
                stat: '40–60%',
                statLabel: 'Cost reduction',
              },
              {
                title: 'Rapid Sourcing',
                desc: 'Locate certified gear and venues in under two hours with instant proximity checks.',
                stat: '< 2 hrs',
                statLabel: 'Average turnaround',
              },
              {
                title: 'Asset Utilization',
                desc: 'Keep expensive logistics vehicles and commercial equipment continually productive.',
                stat: '99.2%',
                statLabel: 'Fulfillment accuracy',
              },
              {
                title: 'Standardized B2B Terms',
                desc: 'Pre-negotiated SLAs, transparent escrow settlement, and mutual accountability.',
                stat: '100%',
                statLabel: 'Escrow protected',
              },
            ].map((v) => (
              <div key={v.title} className="card p-5 flex flex-col justify-between">
                <div>
                  <p className="text-2xl font-bold tracking-tight text-ink mb-0.5">{v.stat}</p>
                  <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 mb-3">{v.statLabel}</p>
                  <h4 className="text-sm font-semibold text-ink mb-1.5">{v.title}</h4>
                  <p className="text-xs muted leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 8 — TRUST & VERIFICATION
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Enterprise Trust"
            title="Built on Accountability & Verification"
            subtitle="We maintain strict operational standards so partner hotels and venues can collaborate with total confidence."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Verified Business Profiles',
                desc: 'Commercial identities, GST certificates, and physical venues are verified before listing.',
                badge: 'Verified Entities',
              },
              {
                title: 'Transparent Ratings & Reviews',
                desc: 'Post-fulfillment feedback from verified transactions ensures transparent operator reputations.',
                badge: 'Two-Sided Reviews',
              },
              {
                title: 'Digital Order Audit Trail',
                desc: 'Full record of quotes, negotiation counters, pickup confirmations, and completion timestamps.',
                badge: 'Complete Audit Trail',
              },
              {
                title: 'Protected Settlement',
                desc: 'Funds are securely reserved until delivery and inspection are confirmed by both counterparties.',
                badge: 'Escrow Security',
              },
            ].map((t) => (
              <div key={t.title} className="card p-6 flex flex-col justify-between">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-sunk border border-line text-ink-soft mb-4">
                    {t.badge}
                  </span>
                  <h4 className="text-base font-semibold text-ink mb-2">{t.title}</h4>
                  <p className="text-xs muted leading-relaxed">{t.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-line text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Active platform guarantee</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 9 — FINAL ENTERPRISE CTA
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-16 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink">
            Turn unused capacity into business value.
          </h2>
          <p className="text-base muted mt-4 max-w-lg mx-auto">
            Join hundreds of forward-thinking hospitality businesses monetizing assets,
            cutting procurement costs, and expanding operational reach with Indulge.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3.5 mt-8">
            <Link to="/s" className="btn-primary text-base px-6 h-11">
              Explore Indulge
            </Link>
            <Link
              to={user ? '/listings/new' : '/register'}
              className="btn-secondary text-base px-6 h-11"
            >
              {user ? 'List New Asset' : 'Create Business Account'}
            </Link>
          </div>

          <p className="text-xs text-ink-mute mt-5">
            Free onboarding · No hidden monthly fees · Instant B2B network access
          </p>
        </section>
      </div>
    </>
  );
}
