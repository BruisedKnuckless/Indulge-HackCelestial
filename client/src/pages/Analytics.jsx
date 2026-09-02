import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAnalytics } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { CATEGORY_LABELS } from '../lib/constants';
import { inr } from '../lib/format';

/* Sequential palette, ordered so adjacent slices stay distinguishable. */
const PALETTE = ['#007185', '#FFA41C', '#CC0C39', '#37475A', '#8CC98F', '#B3D4F0', '#E7C65C'];

function Tile({ label, value, sub, tone = 'ink' }) {
  return (
    <div className="bg-white p-4 rounded border border-bd">
      <p className="text-mini text-ink-soft uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-page font-bold leading-none ${tone === 'success' ? 'text-success' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-mini text-ink-soft mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, height = 260 }) {
  return (
    <div className="bg-white p-5 rounded border border-bd">
      <h2 className="text-section font-bold">{title}</h2>
      {subtitle && <p className="text-base text-ink-soft mb-3">{subtitle}</p>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    border: '1px solid #D5D9D9',
    borderRadius: 8,
    fontSize: 13,
    boxShadow: '0 2px 8px rgba(15,17,17,.15)',
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
    <div className="page-shell py-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-page font-normal">Business analytics</h1>
          <p className="text-base text-ink-soft">
            How well your listed capacity is being used, and what it is earning.
          </p>
        </div>
        <Link to="/listings" className="btn-secondary btn-pill">
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
            <Link to="/listings/new" className="btn-yellow btn-pill">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E9E9" horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#565959' }}
                />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={150}
                  tick={{ fontSize: 11, fill: '#565959' }}
                  tickFormatter={(t) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)}
                />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Utilisation']} />
                <Bar dataKey="utilization" fill="#007185" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Revenue by month" subtitle="Accepted, confirmed and completed bookings.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E9E9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#565959' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#565959' }}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                />
                <Tooltip {...tooltipStyle} formatter={(v) => [inr(v), 'Revenue']} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#007185"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#007185' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Requests by status" subtitle="Everything other businesses have asked you for.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E9E9" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#565959' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#565959' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#FFA41C" radius={[3, 3, 0, 0]} />
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
          <div className="bg-white p-5 rounded border border-bd lg:col-span-2">
            <h2 className="text-section font-bold mb-3">Listing performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-bd text-left">
                    <th className="py-2 pr-4 font-bold">Listing</th>
                    <th className="py-2 pr-4 font-bold">Category</th>
                    <th className="py-2 pr-4 font-bold text-right">Bookings</th>
                    <th className="py-2 pr-4 font-bold text-right">Utilisation</th>
                    <th className="py-2 font-bold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.resourceId} className="border-b border-bd last:border-0">
                      <td className="py-2 pr-4">
                        <Link to={`/r/${r.resourceId}`} className="a-link">
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{CATEGORY_LABELS[r.category]}</td>
                      <td className="py-2 pr-4 text-right">{r.bookings}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={r.utilization > 0 ? 'font-bold' : 'text-ink-mute'}>
                          {r.utilization}%
                        </span>
                      </td>
                      <td className="py-2 text-right">{inr(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-mini text-ink-mute mt-3">
              Utilisation compares booked unit-hours against the full {util?.days ?? 30}-day window,
              so a listing that is only offered on weekends will read low by design.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
