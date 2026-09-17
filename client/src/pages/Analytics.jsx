import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  LayoutGrid, Activity, Clock, TrendingUp, ShoppingBag,
} from 'lucide-react';
import { useAnalytics } from '../hooks/queries';
import { useTheme } from '../context/ThemeContext';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr } from '../lib/format';


/* ── Multi-series professional chart palette ─────────────────────────────── */
const CHART_COLORS = [
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#F43F5E', // rose
  '#22C55E', // green
  '#8B5CF6', // violet
];

/* Status → accent color mapping for the requests-by-status bar chart */
const STATUS_COLORS = {
  Pending:     '#F59E0B', // Amber
  Negotiating: '#F59E0B', // Amber
  Accepted:    '#22C55E', // Green
  Confirmed:   '#22C55E', // Green
  Completed:   '#6366F1', // Indigo
  Rejected:    '#F43F5E', // Rose
  Cancelled:   '#F43F5E', // Rose
};

/* Category → distinct professional color mapping for pie/donut charts */
const CATEGORY_COLORS = {
  av_equipment:     '#6366F1', // Indigo
  banquet_space:    '#F59E0B', // Amber
  furniture:        '#8B5CF6', // Violet
  vehicle:          '#14B8A6', // Teal
  kitchen_capacity: '#F43F5E', // Rose
  parking:          '#3B82F6', // Blue
  staff:            '#22C55E', // Green
  other:            '#14B8A6', // Teal
};

/* Utilization color thresholds — Blue/Violet palette */
const utilColor = (pct) => {
  if (pct >= 70) return '#8B5CF6'; // Violet (high utilization)
  if (pct >= 40) return '#6366F1'; // Indigo (mid utilization)
  return '#3B82F6';                // Blue (base utilization)
};

/* ── Polished custom tooltip — elevated, theme-aware, series-accent colored ── */
function CustomChartTooltip({ active, payload, label, unit = '', formatValue }) {
  if (!active || !payload || !payload.length) return null;

  const item = payload[0];
  const raw = item.payload || {};

  // Resolve title
  const title =
    raw.status ||
    raw.title ||
    raw.label ||
    label ||
    item.name ||
    '';

  // Subtitle (e.g. category for listings)
  const subtitle = raw.category ? (CATEGORY_LABELS[raw.category] || raw.category) : null;

  // Resolve accent color
  let accentColor = item.color || item.fill;
  if (raw.status && STATUS_COLORS[raw.status]) {
    accentColor = STATUS_COLORS[raw.status];
  } else if (raw.category && CATEGORY_COLORS[raw.category]) {
    accentColor = CATEGORY_COLORS[raw.category];
  } else if (raw.utilization !== undefined) {
    accentColor = utilColor(raw.utilization);
  } else if (!accentColor || accentColor === 'none') {
    accentColor = '#6366F1';
  }

  // Format value
  const displayVal = formatValue
    ? formatValue(item.value, raw)
    : unit
    ? `${item.value}${unit}`
    : item.value;

  const metricLabel = item.name && item.name !== title ? item.name : 'Total';

  return (
    <div className="bg-white dark:bg-[#20232D] border border-line-strong dark:border-white/15 rounded-xl px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] min-w-[140px] max-w-[240px] pointer-events-none select-none transition-all duration-150">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            backgroundColor: accentColor,
            boxShadow: `0 0 8px ${accentColor}90`,
          }}
        />
        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
          {title}
        </span>
      </div>

      {subtitle && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5 truncate">
          {subtitle}
        </p>
      )}

      <div className="flex items-baseline justify-between gap-4 pt-1.5 border-t border-black/5 dark:border-white/10">
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 capitalize">
          {metricLabel}
        </span>
        <span
          className="text-sm font-bold tracking-tight"
          style={{ color: accentColor }}
        >
          {displayVal}
        </span>
      </div>
    </div>
  );
}

/* ── Premium KPI stat card ───────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accentClass, valueClass = '' }) {
  return (
    <div className="stat-card flex items-start gap-4">
      {Icon && (
        <div className={`icon-box w-11 h-11 rounded-xl shrink-0 ${accentClass}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-mute uppercase tracking-widest mb-1 font-medium">{label}</p>
        <p className={`text-2xl font-bold leading-none tracking-tight ${valueClass}`}>{value}</p>
        {sub && <p className="text-xs text-ink-mute mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Premium chart card ──────────────────────────────────────────────────── */
