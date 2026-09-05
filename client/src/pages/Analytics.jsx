import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAnalytics } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr } from '../lib/format';

/* Monochrome ramp — the minimal skin has no brand hues to spend, so slices are
   separated by value rather than colour, which also survives being printed. */
const PALETTE = ['#141416', '#4A4A50', '#6E6E75', '#92929A', '#B4B4BA', '#D0D0D5', '#E4E4E7'];
const INK = '#141416';
const GRID = '#E4E4E7';
const AXIS = '#8E8E93';

function Tile({ label, value, sub, tone = 'ink' }) {
  return (
    <div className="bg-white p-4 rounded border border-line">
      <p className="text-xs text-ink-soft uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-semibold leading-none ${tone === 'success' ? 'text-success' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-ink-soft mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, height = 260 }) {
  return (
    <div className="bg-white p-5 rounded border border-line">
      <h2 className="h-section">{title}</h2>
      {subtitle && <p className="text-base text-ink-soft mb-3">{subtitle}</p>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    border: '1px solid #E4E4E7',
    borderRadius: 8,
    fontSize: 13,
    boxShadow: 'none',
  },
};

export default function Analytics() {
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
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h-page">Business analytics</h1>
          <p className="text-base text-ink-soft">
            How well your listed capacity is being used, and what it is earning.
          </p>
        </div>
        <Link to="/listings" className="btn-secondary">
          Manage listings
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Tile label="Active listings" value={summary?.activeListings ?? 0} />
        <Tile
          label="Avg. utilisation"
          value={`${util?.avgUtilization ?? 0}%`}
          sub="Last 30 days"
        />
        <Tile
          label="Pending requests"
          value={summary?.pendingRequests ?? 0}
          sub="Awaiting your decision"
        />
        <Tile label="Earned" value={inr(summary?.totalEarned ?? 0)} tone="success" />
        <Tile label="Spent" value={inr(summary?.totalSpend ?? 0)} sub="As a seeker" />
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
          <ChartCard
            title="Utilisation by listing"
            subtitle="Share of available unit-hours actually booked over the last 30 days."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: AXIS }}
                />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={150}
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickFormatter={(t) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)}
                />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Utilisation']} />
                <Bar dataKey="utilization" fill={INK} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Revenue by month" subtitle="Accepted, confirmed and completed bookings.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                />
                <Tooltip {...tooltipStyle} formatter={(v) => [inr(v), 'Revenue']} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={INK}
                  strokeWidth={2}
                  dot={{ r: 3, fill: INK }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Requests by status" subtitle="Everything other businesses have asked you for.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: AXIS }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill={INK} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Demand by category" subtitle="Which of your resource types get requested most.">
            {categories.length === 0 ? (
              <p className="text-base text-ink-soft">No requests yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="count"
                    nameKey="label"
                    outerRadius={90}
                    label={({ label, count }) => `${label} (${count})`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {categories.map((c, i) => (
                      <Cell key={c.category} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* The raw table behind the charts, for anyone who wants the numbers. */}
          <div className="bg-white p-5 rounded border border-line lg:col-span-2">
            <h2 className="h-section mb-5">Listing performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="py-2 pr-4 font-semibold">Listing</th>
                    <th className="py-2 pr-4 font-semibold">Category</th>
                    <th className="py-2 pr-4 font-semibold text-right">Bookings</th>
                    <th className="py-2 pr-4 font-semibold text-right">Utilisation</th>
                    <th className="py-2 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.resourceId} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        <Link to={`/r/${r.resourceId}`} className="link">
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{CATEGORY_LABELS[r.category]}</td>
                      <td className="py-2 pr-4 text-right">{r.bookings}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={r.utilization > 0 ? 'font-semibold' : 'text-ink-mute'}>
                          {r.utilization}%
                        </span>
                      </td>
                      <td className="py-2 text-right">{inr(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-mute mt-3">
              Utilisation compares booked unit-hours against the full {util?.days ?? 30}-day window,
              so a listing that is only offered on weekends will read low by design.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
