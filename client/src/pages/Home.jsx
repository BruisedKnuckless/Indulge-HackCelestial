import { Link } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import ScrollSequence from '../components/ScrollSequence';
import { Price, Spinner } from '../components/ui';
import CategoryIcon from '../components/ui/CategoryIcon';
import { CATEGORIES, CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage, PLACEHOLDER } from '../lib/constants';
import { shortName } from '../lib/businessName';
import {
  Search,
  SlidersHorizontal,
  CreditCard,
  Truck,
  Building2,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Wallet,
  MapPin,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  Landmark,
  Coins,
  Clock,
  Layers,
  FileText,
  Star,
} from 'lucide-react';

/* ── Section header with consistent spacing & B2B typography ─────────────── */
function SectionHeader({ eyebrow, title, subtitle, to, linkLabel = 'View all' }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-1.5">
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
          className="text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink transition-colors shrink-0 self-start sm:self-end inline-flex items-center gap-1 group"
        >
          <span>{linkLabel}</span>
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}

/* ── Standardized Featured Resource Card (Real Backend Data) ─────────────── */
function FeaturedResourceCard({ resource: r, isAuthenticated }) {
  const match = isAuthenticated && r.matchScore != null ? Math.round(r.matchScore * 100) : null;
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';
  const location = r.owner?.location?.city || r.owner?.location?.address || 'Metro Area';

  return (
    <Link
      to={`/r/${r._id}`}
      className="card p-4 group flex flex-col justify-between hover:border-line-strong transition-all duration-200"
    >
      <div>
        {/* Stable aspect ratio container */}
        <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-surface-sunk mb-3.5">
          <img
            src={resourceImage(r)}
            alt={r.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
          {/* Category Tag overlay */}
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-alt/90 backdrop-blur-sm border border-line text-[11px] font-medium text-ink shadow-sm">
            <CategoryIcon category={r.category} size={12} />
            <span>{CATEGORY_LABELS[r.category] || r.category}</span>
          </span>

          {/* Match badge — ONLY when authenticated */}
          {match != null && (
            <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-bold tracking-tight shadow-sm">
              <Sparkles size={10} />
              {match}% Match
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-ink line-clamp-2 leading-snug group-hover:underline underline-offset-4 mb-1.5">
          {r.title}
        </h3>

        {/* Location & Availability */}
        <div className="flex items-center justify-between text-xs text-ink-mute mb-3">
          <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
            <MapPin size={12} className="shrink-0 text-ink-soft" />
            <span className="truncate">{location}</span>
          </span>
          <span className="text-[11px] text-ink-soft">
            {r.availableQuantity != null
              ? `${r.availableQuantity} avail`
              : `${r.totalQuantity || 1} in stock`}
          </span>
        </div>
      </div>

      {/* Footer / Price */}
      <div className="pt-2.5 border-t border-line flex items-baseline justify-between">
        <Price amount={r.pricing?.basePrice} unit={unit} size="sm" />
        <span className="text-xs font-medium text-ink-soft group-hover:text-ink inline-flex items-center gap-0.5">
          <span>View</span>
          <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();

  /* Real backend search data */
  const { data: searchData, isLoading } = useSearch({ limit: 8, radiusKm: 60 });
  const allResources = searchData?.results || [];
  const bestMatches = [...allResources].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — SCROLLSEQUENCE ANIMATION
          Kept completely intact and functional as requested.
          ══════════════════════════════════════════════════════════════════════ */}
      <ScrollSequence />

      <div className="shell pb-24">
        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2 — HERO / MAIN VALUE PROPOSITION
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
              className="text-sm font-medium text-ink-soft hover:text-ink hover:underline sm:ml-3 inline-flex items-center gap-1 group"
            >
              <span>Learn how it works</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
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
            SECTION 3 — HOW INDULGE WORKS (DUAL OPERATIONAL TRACKS)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Marketplace Operations"
            title="How Indulge Works"
            subtitle="Engineered for the speed, operational compliance, and trust required across commercial hospitality."
            to="/how-it-works"
            linkLabel="Explore full workflow"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* For Resource Seekers */}
            <div className="card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink bg-surface-sunk px-2.5 py-1 rounded border border-line">
                    For Resource Seekers
                  </span>
                  <span className="text-xs text-ink-mute font-mono">Solve Shortages</span>
                </div>
                
                <h3 className="text-lg font-semibold text-ink mb-2">
                  Source urgent capacity without capital expenditure
                </h3>
                <p className="text-sm muted mb-6">
                  Overbooked banquet? Urgent refrigerated transit needed? Search nearby inventory or broadcast an RFQ to verified local partners.
                </p>

                {/* 5 Connected Milestone Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  {[
                    { step: '01', title: 'Find', desc: 'Search catalog or broadcast RFQ', icon: Search },
                    { step: '02', title: 'Compare', desc: 'Score rates, proximity & fit', icon: SlidersHorizontal },
                    { step: '03', title: 'Request', desc: 'Propose dates & quantities', icon: MessageSquare },
                    { step: '04', title: 'Pay', desc: 'Simulated escrow checkout', icon: CreditCard },
                    { step: '05', title: 'Fulfill', desc: 'Inspect, deploy & return', icon: Truck },
                  ].map((s) => {
                    const IconComp = s.icon;
                    return (
                      <div key={s.step} className="bg-surface-sunk p-3 rounded-lg border border-line flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono font-semibold text-ink-mute">{s.step}</span>
                            <IconComp size={14} className="text-ink-soft" />
                          </div>
                          <p className="text-xs font-semibold text-ink">{s.title}</p>
                        </div>
                        <p className="text-[11px] muted mt-1 leading-snug">{s.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">Need capacity this week?</span>
                <Link to="/requirements/new" className="text-xs font-medium text-ink hover:underline inline-flex items-center gap-1">
                  <span>Broadcast requirement</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>

            {/* For Resource Providers */}
            <div className="card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink bg-surface-sunk px-2.5 py-1 rounded border border-line">
                    For Resource Providers
                  </span>
                  <span className="text-xs text-ink-mute font-mono">Monetize Surplus</span>
                </div>

                <h3 className="text-lg font-semibold text-ink mb-2">
                  Turn dormant space, vehicles & equipment into recurring income
                </h3>
                <p className="text-sm muted mb-6">
                  List spare ballrooms, kitchen downtime, or excess banquet inventory. Receive matching booking requests and commercial RFQs.
                </p>

                {/* 5 Connected Milestone Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  {[
                    { step: '01', title: 'List', desc: 'Set rates, slots & inventory', icon: Building2 },
                    { step: '02', title: 'Match', desc: 'Paired with buyer inquiries', icon: Sparkles },
                    { step: '03', title: 'Negotiate', desc: 'Accept or counter offers', icon: MessageSquare },
                    { step: '04', title: 'Confirm', desc: 'Settlement reserved in escrow', icon: CheckCircle2 },
                    { step: '05', title: 'Earn', desc: 'Payout upon completion', icon: Wallet },
                  ].map((s) => {
                    const IconComp = s.icon;
                    return (
                      <div key={s.step} className="bg-surface-sunk p-3 rounded-lg border border-line flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono font-semibold text-ink-mute">{s.step}</span>
                            <IconComp size={14} className="text-ink-soft" />
                          </div>
                          <p className="text-xs font-semibold text-ink">{s.title}</p>
                        </div>
                        <p className="text-[11px] muted mt-1 leading-snug">{s.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">Have idle capacity right now?</span>
                <Link to={user ? '/listings/new' : '/register'} className="text-xs font-medium text-ink hover:underline inline-flex items-center gap-1">
                  <span>List your resource</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 4 — RESOURCE CATEGORIES (LUCIDE ICONS, CLEAN B2B)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Commercial Inventory"
            title="Browse by Category"
            subtitle="Explore specialized hospitality equipment, commercial spaces, and logistics available in your metro area."
            to="/s"
            linkLabel="View all categories"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => {
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
                  className="card p-5 group hover:border-line-strong transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-surface-sunk border border-line flex items-center justify-center text-ink mb-3 group-hover:bg-surface-alt transition-colors">
                      <CategoryIcon category={cat.value} size={20} />
                    </div>
                    <h3 className="text-base font-semibold text-ink group-hover:text-ink transition-colors">
                      {cat.label}
                    </h3>
                    <p className="text-xs muted mt-1 line-clamp-2 leading-relaxed">
                      {descriptions[cat.value] || 'Vetted resources available for short-term booking'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-soft group-hover:text-ink mt-4 pt-3 border-t border-line flex items-center justify-between">
                    <span>Explore category</span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 5 — FEATURED RESOURCES (REAL DATA, STABLE HEIGHTS)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Marketplace Inventory"
            title="Featured Resources Near You"
            subtitle="Real inventory listed by verified hospitality partners, ranked by availability, proximity, and operational fit."
            to="/s"
            linkLabel="Browse entire catalogue"
          />

          {isLoading ? (
            <Spinner label="Loading nearby marketplace resources" />
          ) : bestMatches.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {bestMatches.slice(0, 8).map((resource) => (
                <FeaturedResourceCard
                  key={resource._id}
                  resource={resource}
                  isAuthenticated={Boolean(user)}
                />
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
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 6 — BUSINESS VALUE (QUALITATIVE, NO FAKE STATS)
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Operating Efficiency"
            title="Why Hospitality Businesses Rely on Indulge"
            subtitle="Engineered to solve the structural seasonality, idle overhead, and procurement frictions of commercial hospitality."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              {
                title: 'Reduce Idle Overhead',
                desc: 'Transform dark hours in prep kitchens and off-season hall vacancies into active commercial revenue.',
                icon: Coins,
              },
              {
                title: 'Lower Procurement Costs',
                desc: 'Avoid costly rush capital expenditures for one-off banquets or unexpected seasonal guest surges.',
                icon: TrendingUp,
              },
              {
                title: 'Rapid Capacity Sourcing',
                desc: 'Locate certified gear, spaces, and fleets within your metro area when bookings surge.',
                icon: Clock,
              },
              {
                title: 'Asset Utilization',
                desc: 'Keep expensive logistics vehicles, refrigeration units, and audio hardware continuously productive.',
                icon: Layers,
              },
              {
                title: 'Standardized B2B Terms',
                desc: 'Pre-negotiated operating standards, simulated escrow settlement, and mutual counterparty accountability.',
                icon: ShieldCheck,
              },
            ].map((v) => {
              const IconComp = v.icon;
              return (
                <div key={v.title} className="card p-5 flex flex-col justify-between">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-surface-sunk border border-line flex items-center justify-center text-ink mb-3.5">
                      <IconComp size={18} className="text-ink-soft" />
                    </div>
                    <h4 className="text-sm font-semibold text-ink mb-1.5">{v.title}</h4>
                    <p className="text-xs muted leading-relaxed">{v.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 7 — TRUST & ACCOUNTABILITY
            ════════════════════════════════════════════════════════════════════ */}
        <section className="py-12">
          <SectionHeader
            eyebrow="Enterprise Trust"
            title="Built on Accountability & Verification"
            subtitle="Transparent verification standards designed so partner hotels, banquets, and caterers collaborate with confidence."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Verified Business Profiles',
                desc: 'Commercial identities, venue addresses, and entity registrations are checked before listing.',
                badge: 'Verified Entities',
                icon: Building2,
              },
              {
                title: 'Transparent Ratings & Reviews',
                desc: 'Post-fulfillment ratings and condition reviews ensure transparent operator reputations.',
                badge: 'Two-Sided Reviews',
                icon: Star,
              },
              {
                title: 'Digital Order Audit Trail',
                desc: 'Full immutable record of quotes, negotiation counters, pickup confirmations, and completion timestamps.',
                badge: 'Order Audit Trail',
                icon: FileText,
              },
              {
                title: 'Protected Settlement',
                desc: 'Simulated payments are safely reserved in escrow until fulfillment and inspection are confirmed.',
                badge: 'Escrow Security',
                icon: ShieldCheck,
              },
            ].map((t) => {
              const IconComp = t.icon;
              return (
                <div key={t.title} className="card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-sunk border border-line text-ink-soft">
                        {t.badge}
                      </span>
                      <IconComp size={16} className="text-ink-soft" />
                    </div>
                    <h4 className="text-base font-semibold text-ink mb-2">{t.title}</h4>
                    <p className="text-xs muted leading-relaxed">{t.desc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-line text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span>Active platform standard</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="rule my-16" />

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 8 — FINAL CTA
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
              Explore Resources
            </Link>
            <Link
              to={user ? '/listings/new' : '/register'}
              className="btn-secondary text-base px-6 h-11"
            >
              {user ? 'List a Resource' : 'Start Listing'}
            </Link>
          </div>

          <p className="text-xs text-ink-mute mt-5">
            Free onboarding &middot; No hidden monthly fees &middot; Instant B2B network access
          </p>
        </section>
      </div>
    </>
  );
}