function ChartCard({ title, subtitle, children, height = 260, accentColor }) {
  return (
    <div className="chart-card">
      {/* Subtle accent top border */}
      {accentColor && (
        <div
          className="h-0.5 -mx-5 -mt-5 mb-5 rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, ${accentColor}60, ${accentColor}10)` }}
        />
      )}
      <div className="mb-3">
        <h2 className="h-section">{title}</h2>
        {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export default function Analytics() {
  const { dark } = useTheme();

  const [activeStatusIndex, setActiveStatusIndex] = useState(null);
  const [activeUtilIndex, setActiveUtilIndex] = useState(null);
  const [activePieIndex, setActivePieIndex] = useState(null);

  const GRID = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const AXIS = dark ? '#A1A1AA' : '#58585E';

  const { data: summary, isLoading } = useAnalytics('summary');
  const { data: util } = useAnalytics('utilization', { days: 30 });
  const { data: revenue } = useAnalytics('revenue');
  const { data: funnel } = useAnalytics('funnel');

  if (isLoading) return <Spinner label="Crunching your numbers" />;

  const rows = util?.rows || [];
  const series = revenue?.series || [];
  const categories = (funnel?.byCategory || []).map((c) => ({
    ...c,
    label: CATEGORY_LABELS[c.category] || c.category,
  }));

  const statusData = Object.entries(funnel?.received || {}).map(([status, count]) => ({
    status: status[0].toUpperCase() + status.slice(1),
    count,
  }));

  const hasAnything = rows.length > 0 || series.length > 0;

  return (
    <div className="shell pt-12 pb-20">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <div>
          <h1 className="h-page">Business analytics</h1>
          <p className="text-base text-ink-soft mt-1">
            How well your listed capacity is being used, and what it is earning.
          </p>
        </div>
        <Link to="/listings" className="btn-secondary">
          Manage listings
        </Link>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Active listings"
          value={summary?.activeListings ?? 0}
          icon={LayoutGrid}
          accentClass="icon-box-indigo"
        />
        <StatCard
          label="Avg. utilisation"
          value={`${util?.avgUtilization ?? 0}%`}
          sub="Last 30 days"
          icon={Activity}
          accentClass="icon-box-teal"
        />
        <StatCard
          label="Pending requests"
          value={summary?.pendingRequests ?? 0}
          sub="Awaiting your decision"
          icon={Clock}
          accentClass="icon-box-amber"
        />
        <StatCard
          label="Earned"
          value={inr(summary?.totalEarned ?? 0)}
          icon={TrendingUp}
          accentClass="icon-box-green"
          valueClass="text-green-accent"
        />
        <StatCard
          label="Spent"
          value={inr(summary?.totalSpend ?? 0)}
          sub="As a seeker"
          icon={ShoppingBag}
          accentClass="icon-box-violet"
        />
      </div>

      {!hasAnything ? (
        <EmptyState
          title="No activity to chart yet"
          message="Once your listings start receiving bookings, utilisation and revenue trends appear here."
          action={
            <Link to="/listings/new" className="btn-primary">
              List a resource
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Utilisation by listing */}
          <ChartCard
            title="Utilisation by listing"
            subtitle="Share of available unit-hours booked — last 30 days."
            accentColor="#6366F1"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
                onMouseMove={(state) => {
                  if (state && state.activeTooltipIndex !== undefined) {
                    setActiveUtilIndex(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setActiveUtilIndex(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  axisLine={{ stroke: GRID, strokeWidth: 1 }}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={150}
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  tickFormatter={(t) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)}
                  axisLine={false}
                  tickLine={false}
                  dx={-4}
                />
                <Tooltip
                  content={<CustomChartTooltip unit="%" />}
                  cursor={{ fill: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', radius: 4 }}
                />
                <Bar
                  dataKey="utilization"
                  name="Utilisation"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                >
                  {rows.map((r, i) => {
                    const isHovered = activeUtilIndex === i;
                    const isAny = activeUtilIndex !== null;
                    const baseColor = utilColor(r.utilization);
                    return (
                      <Cell
                        key={i}
                        fill={baseColor}
                        fillOpacity={isHovered ? 1 : isAny ? 0.42 : 0.9}
                        style={{
                          filter: isHovered ? `drop-shadow(0 2px 8px ${baseColor}90)` : 'none',
                          transition: 'fill-opacity 200ms ease, filter 200ms ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={() => setActiveUtilIndex(i)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Revenue by month */}
          <ChartCard
            title="Revenue by month"
            subtitle="Accepted, confirmed and completed bookings."
            accentColor="#14B8A6"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  axisLine={{ stroke: GRID, strokeWidth: 1 }}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                  axisLine={false}
                  tickLine={false}
                  dx={-4}
                />
                <Tooltip
                  content={<CustomChartTooltip formatValue={(v) => inr(v)} />}
                  cursor={{ stroke: dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)', strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#14B8A6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#14B8A6', strokeWidth: 2, stroke: dark ? '#20232D' : '#FFFFFF' }}
                  activeDot={{
                    r: 6,
                    fill: '#14B8A6',
                    strokeWidth: 3,
                    stroke: dark ? '#20232D' : '#FFFFFF',
                    style: { filter: 'drop-shadow(0 2px 8px rgba(20, 184, 166, 0.6))' },
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Requests by status */}
          <ChartCard
            title="Requests by status"
            subtitle="Everything other businesses have asked you for."
            accentColor="#F59E0B"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusData}
                margin={{ left: 10, right: 20 }}
                onMouseMove={(state) => {
                  if (state && state.activeTooltipIndex !== undefined) {
                    setActiveStatusIndex(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setActiveStatusIndex(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  axisLine={{ stroke: GRID, strokeWidth: 1 }}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: AXIS, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  dx={-4}
                />
                <Tooltip
                  content={<CustomChartTooltip />}
                  cursor={{ fill: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', radius: 4 }}
                />
                <Bar
                  dataKey="count"
                  name="Requests"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {statusData.map((d, i) => {
                    const isHovered = activeStatusIndex === i;
                    const isAny = activeStatusIndex !== null;
                    const baseColor = STATUS_COLORS[d.status] || CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <Cell
                        key={i}
                        fill={baseColor}
                        fillOpacity={isHovered ? 1 : isAny ? 0.42 : 0.9}
                        style={{
                          filter: isHovered ? `drop-shadow(0 2px 8px ${baseColor}90)` : 'none',
                          transition: 'fill-opacity 200ms ease, filter 200ms ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={() => setActiveStatusIndex(i)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Demand by category */}
          <ChartCard
            title="Demand by category"
            subtitle="Which of your resource types get requested most."
            accentColor="#8B5CF6"
          >
            {categories.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-ink-soft">No requests yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="count"
                    nameKey="label"
                    outerRadius={88}
                    innerRadius={46}
                    paddingAngle={3}
                    label={({ label, count }) => `${label} (${count})`}
                    labelLine={false}
                    fontSize={11}
                    fontWeight={600}
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(null)}
                    isAnimationActive={false}
                  >
                    {categories.map((c, i) => {
                      const isHovered = activePieIndex === i;
                      const isAny = activePieIndex !== null;
                      const baseColor = CATEGORY_COLORS[c.category] || CHART_COLORS[i % CHART_COLORS.length];
                      return (
                        <Cell
                          key={c.category}
                          fill={baseColor}
                          fillOpacity={isHovered ? 1 : isAny ? 0.45 : 0.95}
                          style={{
                            filter: isHovered ? `drop-shadow(0 2px 10px ${baseColor}90)` : 'none',
                            transition: 'fill-opacity 200ms ease, filter 200ms ease',
                            cursor: 'pointer',
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => <span className="text-xs font-medium text-ink-soft ml-1">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Listing performance table */}
          <div className="chart-card lg:col-span-2">
            <div className="h-0.5 -mx-5 -mt-5 mb-5 rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg, #6366F160, #14B8A610)' }}
            />
            <h2 className="h-section mb-5">Listing performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="py-2.5 pr-4 font-semibold text-ink-soft text-xs uppercase tracking-wide">Listing</th>
                    <th className="py-2.5 pr-4 font-semibold text-ink-soft text-xs uppercase tracking-wide">Category</th>
                    <th className="py-2.5 pr-4 font-semibold text-ink-soft text-xs uppercase tracking-wide text-right">Bookings</th>
                    <th className="py-2.5 pr-4 font-semibold text-ink-soft text-xs uppercase tracking-wide text-right">Utilisation</th>
                    <th className="py-2.5 font-semibold text-ink-soft text-xs uppercase tracking-wide text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.resourceId} className="border-b border-line last:border-0 hover:bg-surface-sunk/40 transition-colors">
                      <td className="py-2.5 pr-4">
                        <Link to={`/r/${r.resourceId}`} className="link font-medium">
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-ink-soft">{CATEGORY_LABELS[r.category]}</td>
                      <td className="py-2.5 pr-4 text-right font-medium">{r.bookings}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <span
                          className="font-semibold"
                          style={{ color: r.utilization > 0 ? utilColor(r.utilization) : 'rgb(var(--color-ink-mute))' }}
                        >
                          {r.utilization}%
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-medium">{inr(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-mute mt-4 pt-3 border-t border-line">
              Utilisation compares booked unit-hours against the full {util?.days ?? 30}-day window,
              so a listing that is only offered on weekends will read low by design.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
