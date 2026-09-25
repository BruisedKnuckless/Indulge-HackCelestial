import { useState } from 'react';
import { Award, ShieldCheck, TrendingUp, AlertTriangle, Star } from 'lucide-react';
import { useAdminContribution } from '../../hooks/queries';
import { Spinner } from '../ui';
import {
  DataTable, Pager, Toolbar, SearchBox, Select, Segmented, SectionHeader,
  Pill, Stacked, Kpi,
} from './primitives';

export default function AdminContribution({ onOpen }) {
  const [params, setParams] = useState({
    page: 1,
    limit: 25,
    sort: 'contribution_desc',
    tier: '',
    q: '',
  });

  const { data, isLoading } = useAdminContribution(params);
  const set = (patch) => setParams((p) => ({ ...p, ...patch, page: 1 }));
  const setPage = (page) => setParams((p) => ({ ...p, page }));

  const summary = data?.summary || {};
  const profiles = data?.profiles || [];

  return (
    <div>
      <SectionHeader
        title="Contribution Intelligence"
        subtitle="Deterministic marketplace reputation, operational trust, and ecosystem contribution derived from real records."
      />

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Kpi
          label="Avg Contribution"
          value={summary.avgContribution ?? '—'}
          hint="Across active businesses"
          tone="accent"
        />
        <Kpi
          label="Avg Trust Score"
          value={summary.avgTrust ?? '—'}
          hint="Operational reliability"
          tone="success"
        />
        <Kpi
          label="Preferred Partners"
          value={summary.tierCounts?.PREFERRED ?? 0}
          hint={`Trusted: ${summary.tierCounts?.TRUSTED ?? 0}`}
        />
        <Kpi
          label="Active / New"
          value={`${summary.tierCounts?.ACTIVE ?? 0} / ${summary.tierCounts?.NEW ?? 0}`}
          hint="Emerging businesses"
        />
      </div>

      <Toolbar>
        <SearchBox
          className="w-64"
          value={params.q}
          onChange={(q) => set({ q })}
          placeholder="Filter by business name…"
        />
        <Select
          value={params.tier}
          onChange={(tier) => set({ tier })}
          placeholder="All tiers"
          options={[
            { value: '', label: 'All tiers' },
            { value: 'PREFERRED', label: 'Preferred' },
            { value: 'TRUSTED', label: 'Trusted' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'NEW', label: 'New' },
          ]}
        />
        <Select
          value={params.sort}
          onChange={(sort) => set({ sort })}
          placeholder="Sort order"
          options={[
            { value: 'contribution_desc', label: 'Highest Contribution' },
            { value: 'contribution_asc', label: 'Lowest Contribution' },
            { value: 'trust_desc', label: 'Highest Trust' },
            { value: 'trust_asc', label: 'Lowest Trust' },
            { value: 'cancellations_desc', label: 'Highest Cancellations' },
          ]}
        />
      </Toolbar>

      {isLoading ? (
        <Spinner label="Analyzing contribution intelligence" />
      ) : (
        <>
          <DataTable
            rows={profiles}
            empty="No businesses match the specified filters."
            columns={[
              {
                key: 'businessName',
                header: 'Business',
                render: (p) => (
                  <button
                    type="button"
                    onClick={() => onOpen?.(p.businessId)}
                    className="text-left group"
                  >
                    <span className="font-semibold text-ink group-hover:text-accent transition-colors block">
                      {p.businessName}
                    </span>
                    <span className="text-[11px] text-ink-mute capitalize">
                      {p.businessType?.replace('_', ' ') || 'business'}
                    </span>
                  </button>
                ),
              },
              {
                key: 'tier',
                header: 'Tier',
                render: (p) => (
                  <span
                    className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      p.tier === 'PREFERRED'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        : p.tier === 'TRUSTED'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                        : p.tier === 'ACTIVE'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        : 'bg-surface-sunk text-ink-soft border-line'
                    }`}
                  >
                    {p.tier}
                  </span>
                ),
              },
              {
                key: 'contribution',
                header: 'Contribution',
                align: 'right',
                render: (p) => (
                  <span className="font-bold text-indigo tabular-nums text-sm">
                    {p.contributionScore} <span className="text-[10px] text-ink-mute font-normal">/ 100</span>
                  </span>
                ),
              },
              {
                key: 'trust',
                header: 'Trust Score',
                align: 'right',
                render: (p) => (
                  <span className="font-bold text-ink tabular-nums text-sm">
                    {p.trustScore} <span className="text-[10px] text-ink-mute font-normal">/ 100</span>
                  </span>
                ),
              },
              {
                key: 'fulfillment',
                header: 'Fulfillment',
                align: 'right',
                render: (p) => (
                  <div className="text-right">
                    <span className="font-semibold text-ink tabular-nums text-xs">
                      {Math.round(p.signals.fulfillmentRate * 100)}%
                    </span>
                    <span className="block text-[10px] text-ink-mute">
                      {p.signals.successfulFulfillments} completed
                    </span>
                  </div>
                ),
              },
              {
                key: 'cancellations',
                header: 'Cancellations',
                align: 'right',
                render: (p) => (
                  <div className="text-right">
                    <span className={`font-semibold tabular-nums text-xs ${p.signals.providerCancellations > 0 ? 'text-danger' : 'text-ink-soft'}`}>
                      {p.signals.providerCancellations}
                    </span>
                    <span className="block text-[10px] text-ink-mute">
                      ({Math.round(p.signals.cancellationRate * 100)}%)
                    </span>
                  </div>
                ),
              },
              {
                key: 'signals',
                header: 'Participation Signals',
                render: (p) => (
                  <div className="text-xs text-ink-soft space-y-0.5">
                    <span>{p.signals.recoveryConversions} recovery conversions</span>
                    <span className="text-ink-mute"> · </span>
                    <span>{p.signals.successfulRfqs} RFQs helped</span>
                    <span className="text-ink-mute"> · </span>
                    <span>{p.signals.activeListings} active items</span>
                  </div>
                ),
              },
              {
                key: 'badges',
                header: 'Badges',
                render: (p) => (
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {p.badges?.length > 0 ? (
                      p.badges.map((b) => (
                        <span
                          key={b.id}
                          title={b.description}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-sunk border border-line text-ink"
                        >
                          <Award size={10} className="text-amber-500 shrink-0" />
                          {b.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-ink-mute text-xs">—</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pager
            page={data?.page || 1}
            total={data?.totalPages || 1}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
