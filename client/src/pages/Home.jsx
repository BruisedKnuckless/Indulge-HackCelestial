import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { useHomeAnimation } from '../hooks/useHomeAnimation';
import ScrollSequence from '../components/ScrollSequence';
import { Price, Spinner } from '../components/ui';
import CategoryIcon from '../components/ui/CategoryIcon';
import { getCategoryCardTheme } from '../lib/categoryTheme';
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
  Coins,
  Clock,
  Layers,
  FileText,
  Star,
  Users,
} from 'lucide-react';

/* ── Section header with consistent spacing & B2B typography ─────────────── */
function SectionHeader({ eyebrow, title, subtitle, to, linkLabel = 'View all' }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo" />
            <span>{eyebrow}</span>
          </div>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm sm:text-base muted mt-1.5 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {to && (
        <Link
          to={to}
          className="text-sm font-semibold text-indigo hover:text-indigo/80 underline underline-offset-4 decoration-indigo/30 hover:decoration-indigo transition-all shrink-0 self-start sm:self-end inline-flex items-center gap-1.5 group pb-1"
        >
          <span>{linkLabel}</span>
          <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      )}
    </div>
  );
}

/* ── Category visual configurations with hospitality accent palette ─────── */
const CATEGORY_CONFIG = {
  banquet_space: {
    iconBg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
    borderClass: 'hover:border-amber-500/40 hover:shadow-amber-500/5',
    tagClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
    delay: 'reveal-delay-100',
  },
  parking: {
    iconBg: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    borderClass: 'hover:border-blue-500/40 hover:shadow-blue-500/5',
    tagClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
    delay: 'reveal-delay-150',
  },
  vehicle: {
    iconBg: 'bg-teal/10 dark:bg-teal/20 text-teal',
    borderClass: 'hover:border-teal/40 hover:shadow-teal/5',
    tagClass: 'bg-teal/10 text-teal border-teal/25',
    delay: 'reveal-delay-200',
  },
  kitchen_capacity: {
    iconBg: 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
    borderClass: 'hover:border-orange-500/40 hover:shadow-orange-500/5',
    tagClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25',
    delay: 'reveal-delay-250',
  },
  furniture: {
    iconBg: 'bg-violet/10 dark:bg-violet/20 text-violet',
    borderClass: 'hover:border-violet/40 hover:shadow-violet/5',
    tagClass: 'bg-violet/10 text-violet border-violet/25',
    delay: 'reveal-delay-100',
  },
  av_equipment: {
    iconBg: 'bg-indigo/10 dark:bg-indigo/20 text-indigo',
    borderClass: 'hover:border-indigo/40 hover:shadow-indigo/5',
    tagClass: 'bg-indigo/10 text-indigo border-indigo/25',
    delay: 'reveal-delay-150',
  },
  staff: {
    iconBg: 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
    borderClass: 'hover:border-rose-500/40 hover:shadow-rose-500/5',
    tagClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
    delay: 'reveal-delay-200',
  },
  other: {
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    borderClass: 'hover:border-emerald-500/40 hover:shadow-emerald-500/5',
    tagClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    delay: 'reveal-delay-250',
  },
};

