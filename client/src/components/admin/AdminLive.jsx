import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, MessageSquare, Receipt, Star, Building2, FileText, Radio, ChevronRight,
} from 'lucide-react';
import { useAdminLive } from '../../hooks/queries';
import { Spinner } from '../ui';
import { relative, dateTime } from '../../lib/format';
import { CATEGORY_LABELS } from '../../lib/constants';
import { SectionHeader, Segmented, Pill, Money } from './primitives';
import LiveTimeline from './LiveTimeline';

/**
 * One reverse-chronological stream of everything happening on the platform.
 *
 * The interesting administrative question is almost always "what just
 * happened", which separate per-collection tables make you reassemble in your
 * head. Polls every 15s — the same cadence as the supplier RFQ feed.
 *
 * Each row (except signups, which have no request behind them) expands in
 * place to show the lifecycle of the request it belongs to. One row is open
 * at a time so the stream stays scannable.
 */

/** Grid-rows transition: animates to the content's real height, no magic numbers. */
function Expand({ open, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const f = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(f);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

const KIND = {
  booking: { label: 'Requests', icon: ShoppingBag, tone: 'icon-box-indigo' },
  requirement: { label: 'RFQs', icon: FileText, tone: 'icon-box-violet' },
  proposal: { label: 'Quotes', icon: MessageSquare, tone: 'icon-box-teal' },
  transaction: { label: 'Payments', icon: Receipt, tone: 'icon-box-green' },
  review: { label: 'Reviews', icon: Star, tone: 'icon-box-amber' },
  signup: { label: 'Signups', icon: Building2, tone: 'icon-box-muted' },
};

export default function AdminLive() {
  const { data, isLoading, isFetching } = useAdminLive(90);
  const [kind, setKind] = useState('');
  const [openKey, setOpenKey] = useState(null);

  const feed = useMemo(() => {
    const all = data?.feed || [];
    return kind ? all.filter((f) => f.kind === kind) : all;
  }, [data, kind]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of data?.feed || []) c[f.kind] = (c[f.kind] || 0) + 1;
    return c;
  }, [data]);

  if (isLoading) return <Spinner label="Loading platform activity" />;

  return (
    <div>
      <SectionHeader
        title="Live activity"
        subtitle="Every request, quote, payment, review and signup across all businesses, newest first"
      >
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
          <Radio size={13} className={isFetching ? 'text-green-accent animate-pulse' : 'text-ink-mute'} />
          {isFetching ? 'Refreshing' : 'Auto-refreshes every 15s'}
        </span>
      </SectionHeader>

      <div className="mb-4 overflow-x-auto">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: '', label: `All (${data?.feed?.length || 0})` },
            ...Object.entries(KIND).map(([k, v]) => ({
              value: k,
              label: `${v.label}${counts[k] ? ` (${counts[k]})` : ''}`,
            })),
          ]}
        />
      </div>

      {!feed.length ? (
        <div className="card text-center py-12">
          <p className="text-sm muted">No activity of this kind yet.</p>
        </div>
      ) : (
        <ol className="bg-surface-alt border border-line rounded-xl divide-y divide-line/60 overflow-hidden">
          {feed.map((item) => {
            const meta = KIND[item.kind] || KIND.booking;
            const Icon = meta.icon;
            const key = `${item.kind}-${item.id}`;
            const expandable = item.kind !== 'signup';
            const open = openKey === key;
            const toggle = () => expandable && setOpenKey(open ? null : key);
            return (
              <li key={key} className={open ? 'bg-surface-sunk/20' : ''}>
                <div
                  role={expandable ? 'button' : undefined}
                  tabIndex={expandable ? 0 : undefined}
                  aria-expanded={expandable ? open : undefined}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (expandable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-sunk/40 transition-colors ${
                    expandable ? 'cursor-pointer focus-visible:outline-none focus-visible:bg-surface-sunk/40' : ''
                  }`}
                >
                  <span className={`icon-box ${meta.tone} w-8 h-8 shrink-0 mt-0.5`}>
                    <Icon size={14} strokeWidth={1.9} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <p className="text-xs text-ink-mute mt-0.5 truncate">
                      {item.detail}
                      {item.category && ` · ${CATEGORY_LABELS[item.category] || item.category}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {item.amount != null && <Money amount={item.amount} className="text-xs font-medium" />}
                    {item.status && <Pill status={item.status} />}
                    <time
                      title={dateTime(item.at)}
                      className="text-[11px] text-ink-mute w-16 text-right hidden sm:block"
                    >
                      {relative(item.at)}
                    </time>
                    {item.link && (
                      <Link
                        to={item.link}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs link-quiet hover:text-ink hidden md:inline"
                      >
                        Open
                      </Link>
                    )}
                    {expandable && (
                      <ChevronRight
                        size={14}
                        aria-hidden
                        className={`text-ink-mute transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                      />
                    )}
                  </div>
                </div>

                {expandable && (
                  <Expand open={open}>
                    <div className="border-t border-line/60 px-4 sm:pl-[60px] py-4">
                      <LiveTimeline kind={item.kind} id={item.id} />
                    </div>
                  </Expand>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
