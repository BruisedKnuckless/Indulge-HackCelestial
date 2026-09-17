import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Gauge, Radio, ShieldCheck, Users, Boxes, ShoppingBag, Receipt, FileText,
  MessageSquare, Star, Megaphone, Truck, Building2, IndianRupee, AlertTriangle,
  RefreshCw, Package,
} from 'lucide-react';
import { useAdminOverview, useAdminMeta, useAdminActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { errorMessage } from '../api/client';
import { Spinner, EmptyState } from '../components/ui';
import { inr, relative } from '../lib/format';
import { CATEGORY_LABELS, BUSINESS_TYPES, FACTOR_LABELS, FACTOR_WEIGHTS } from '../lib/constants';
import { Kpi, SectionHeader, Segmented, Select, compactInr } from '../components/admin/primitives';
import AdminHealth from '../components/admin/AdminHealth';
import AdminLive from '../components/admin/AdminLive';
import AdminBusiness from '../components/admin/AdminBusiness';
import {
  AdminBusinesses, AdminListings, AdminBookings, AdminRequirements,
  AdminLedger, AdminNegotiations, AdminReviews,
} from '../components/admin/AdminTables';

/**
 * The admin console — one screen over the whole marketplace.
 *
 * Every other page in this app is scoped to the signed-in business by
 * construction. This one is not, which is the entire point: an oversubscribed
 * listing, a booking with no transaction, or stock that never came back are all
 * invisible from inside a single tenant, because each party only sees their own
 * half of it.
 *
 * Admin identity is an env allowlist (ADMIN_EMAILS), not a field on User —
 * provider versus seeker is decided by context here and nothing is allowed to
 * add a role column.
 */

/* Chart palette matches pages/Analytics.jsx rather than introducing a second
   scheme; the design system is centralised on purpose. */
const CHART = {
  indigo: '#6366F1',
  teal: '#14B8A6',
  blue: '#3B82F6',
  amber: '#F59E0B',
  rose: '#F43F5E',
  green: '#22C55E',
  violet: '#8B5CF6',
};

const CATEGORY_COLORS = {
  av_equipment: CHART.indigo,
  banquet_space: CHART.amber,
  furniture: CHART.violet,
  vehicle: CHART.teal,
  kitchen_capacity: CHART.rose,
  parking: CHART.blue,
  staff: CHART.green,
  other: CHART.teal,
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'live', label: 'Live', icon: Radio },
  { key: 'health', label: 'Health', icon: ShieldCheck },
  { key: 'businesses', label: 'Businesses', icon: Building2 },
  { key: 'listings', label: 'Listings', icon: Boxes },
  { key: 'bookings', label: 'Bookings', icon: ShoppingBag },
  { key: 'rfqs', label: 'RFQs', icon: FileText },
  { key: 'ledger', label: 'Ledger', icon: Receipt },
  { key: 'negotiations', label: 'Negotiations', icon: MessageSquare },
  { key: 'reviews', label: 'Reviews', icon: Star },
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone },
];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [businessId, setBusinessId] = useState(null);

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <span className="icon-box icon-box-indigo w-9 h-9">
            <ShieldCheck size={18} />
          </span>
          <h1 className="h-page">Platform console</h1>
          <span className="badge-indigo">Eagle eye</span>
        </div>
        <p className="text-sm muted max-w-3xl">
          Every business, listing, booking, quote and rupee on Indulge, in one place — plus the
          integrity audit that re-derives the marketplace's own rules from stored data rather than
          trusting the routes that wrote it.
        </p>
      </header>

      {/* Tab bar. Horizontally scrollable so it survives a phone. */}
      <nav className="border-b border-line mb-7 -mx-6 px-6 sm:-mx-8 sm:px-8 overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-3.5 h-10 text-sm font-medium
                            -mb-px border-b-2 transition-colors whitespace-nowrap ${
                              active
                                ? 'border-indigo text-ink'
                                : 'border-transparent text-ink-soft hover:text-ink'
                            }`}
              >
                <Icon size={14} strokeWidth={1.9} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {tab === 'overview' && <Overview onOpenBusiness={setBusinessId} />}
      {tab === 'live' && <AdminLive />}
      {tab === 'health' && <AdminHealth />}
      {tab === 'businesses' && <AdminBusinesses onOpen={setBusinessId} />}
      {tab === 'listings' && <AdminListings />}
      {tab === 'bookings' && <AdminBookings />}
      {tab === 'rfqs' && <AdminRequirements />}
      {tab === 'ledger' && <AdminLedger />}
      {tab === 'negotiations' && <AdminNegotiations />}
      {tab === 'reviews' && <AdminReviews />}
      {tab === 'broadcast' && <Broadcast />}

      <AdminBusiness id={businessId} onClose={() => setBusinessId(null)} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ OVERVIEW */

function Overview({ onOpenBusiness }) {
  const { data, isLoading, isFetching, refetch } = useAdminOverview();
  const { dark } = useTheme();

  const GRID = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const AXIS = dark ? '#A1A1AA' : '#58585E';

  if (isLoading) return <Spinner label="Reading the whole platform" />;
  if (!data) return <EmptyState title="No platform data" message="The console could not load." />;

  const h = data.headline;
  const lg = data.logistics;

  const categories = data.categoryMix.map((c) => ({
    ...c,
    label: CATEGORY_LABELS[c.category] || c.category,
    fill: CATEGORY_COLORS[c.category] || CHART.indigo,
  }));

  const factorRows = Object.entries(data.matching.factors).map(([key, value]) => ({
    key,
    label: FACTOR_LABELS[key] || key,
    weight: FACTOR_WEIGHTS[key] || 0,
    value: Math.round(value * 100),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-mute">Generated {relative(data.generatedAt)}</p>
        <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Settled GMV"
            value={inr(h.gmv)}
            sub={`${inr(h.avgOrderValue)} average order`}
            icon={IndianRupee}
            tone="green"
          />
          <Kpi
            label="Awaiting payment"
            value={inr(h.pendingSettlement)}
            sub={h.refunded ? `${inr(h.refunded)} refunded` : 'Accepted but not yet paid'}
            icon={Receipt}
            tone="amber"
          />
          <Kpi
            label="Businesses"
            value={h.businesses}
            delta={null}
            sub={`${h.newBusinesses30} joined in 30 days${h.suspended ? ` · ${h.suspended} suspended` : ''}`}
            icon={Users}
            tone="indigo"
          />
          <Kpi
            label="Requests"
            value={h.bookings}
            delta={h.bookingGrowth30}
            sub={`${h.bookings7} in the last 7 days`}
            icon={ShoppingBag}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Kpi label="Active listings" value={h.activeListings} sub={`${h.listings} total`} icon={Boxes} tone="teal" />
          <Kpi label="Open RFQs" value={h.openRequirements} sub="Awaiting supplier quotes" icon={FileText} tone="indigo" />
          <Kpi
            label="Average rating"
            value={h.avgRating || '—'}
            sub={`${h.reviews} reviews platform-wide`}
            icon={Star}
            tone="amber"
          />
          <Kpi
            label="Live carts"
            value={h.activeCarts}
            sub={`${h.negotiations} negotiation messages`}
            icon={Package}
            tone="muted"
          />
        </div>
      </section>

      {/* ── Money over time + funnel ─────────────────────────────────────── */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="chart-card lg:col-span-2">
          <h3 className="h-card mb-0.5">Revenue and volume by month</h3>
          <p className="text-xs text-ink-mute mb-4">
            Committed bookings — accepted, confirmed and completed — by the month they start in.
          </p>
          <div style={{ height: 260 }}>
            {data.monthly.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthly} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.indigo} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={CHART.indigo} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" stroke={GRID} tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }} tickLine={false} />
                  <YAxis
                    stroke={GRID}
                    tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                    tickLine={false}
                    tickFormatter={compactInr}
                    width={56}
                  />
                  <Tooltip
                    content={<ChartTip formatters={{ revenue: inr, bookings: (v) => `${v} bookings` }} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="revenue"
                    stroke={CHART.indigo}
                    strokeWidth={2}
                    fill="url(#adminRevenue)"
                    dot={{ r: 2.5, strokeWidth: 0, fill: CHART.indigo }}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3 className="h-card mb-0.5">Conversion funnel</h3>
          <p className="text-xs text-ink-mute mb-4">Share of every request raised that reaches each stage.</p>
          <ul className="space-y-3.5">
            {data.funnel.map((stage, i) => (
              <li key={stage.stage}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium">{stage.stage}</span>
                  <span className="text-xs tabular-nums text-ink-mute">
                    {stage.count.toLocaleString('en-IN')}
                    <span className="ml-1.5 font-semibold text-ink">{stage.rate}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-sunk overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(stage.rate, 1)}%`,
                      backgroundColor: [CHART.indigo, CHART.blue, CHART.teal, CHART.green][i] || CHART.indigo,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-mute mt-4 pt-3 border-t border-line">
            Pending requests deliberately hold no inventory, so a wide top of the funnel does not
            block anyone else's booking.
          </p>
        </div>
      </section>

      {/* ── Category mix + logistics ─────────────────────────────────────── */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="chart-card lg:col-span-2">
          <h3 className="h-card mb-0.5">Where the money is made</h3>
          <p className="text-xs text-ink-mute mb-4">Committed revenue by resource category.</p>
          <div style={{ height: 250 }}>
            {!categories.length ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke={GRID} tick={{ fontSize: 10, fill: AXIS, fontWeight: 500 }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={48} />
                  <YAxis stroke={GRID} tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }} tickLine={false} tickFormatter={compactInr} width={56} />
                  <Tooltip
                    cursor={{ fill: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                    content={<ChartTip formatters={{ revenue: inr, bookings: (v) => `${v} requests`, committed: (v) => `${v} committed` }} />}
                  />
                  <Bar dataKey="revenue" name="revenue" radius={[5, 5, 0, 0]} maxBarSize={52}>
                    {categories.map((c) => (
                      <Cell key={c.category} fill={c.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3 className="h-card mb-0.5">Physical logistics</h3>
          <p className="text-xs text-ink-mute mb-4">
            Providers advance delivery, seekers start returns — neither side sees the whole pipeline.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <MiniStat label="In transit" value={lg.inTransit} icon={Truck} />
            <MiniStat label="Awaiting return" value={lg.awaitingReturn} icon={Package} />
            <MiniStat
              label="Overdue returns"
              value={lg.overdueReturns}
              icon={AlertTriangle}
              tone={lg.overdueReturns ? 'text-amber-accent' : ''}
            />
            <MiniStat label="Unread alerts" value={h.unreadNotifications} icon={Radio} />
          </div>

          <StageList title="Delivery" stages={lg.fulfillment} />
          <StageList title="Returns" stages={lg.returns} />

          {lg.overdueReturns > 0 && (
            <p className="text-[11px] text-amber-accent mt-3 pt-3 border-t border-line">
              {lg.overdueReturns} delivered booking(s) are past their hire window with no return
              started — the Health tab can send the expiry notice.
            </p>
          )}
        </div>
      </section>

      {/* ── Ranking engine ──────────────────────────────────────────────── */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="chart-card lg:col-span-2">
          <h3 className="h-card mb-0.5">How the ranking is performing</h3>
          <p className="text-xs text-ink-mute mb-4">
            Average of each factor across every booking that carries a match snapshot. A factor
            sitting low means its weight is pulling somewhere the market does not reward.
          </p>

          {data.matching.scored === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm muted">
                No booking carries a match snapshot yet. Scores are recorded when a request is made
                through search or the RFQ board.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-4">
                Average match score{' '}
                <span className="text-xl font-bold tabular-nums ml-1">
                  {Math.round(data.matching.avgScore * 100)}%
                </span>
                <span className="text-xs text-ink-mute ml-2">
                  across {data.matching.scored} scored booking(s)
                </span>
              </p>
              <ul className="space-y-3">
                {factorRows.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm">
                        {f.label}
                        <span className="text-[11px] text-ink-mute ml-1.5">weight {f.weight}%</span>
                      </span>
                      <span className="text-xs font-semibold tabular-nums">{f.value}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-sunk overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo transition-all duration-500"
                        style={{ width: `${f.value}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="chart-card">
          <h3 className="h-card mb-0.5">Category share</h3>
          <p className="text-xs text-ink-mute mb-3">By request volume.</p>
          <div style={{ height: 210 }}>
            {!categories.length ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="bookings"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {categories.map((c) => (
                      <Cell key={c.category} fill={c.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTip formatters={{ bookings: (v) => `${v} requests` }} />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="space-y-1 mt-2">
            {categories.slice(0, 5).map((c) => (
              <li key={c.category} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.fill }} />
                <span className="flex-1 truncate">{c.label}</span>
                <span className="tabular-nums text-ink-mute">{c.bookings}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Leaderboards ────────────────────────────────────────────────── */}
      <section className="grid lg:grid-cols-2 gap-4">
        <Leaderboard
          title="Top providers"
          subtitle="By committed revenue earned"
          rows={data.topProviders}
          valueKey="revenue"
          onOpen={onOpenBusiness}
        />
        <Leaderboard
          title="Top seekers"
          subtitle="By committed spend"
          rows={data.topSeekers}
          valueKey="spend"
          onOpen={onOpenBusiness}
        />
      </section>

      {/* ── Status breakdowns ───────────────────────────────────────────── */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Breakdown title="Bookings" counts={data.breakdown.bookings} />
        <Breakdown title="Listings" counts={data.breakdown.listings} />
        <Breakdown title="Requirements" counts={data.breakdown.requirements} />
        <Breakdown title="Proposals" counts={data.breakdown.proposals} />
      </section>

      {data.cities.length > 0 && (
        <section className="chart-card">
          <h3 className="h-card mb-3">Businesses by city</h3>
          <div className="flex flex-wrap gap-2">
            {data.cities.map((c) => (
              <span key={c.city} className="tag">
                {c.city}
                <span className="ml-1.5 font-semibold tabular-nums">{c.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── overview helpers */

function NoData() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-sm text-ink-mute">Not enough data yet.</p>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, tone = '' }) {
  return (
    <div className="border border-line rounded-lg bg-surface-sunk/50 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-mute mb-1">
        {Icon && <Icon size={10} />}
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums leading-none ${tone}`}>{value}</p>
    </div>
  );
}

function StageList({ title, stages }) {
  const entries = Object.entries(stages || {});
  if (!entries.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([stage, count]) => (
          <span key={stage} className="badge-muted">
            {stage.replace(/_/g, ' ')}
            <span className="ml-1 font-semibold tabular-nums">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ title, subtitle, rows, valueKey, onOpen }) {
  return (
    <div className="chart-card">
      <h3 className="h-card mb-0.5">{title}</h3>
      <p className="text-xs text-ink-mute mb-4">{subtitle}</p>
      {!rows?.length ? (
        <p className="text-sm muted">No committed business yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => onOpen(r._id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-surface-sunk/60 transition-colors"
              >
                <span className="w-5 text-xs tabular-nums text-ink-mute shrink-0">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{r.businessName}</span>
                  <span className="block text-[11px] text-ink-mute truncate">
                    {BUSINESS_TYPES.find((b) => b.value === r.businessType)?.label || r.businessType}
                    {r.city && ` · ${r.city}`}
                    {` · ${r.bookings} booking${r.bookings === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums shrink-0">{inr(r[valueKey])}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Breakdown({ title, counts }) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((n, [, v]) => n + v, 0);

  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="h-card">{title}</h3>
        <span className="text-xs tabular-nums text-ink-mute">{total}</span>
      </div>
      {!entries.length ? (
        <p className="text-sm muted">None yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([status, count]) => (
            <li key={status} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize truncate">{status.replace(/_/g, ' ')}</span>
              <span className="tabular-nums font-medium shrink-0">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Chart tooltip. Kept local and small rather than reusing the Analytics one,
 * which is built around that page's per-listing shapes.
 */
function ChartTip({ active, payload, label, formatters = {} }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload || {};
  const color = payload[0].color || payload[0].fill || CHART.indigo;

  const lines = Object.entries(formatters)
    .filter(([key]) => row[key] != null)
    .map(([key, fmt]) => [key, fmt(row[key])]);

  return (
    <div className="bg-surface-alt border border-line-strong rounded-xl px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] pointer-events-none">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold">{row.label || row.month || label}</span>
      </div>
      <ul className="space-y-0.5">
        {lines.map(([key, value]) => (
          <li key={key} className="text-[11px] text-ink-soft tabular-nums">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ BROADCAST */

/**
 * Platform announcements ride the same notify() service as every other
 * notification, so they arrive over the recipient's live socket and still
 * survive in their list if they happen to be offline.
 */
function Broadcast() {
  const { broadcast } = useAdminActions();
  const { data: meta } = useAdminMeta();
  const { user } = useAuth();

  const [form, setForm] = useState({
    title: '',
    message: '',
    audience: 'all',
    businessType: '',
    city: '',
  });
  const [lastSent, setLastSent] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await broadcast.mutateAsync(form);
      setLastSent(res);
      toast.success(`Sent to ${res.sent} business${res.sent === 1 ? '' : 'es'}.`);
      set({ title: '', message: '' });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl">
      <SectionHeader
        title="Broadcast an announcement"
        subtitle="Delivered over each recipient's live socket and kept in their notification list. Suspended accounts are skipped."
      />

      <form onSubmit={submit} className="card space-y-4">
        <label className="block">
          <span className="label">Title</span>
          <input
            className="field"
            required
            maxLength={120}
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Scheduled maintenance on Sunday"
          />
        </label>

        <label className="block">
          <span className="label">Message</span>
          <textarea
            className="field-area"
            required
            rows={4}
            maxLength={600}
            value={form.message}
            onChange={(e) => set({ message: e.target.value })}
            placeholder="The API will pause between 02:00 and 02:30 IST. Bookings in progress are unaffected."
          />
          <span className="block text-[11px] text-ink-mute mt-1">{form.message.length}/600</span>
        </label>

        <div>
          <span className="label">Audience</span>
          <Segmented
            value={form.audience}
            onChange={(audience) => set({ audience })}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'providers', label: 'Businesses with active listings' },
              { value: 'seekers', label: 'Businesses that have bought or posted' },
            ]}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Narrow by type (optional)</span>
            <Select
              className="w-full"
              value={form.businessType}
              onChange={(businessType) => set({ businessType })}
              placeholder="Any business type"
              options={BUSINESS_TYPES}
            />
          </label>
          <label className="block">
            <span className="label">Narrow by city (optional)</span>
            <Select
              className="w-full"
              value={form.city}
              onChange={(city) => set({ city })}
              placeholder="Any city"
              options={meta?.cities || []}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-ink-mute">
            Sent as {user?.businessName} — recipients see it as a platform notice.
          </p>
          <button type="submit" className="btn-primary" disabled={broadcast.isPending}>
            <Megaphone size={15} />
            {broadcast.isPending ? 'Sending…' : 'Send announcement'}
          </button>
        </div>
      </form>

      {lastSent && (
        <div className="card mt-4 border-green-accent/30 bg-green-accent/[0.04]">
          <p className="h-card">Delivered</p>
          <p className="text-sm muted mt-1">
            “{lastSent.title}” reached {lastSent.sent} business
            {lastSent.sent === 1 ? '' : 'es'} in the {lastSent.audience} audience.
          </p>
          <Link to="/notifications" className="text-sm link mt-3 inline-block">
            View your own notifications
          </Link>
        </div>
      )}

      <div className="card mt-6">
        <h3 className="h-card mb-2">Platform administrators</h3>
        <p className="text-sm muted mb-3">
          Admin access is granted by the <code className="font-mono text-xs">ADMIN_EMAILS</code>{' '}
          environment variable on the API, not by a field on any account — provider and seeker are
          decided by context in this marketplace and nothing adds a role column. Changing the list
          takes a redeploy and a fresh sign-in.
        </p>
        <ul className="space-y-1">
          {(meta?.admins || []).map((a) => (
            <li key={a.email} className="flex items-center gap-2 text-sm">
              <ShieldCheck size={13} className="text-indigo shrink-0" />
              <span className="font-medium">{a.businessName}</span>
              <span className="font-mono text-xs text-ink-mute truncate">{a.email}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
