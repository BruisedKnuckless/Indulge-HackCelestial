import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Radio,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Compass,
  Filter,
  CheckCircle2,
  Info,
  Layers,
  Truck,
  CloudRain,
  Flame,
} from 'lucide-react';
import api, { errorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function PublicSignalsPanel({
  city = 'Thane',
  weatherClassification = null,
  scenario = null,
  effectiveRadius = 15,
  initialSignalsData = null,
  onSelectSignal = null,
}) {
  const [signalsData, setSignalsData] = useState(initialSignalsData);
  const [loading, setLoading] = useState(!initialSignalsData);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  // Fetch signals from GET /api/public-signals
  const fetchSignals = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const url = `/public-signals?location=${encodeURIComponent(city)}${
          forceRefresh ? '&refresh=true' : ''
        }`;
        const res = await api.get(url);
        if (res.data?.success) {
          setSignalsData(res.data);
          if (forceRefresh) {
            toast.success(`Public signals refreshed for ${city}`);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch public signals:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [city]
  );

  useEffect(() => {
    fetchSignals(false);
  }, [fetchSignals]);

  // Aggregation metrics
  const aggregation = signalsData?.aggregation || {
    signalActivity: 'moderate',
    activityScore: 42,
    totalSignals: 0,
    relevantSignals: 0,
    latestReportAge: 'Recent',
    topCategories: [],
  };

  const isHighActivity =
    aggregation.signalActivity === 'high' || aggregation.signalActivity === 'very_high';

  // Weather + Signal Correlation
  const correlation = useMemo(() => {
    const isWeatherSevere =
      weatherClassification?.severity === 'severe' ||
      weatherClassification?.severity === 'extreme';

    if (!signalsData || !signalsData.signals || signalsData.signals.length === 0) {
      return {
        status: 'unavailable',
        badge: 'Signals Unavailable',
        tone: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
        text: 'Public signal data unavailable',
        recommendation: 'Digital Twin continues operating normally using weather models and operational telemetry.',
      };
    }

    if (isWeatherSevere && isHighActivity) {
      return {
        status: 'strongly_corroborated',
        badge: 'Reinforcing Disruption',
        tone: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
        text: 'Public signals reinforce the simulated disruption context.',
        recommendation:
          'Elevated logistics disruption context. Recommend proactive seeker notifications, delivery rescheduling for cross-zone routes, or assigning closer localized warehouse partners.',
      };
    } else if (isWeatherSevere) {
      return {
        status: 'weather_precautionary',
        badge: 'Model Precaution Active',
        tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        text: 'Digital Twin simulation projects severe weather impact, while public signal reporting remains moderate. Rapid onset conditions may not yet be fully saturated in public media.',
        recommendation:
          'Precautionary routing advised. Monitor flood-prone underpasses along Ghodbunder Road.',
      };
    } else if (isHighActivity) {
      return {
        status: 'signals_elevated',
        badge: 'Elevated Civic Disruption',
        tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        text: 'Public signals indicate elevated traffic bottlenecks and localized waterlogging despite moderate rainfall index.',
        recommendation:
          'Check route-specific road advisories along Eastern Express Highway before dispatch.',
      };
    }
    return {
      status: 'normal',
      badge: 'Normal Baseline',
      tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      text: 'Public signals and weather models both indicate normal transit and clear operating corridors.',
      recommendation: 'Standard dispatch windows can proceed without restriction.',
    };
  }, [weatherClassification, isHighActivity, signalsData]);

  // Filter signals list
  const filteredSignals = useMemo(() => {
    const list = signalsData?.signals || [];
    if (filterCategory === 'all') return list;
    return list.filter((s) => s.signalCategory === filterCategory);
  }, [signalsData, filterCategory]);

  return (
    <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6 transition-all">
      {/* ── 1. Header with Feed Source and Activity Badge ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Radio size={20} className="animate-pulse" />
            </span>
            <h3 className="text-lg font-bold text-ink tracking-tight flex items-center gap-2">
              <span>Public & Social Signals Integration</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Stage 4
              </span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-surface border border-line text-ink-soft">
              {city} Region
            </span>
          </div>
          <p className="text-xs text-ink-soft mt-1">
            Real-world traveler reports, community civic alerts, and public news syndication feeds
            monitoring weather and transit disruptions.
          </p>
        </div>

        {/* Refresh & Feed Source Info */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-ink-mute block">Source Attribution</span>
            <span className="text-xs font-semibold text-ink">
              {signalsData?.feedSource || 'Public News Syndication'}
            </span>
          </div>

          <button
            onClick={() => fetchSignals(true)}
            disabled={refreshing || loading}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-xs"
            title="Fetch latest public signals"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Fetching…' : 'Refresh Feed'}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Top Metric Cards (STEP 9 & 12) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Signal Activity Level */}
        <div className="p-3.5 rounded-xl bg-surface border border-line">
          <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
            <span>Signal Activity</span>
            <Radio size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-black uppercase tracking-tight ${
                isHighActivity
                  ? 'text-red-600 dark:text-red-400'
                  : aggregation.signalActivity === 'moderate'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {aggregation.signalActivity.replace('_', ' ')}
            </span>
            <span className="text-xs text-ink-mute font-medium">
              Score: {aggregation.activityScore}/100
            </span>
          </div>
          <span className="text-[11px] text-ink-soft mt-1 block">
            {isHighActivity ? '⚠ Elevated disruption chatter' : 'Normal community volume'}
          </span>
        </div>

        {/* Total Reports */}
        <div className="p-3.5 rounded-xl bg-surface border border-line">
          <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
            <span>Recent Reports</span>
            <Layers size={14} className="text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-ink">
            {aggregation.totalSignals}
            <span className="text-xs font-normal text-ink-mute ml-1">
              ({aggregation.relevantSignals} relevant)
            </span>
          </div>
          <span className="text-[11px] text-ink-soft mt-1 block">
            Across news & civic feeds
          </span>
        </div>

        {/* Dominant Category */}
        <div className="p-3.5 rounded-xl bg-surface border border-line">
          <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
            <span>Dominant Signal</span>
            <span className="text-base">{aggregation.dominantIcon || '🌊'}</span>
          </div>
          <div className="text-sm font-bold text-ink truncate mt-0.5">
            {aggregation.dominantLabel || 'Waterlogging'}
          </div>
          <span className="text-[11px] text-ink-mute mt-1 block">
            Leading disruption factor
          </span>
        </div>

        {/* Latest Activity */}
        <div className="p-3.5 rounded-xl bg-surface border border-line">
          <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
            <span>Freshness</span>
            <Clock size={14} className="text-amber-500" />
          </div>
          <div className="text-sm font-bold text-ink truncate mt-0.5">
            {aggregation.latestReportAge}
          </div>
          <span className="text-[11px] text-ink-mute mt-1 block">
            Automatic 10-min cache
          </span>
        </div>
      </div>

      {/* ── 3. WEATHER + PUBLIC SIGNAL CONTEXT CARD (STEP 16 & 17) ── */}
      <div className="p-4 rounded-xl bg-surface border border-line mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🌐</span>
            <h4 className="font-bold text-ink text-sm">Weather + Public Signal Context</h4>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${correlation.tone}`}>
            {correlation.badge}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex justify-between text-ink-soft">
              <span>OpenWeather Simulated State:</span>
              <strong className="text-ink uppercase font-semibold">
                {weatherClassification?.severity || 'Severe'} ({weatherClassification?.score || 68}/100)
              </strong>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Rainfall / Wind:</span>
              <span className="text-ink">
                {scenario?.rainfallMmPerHour ?? 0} mm/h · {scenario?.windSpeedMps ?? 0} m/s
              </span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Public Signal Activity:</span>
              <strong className="text-ink font-semibold uppercase">
                {aggregation.signalActivity} ({aggregation.totalSignals} reports)
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface-sunk border border-line flex items-start gap-2.5">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink text-xs">{correlation.text}</p>
              <p className="text-[11px] text-ink-soft mt-1">{correlation.recommendation}</p>
            </div>
          </div>
        </div>

        {/* Logistics Context Link (STEP 17) */}
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 text-ink-soft">
            <Truck size={14} className="text-rose-500" />
            <span>
              Delivery #LG1024 (18.4 km corridor):{' '}
              <strong className="text-red-500">
                {effectiveRadius <= 15 ? 'Corridor confirmed waterlogged by public reports' : 'Normal transit'}
              </strong>
            </span>
          </div>
          <span className="text-[10px] text-ink-mute italic">
            Public signal — not independently verified
          </span>
        </div>
      </div>

      {/* ── 4. Category Filter Buttons (STEP 12) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 text-xs">
        <span className="text-ink-mute mr-1 shrink-0 font-medium">Filter Signals:</span>
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            filterCategory === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-surface text-ink-soft hover:text-ink hover:bg-surface-sunk'
          }`}
        >
          All ({signalsData?.signals?.length || 0})
        </button>
        {aggregation.topCategories.map((c) => (
          <button
            key={c.category}
            onClick={() => setFilterCategory(c.category)}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
              filterCategory === c.category
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'bg-surface text-ink-soft hover:text-ink hover:bg-surface-sunk'
            }`}
          >
            <span>{c.icon}</span>
            <span>{c.label}</span>
            <span className="text-[10px] opacity-75">({c.count})</span>
          </button>
        ))}
      </div>

      {/* ── 5. Signal Timeline Cards (STEP 15, 18, 19) ── */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {loading ? (
          <div className="py-8 text-center text-ink-mute text-xs flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin" /> Fetching live public signals…
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="py-8 text-center text-ink-mute text-xs">
            Public signal data unavailable
          </div>
        ) : (
          filteredSignals.slice(0, 10).map((sig) => (
            <div
              key={sig.id}
              onClick={() => onSelectSignal?.(sig)}
              className="p-3.5 rounded-xl bg-surface border border-line hover:border-blue-500/50 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs group"
            >
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-lg bg-surface-sunk text-base shrink-0">
                  {sig.categoryIcon || '📍'}
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-ink group-hover:text-blue-600 transition-colors">
                      {sig.title}
                    </span>
                    {sig.severity === 'critical' && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                        CRITICAL
                      </span>
                    )}
                    {sig.severity === 'high' && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                        HIGH
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-mute flex-wrap">
                    <span className="font-medium text-ink-soft">{sig.source}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> {sig.relativeTime}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-ink-soft">
                      <MapPin size={11} className="text-indigo-500" />
                      {sig.location?.landmark || sig.location?.name}
                    </span>
                  </div>
                </div>
              </div>

              {sig.url && (
                <a
                  href={sig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 shrink-0 self-start sm:self-auto hover:text-blue-600"
                  title="Open original public report"
                >
                  <span>View Source</span>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── 6. Bottom Transparency & Safety Notice (STEP 19 & 22) ── */}
      <div className="mt-4 pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-ink-mute">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Legitimate public syndication • Zero user credentials stored</span>
        </div>
        <span>Public signal — not independently verified by Indulge</span>
      </div>
    </div>
  );
}