/* ── Standardized Featured Resource Card (Real Backend Data) ─────────────── */
function FeaturedResourceCard({ resource: r, isAuthenticated }) {
  const match = isAuthenticated && r.matchScore != null ? Math.round(r.matchScore * 100) : null;
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';
  const location = r.owner?.location?.city || r.owner?.location?.address || 'Metro Area';
  const cfg = CATEGORY_CONFIG[r.category] || CATEGORY_CONFIG.other;
  const theme = getCategoryCardTheme(r.category);

  return (
    <Link
      to={`/r/${r._id}`}
      className={`card card-interactive p-4 group flex flex-col justify-between ${theme.catClass}`}
    >
      <div>
        {/* Stable aspect ratio container with image hover zoom */}
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-sunk mb-3.5 shadow-inner">
          <img
            src={resourceImage(r)}
            alt={r.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-60 pointer-events-none" />

          {/* Category Tag overlay */}
          <span className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full backdrop-blur-md border text-[11px] font-semibold shadow-xs transition-all duration-200 ${theme.badge}`}>
            <CategoryIcon category={r.category} size={12} />
            <span>{CATEGORY_LABELS[r.category] || r.category}</span>
          </span>

          {/* Match badge — ONLY when authenticated */}
          {match != null && (
            <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600/95 backdrop-blur-sm text-white text-[10px] font-bold tracking-tight shadow-sm border border-emerald-400/30">
              <Sparkles size={10} />
              {match}% Match
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className={`text-sm font-semibold text-ink line-clamp-2 leading-snug transition-colors duration-200 mb-2 ${theme.titleHover}`}>
          {r.title}
        </h3>

        {/* Location & Availability */}
        <div className="flex items-center justify-between text-xs text-ink-mute mb-3">
          <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
            <MapPin size={12} className="shrink-0 text-ink-soft" />
            <span className="truncate">{location}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-sunk px-2 py-0.5 rounded-md border border-line">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>
              {r.availableQuantity != null
                ? `${r.availableQuantity} avail`
                : `${r.totalQuantity || 1} in stock`}
            </span>
          </span>
        </div>
      </div>

      {/* Footer / Price */}
      <div className="pt-3 border-t border-line flex items-baseline justify-between">
        <div>
          <span className="text-[10px] text-ink-mute uppercase tracking-wider block font-medium">Rate</span>
          <Price amount={r.pricing?.basePrice} unit={unit} size="sm" />
        </div>
        <span className={`text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-200 ${theme.titleHover}`}>
          <span>View</span>
          <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-[3px]" />
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { enabled: animationEnabled } = useHomeAnimation();

  // The default route "/" when opening the application displays the Indulge intro / animation page.
  // The navbar "Home" button navigates to "/home", which displays the main integrated dashboard
  // directly without showing the intro / animation.
  // Optional query parameters ?static=true or ?view=dashboard also render the dashboard directly.
  const isDashboardRoute =
    location.pathname === '/home' ||
    searchParams.get('static') === 'true' ||
    searchParams.get('view') === 'dashboard';

  const showAnimation = Boolean(!isDashboardRoute && animationEnabled);

  /* Real backend search data */
  const { data: searchData, isLoading } = useSearch({ limit: 8, radiusKm: 60 });
  const allResources = searchData?.results || [];
  const bestMatches = [...allResources].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  /* ── Lightweight scroll-reveal observer ────────────────────────────────── */
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [searchData, isLoading]);

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — SCROLLSEQUENCE ANIMATION
          Triggered exclusively by the Indulge navbar logo when enabled.
          ══════════════════════════════════════════════════════════════════════ */}
      {showAnimation && <ScrollSequence />}

      {/* Layered background decoration container */}
      <div className="relative overflow-hidden pb-24">
        {/* Subtle decorative ambient glow at top */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[500px] bg-gradient-to-b from-indigo/5 via-teal/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10"
        />

        <div className="shell">
          {/* ════════════════════════════════════════════════════════════════════
              SECTION 2 — HERO / MAIN VALUE PROPOSITION
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal pt-16 sm:pt-20 pb-16 max-w-4xl relative">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-surface-alt/90 dark:bg-surface-alt/60 backdrop-blur-md border border-line shadow-xs text-xs font-medium text-ink mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20" />
              <span className="text-ink-soft">Verified Marketplace</span>
              <span className="text-line-strong">•</span>
              <span className="text-ink font-semibold">Live B2B Hospitality Exchange</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink leading-[1.12]">
              Share resources. <br className="hidden sm:inline" />
              Find capacity. <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo via-indigo/90 to-teal">
                Keep hospitality moving.
              </span>
            </h1>

            <p className="text-lg sm:text-xl muted mt-6 leading-relaxed max-w-2xl">
              Indulge connects hotels, banquets, caterers, and venues to monetize unused
              assets and fulfill urgent equipment, space, vehicle, and crew requirements in real time.
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <Link
                to="/s"
                className="btn-primary text-base px-7 h-12 shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_22px_rgba(0,0,0,0.22)] hover:-translate-y-0.5 transition-all font-semibold"
              >
                Browse Resources
              </Link>
              <Link
                to={user ? '/requirements/new' : '/requirements/board'}
                className="btn-secondary text-base px-7 h-12 shadow-xs hover:-translate-y-0.5 transition-all font-medium"
              >
                Post a Requirement
              </Link>
              <Link
                to="/how-it-works"
                className="text-sm font-semibold text-ink-soft hover:text-indigo hover:underline sm:ml-2 inline-flex items-center gap-1.5 group transition-colors"
              >
                <span>Learn how it works</span>
                <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {user && (
              <p className="text-xs text-ink-mute mt-4">
                Signed in as <span className="text-ink font-semibold">{shortName(user.businessName)}</span> ({user.businessType || 'Hospitality Partner'})
              </p>
            )}

            {/* Quick 3-Pillar Capability Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-10 mt-8 border-t border-line/70">
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-alt border border-line/60 shadow-xs">
                <div className="w-9 h-9 rounded-lg bg-indigo/10 text-indigo flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Verified Operators</p>
                  <p className="text-[11px] text-ink-mute">Commercial entity checks</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-alt border border-line/60 shadow-xs">
                <div className="w-9 h-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Smart Matching</p>
                  <p className="text-[11px] text-ink-mute">Scored on proximity & rates</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-alt border border-line/60 shadow-xs">
                <div className="w-9 h-9 rounded-lg bg-amber-accent/10 text-amber-accent flex items-center justify-center shrink-0">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">Real-Time Access</p>
                  <p className="text-[11px] text-ink-mute">Instant booking & RFQ alerts</p>
                </div>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 3 — HOW INDULGE WORKS (DUAL OPERATIONAL TRACKS)
              Surface: #F8F7F4 (Alternative section surface)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal py-10 sm:py-14 px-6 sm:px-10 rounded-3xl bg-surface-section/90 dark:bg-surface-section border border-line/60 my-12 relative overflow-hidden shadow-xs">
            {/* Subtle ambient teal glow */}
            <div
              aria-hidden="true"
              className="absolute -top-16 -right-16 w-80 h-80 bg-teal/5 dark:bg-teal/10 rounded-full blur-3xl pointer-events-none -z-0"
            />

            <SectionHeader
              eyebrow="Marketplace Operations"
              title="How Indulge Works"
              subtitle="Engineered for the speed, operational compliance, and trust required across commercial hospitality."
              to="/how-it-works"
              linkLabel="Explore full workflow"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* For Resource Seekers */}
              <div className="card p-6 sm:p-8 flex flex-col justify-between border-line/80 hover:border-indigo/40 transition-colors shadow-sm">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="badge-indigo font-bold tracking-wide uppercase">
                      For Resource Seekers
                    </span>
                    <span className="text-xs text-ink-mute font-mono">Solve Shortages</span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-ink mb-2">
                    Source urgent capacity without capital expenditure
                  </h3>
                  <p className="text-sm muted mb-6 leading-relaxed">
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
                        <div
                          key={s.step}
                          className="bg-surface-sunk/60 p-3 rounded-xl border border-line flex flex-col justify-between hover:border-indigo/40 hover:shadow-xs transition-all"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono font-bold text-indigo">{s.step}</span>
                              <IconComp size={14} className="text-ink-soft" />
                            </div>
                            <p className="text-xs font-bold text-ink">{s.title}</p>
                          </div>
                          <p className="text-[11px] muted mt-1.5 leading-snug">{s.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-line flex items-center justify-between">
                  <span className="text-xs text-ink-soft">Need capacity this week?</span>
                  <Link
                    to="/requirements/new"
                    className="text-xs font-semibold text-indigo hover:text-indigo/80 inline-flex items-center gap-1 group"
                  >
                    <span>Broadcast requirement</span>
                    <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>

              {/* For Resource Providers */}
              <div className="card p-6 sm:p-8 flex flex-col justify-between border-line/80 hover:border-teal/40 transition-colors shadow-sm">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="badge-teal font-bold tracking-wide uppercase">
                      For Resource Providers
                    </span>
                    <span className="text-xs text-ink-mute font-mono">Monetize Surplus</span>
                  </div>

                  <h3 className="text-xl font-bold text-ink mb-2">
                    Turn dormant space, vehicles & equipment into recurring income
                  </h3>
                  <p className="text-sm muted mb-6 leading-relaxed">
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
                        <div
                          key={s.step}
                          className="bg-surface-sunk/60 p-3 rounded-xl border border-line flex flex-col justify-between hover:border-teal/40 hover:shadow-xs transition-all"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono font-bold text-teal">{s.step}</span>
                              <IconComp size={14} className="text-ink-soft" />
                            </div>
                            <p className="text-xs font-bold text-ink">{s.title}</p>
                          </div>
                          <p className="text-[11px] muted mt-1.5 leading-snug">{s.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-line flex items-center justify-between">
                  <span className="text-xs text-ink-soft">Have idle capacity right now?</span>
                  <Link
                    to={user ? '/listings/new' : '/register'}
                    className="text-xs font-semibold text-teal hover:text-teal/80 inline-flex items-center gap-1 group"
                  >
                    <span>List your resource</span>
                    <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 4 — RESOURCE CATEGORIES (LUCIDE ICONS, CLEAN B2B)
              Surface: #F1F2F8 (Soft cool / lavender tinted surface)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal py-10 sm:py-14 px-6 sm:px-10 rounded-3xl bg-surface-tinted/90 dark:bg-surface-tinted/50 border border-line/50 my-12 relative overflow-hidden shadow-xs">
            {/* Subtle ambient violet glow */}
            <div
              aria-hidden="true"
              className="absolute -bottom-16 -left-16 w-80 h-80 bg-violet/5 dark:bg-violet/10 rounded-full blur-3xl pointer-events-none -z-0"
            />

            <SectionHeader
              eyebrow="Commercial Inventory"
              title="Browse by Category"
              subtitle="Explore specialized hospitality equipment, commercial spaces, and logistics available in your metro area."
              to="/s"
              linkLabel="View all categories"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {CATEGORIES.map((cat) => {
                const cfg = CATEGORY_CONFIG[cat.value] || CATEGORY_CONFIG.other;
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
                    className={`card p-5 group flex flex-col justify-between transition-all duration-300 hover:-translate-y-[5px] hover:shadow-xl border ${cfg.borderClass} ${cfg.delay}`}
                  >
                    <div>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-xs ${cfg.iconBg}`}>
                        <CategoryIcon category={cat.value} size={22} />
                      </div>
                      <h3 className="text-base font-bold text-ink group-hover:text-ink transition-colors">
                        {cat.label}
                      </h3>
                      <p className="text-xs muted mt-1.5 line-clamp-2 leading-relaxed">
                        {descriptions[cat.value] || 'Vetted resources available for short-term booking'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-ink-soft group-hover:text-ink mt-5 pt-3.5 border-t border-line flex items-center justify-between transition-colors">
                      <span>Explore category</span>
                      <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 5 — FEATURED RESOURCES (DISCOVERY AREA ON WARM SURFACE)
              Surface: #FAF8F3 (Soft warm surface)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal my-12 rounded-3xl bg-surface-warm/95 dark:bg-surface-section border border-line/70 py-10 sm:py-14 px-6 sm:px-10 relative overflow-hidden shadow-xs">
            {/* Ambient amber/indigo glow in corner */}
            <div
              aria-hidden="true"
              className="absolute top-0 right-0 w-96 h-96 bg-amber-accent/5 dark:bg-amber-accent/10 rounded-full blur-3xl pointer-events-none -z-0"
            />

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
              <div className="card p-8 text-center bg-surface-alt/70">
                <p className="text-base font-semibold text-ink">No resources found in current radius</p>
                <p className="text-xs muted mt-1.5">Check back shortly or expand search settings.</p>
                <Link to="/s" className="btn-primary btn-sm mt-4 inline-flex items-center gap-1.5">
                  <SlidersHorizontal size={13} />
                  <span>Open search filters</span>
                </Link>
              </div>
            )}
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 6 — BUSINESS VALUE (QUALITATIVE, NO FAKE STATS)
              Surface: #F8F7F4 (Alternative section surface)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal py-10 sm:py-14 px-6 sm:px-10 rounded-3xl bg-surface-section/90 dark:bg-surface-section border border-line/60 my-12 relative overflow-hidden shadow-xs">
            {/* Subtle ambient indigo glow */}
            <div
              aria-hidden="true"
              className="absolute -bottom-16 -right-16 w-80 h-80 bg-indigo/5 dark:bg-indigo/10 rounded-full blur-3xl pointer-events-none -z-0"
            />

            <SectionHeader
              eyebrow="Operating Efficiency"
              title="Why Hospitality Businesses Rely on Indulge"
              subtitle="Engineered to solve structural seasonality, idle overhead, and procurement frictions across commercial hospitality."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                {
                  title: 'Reduce Idle Overhead',
                  desc: 'Transform dark hours in prep kitchens and off-season hall vacancies into active commercial revenue.',
                  icon: Coins,
                  boxClass: 'icon-box-amber',
                },
                {
                  title: 'Lower Procurement Costs',
                  desc: 'Avoid costly rush capital expenditures for one-off banquets or unexpected seasonal guest surges.',
                  icon: TrendingUp,
                  boxClass: 'icon-box-indigo',
                },
                {
                  title: 'Rapid Capacity Sourcing',
                  desc: 'Locate certified gear, spaces, and fleets within your metro area when bookings surge.',
                  icon: Clock,
                  boxClass: 'icon-box-teal',
                },
                {
                  title: 'Asset Utilization',
                  desc: 'Keep expensive logistics vehicles, refrigeration units, and audio hardware continuously productive.',
                  icon: Layers,
                  boxClass: 'icon-box-violet',
                },
                {
                  title: 'Standardized B2B Terms',
                  desc: 'Pre-negotiated operating standards, simulated escrow settlement, and mutual counterparty accountability.',
                  icon: ShieldCheck,
                  boxClass: 'icon-box-green',
                },
              ].map((v) => {
                const IconComp = v.icon;
                return (
                  <div
                    key={v.title}
                    className="card card-interactive p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div>
                      <div className={`w-10 h-10 mb-3.5 ${v.boxClass}`}>
                        <IconComp size={18} />
                      </div>
                      <h4 className="text-sm font-bold text-ink mb-1.5">{v.title}</h4>
                      <p className="text-xs muted leading-relaxed">{v.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 7 — TRUST & ACCOUNTABILITY
              Surface: #F1F2F8 (Soft cool tinted surface)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal py-10 sm:py-14 px-6 sm:px-10 rounded-3xl bg-surface-tinted/70 dark:bg-surface-tinted/40 border border-line/50 my-12 relative overflow-hidden shadow-xs">
            {/* Subtle ambient teal/green glow */}
            <div
              aria-hidden="true"
              className="absolute -top-16 -left-16 w-80 h-80 bg-teal/5 dark:bg-teal/10 rounded-full blur-3xl pointer-events-none -z-0"
            />

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
                  badgeClass: 'badge-indigo',
                  icon: Building2,
                },
                {
                  title: 'Transparent Ratings & Reviews',
                  desc: 'Post-fulfillment ratings and condition reviews ensure transparent operator reputations.',
                  badge: 'Two-Sided Reviews',
                  badgeClass: 'badge-amber',
                  icon: Star,
                },
                {
                  title: 'Digital Order Audit Trail',
                  desc: 'Full immutable record of quotes, negotiation counters, pickup confirmations, and completion timestamps.',
                  badge: 'Order Audit Trail',
                  badgeClass: 'badge-teal',
                  icon: FileText,
                },
                {
                  title: 'Protected Settlement',
                  desc: 'Simulated payments are safely reserved in escrow until fulfillment and inspection are confirmed.',
                  badge: 'Escrow Security',
                  badgeClass: 'badge-green',
                  icon: ShieldCheck,
                },
              ].map((t) => {
                const IconComp = t.icon;
                return (
                  <div
                    key={t.title}
                    className="card card-interactive p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className={t.badgeClass}>
                          {t.badge}
                        </span>
                        <IconComp size={18} className="text-ink-soft" />
                      </div>
                      <h4 className="text-base font-bold text-ink mb-2">{t.title}</h4>
                      <p className="text-xs muted leading-relaxed">{t.desc}</p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-line text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>Active platform standard</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════════════════
              SECTION 8 — FINAL CTA (DARK PREMIUM B2B SURFACE WITH GRADIENT GLOW)
              ════════════════════════════════════════════════════════════════════ */}
          <section className="reveal my-14 rounded-3xl bg-[#111318] dark:bg-[#0D0F14] text-white p-8 sm:p-14 relative overflow-hidden border border-white/10 shadow-2xl">
            {/* Ambient background glows */}
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-24 w-96 h-96 bg-indigo/25 rounded-full blur-3xl pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-24 -left-24 w-96 h-96 bg-teal/20 rounded-full blur-3xl pointer-events-none"
            />

            <div className="relative z-10 max-w-2xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold tracking-wider uppercase text-indigo-300 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                Turn Idle Capacity Into Opportunity
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
                Monetize surplus assets. <br className="hidden sm:inline" />
                Fulfill urgent capacity needs.
              </h2>

              <p className="text-base sm:text-lg text-white/75 mt-5 leading-relaxed max-w-xl mx-auto">
                Join hundreds of verified hotels, banquets, and caterers exchanging space,
                equipment, vehicles, and crew across your metro area.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
                <Link
                  to="/s"
                  className="btn text-base px-8 h-12 bg-white text-zinc-950 font-bold rounded-xl shadow-lg hover:bg-zinc-100 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                  Explore Marketplace
                </Link>
                <Link
                  to={user ? '/listings/new' : '/register'}
                  className="btn text-base px-8 h-12 bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:bg-white/20 hover:-translate-y-0.5 active:translate-y-0 backdrop-blur-sm transition-all"
                >
                  {user ? 'List a Resource' : 'Start Listing Free'}
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 mt-8 pt-6 border-t border-white/10 text-xs text-white/65">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Free onboarding
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  No monthly platform fees
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Verified B2B counterparties
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

