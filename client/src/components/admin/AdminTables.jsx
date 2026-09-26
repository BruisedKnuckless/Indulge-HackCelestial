import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Pause, Play, Archive, Scale, Receipt, Trash2, AlertTriangle, Ban, Star,
} from 'lucide-react';
import { useAdminList, useAdminMeta, useAdminActions } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Spinner } from '../ui';
import { inr, dateRange, dateTime, relative } from '../../lib/format';
import { CATEGORY_LABELS, BUSINESS_TYPES } from '../../lib/constants';
import {
  DataTable, Pager, Toolbar, SearchBox, Select, Segmented, SectionHeader,
  Pill, Money, ActionDialog, Stacked, OpenLink, CopyId, Kpi,
} from './primitives';

/**
 * The moderation tables.
 *
 * Each one is a filtered cross-tenant list plus the narrowest write that
 * resolves whatever the list is showing you. They share one paging hook, so
 * adding a filter here never means touching the request plumbing.
 */

/** Shared paging + filter state for a table. */
function useTable(resource, initial = {}) {
  const [params, setParams] = useState({ page: 1, limit: 25, ...initial });
  const query = useAdminList(resource, params);

  const set = (patch) => setParams((p) => ({ ...p, ...patch, page: 1 }));
  const setPage = (page) => setParams((p) => ({ ...p, page }));

  return { params, set, setPage, ...query };
}

/* ═════════════════════════════════════════════════════════════════ LISTINGS */

export function AdminListings() {
  const t = useTable('listings');
  const { data: meta } = useAdminMeta();
  const { setListingStatus } = useAdminActions();
  const [target, setTarget] = useState(null);

  const apply = async (reason) => {
    try {
      await setListingStatus.mutateAsync({ id: target.row._id, status: target.status, reason });
      toast.success(`“${target.row.title}” is now ${target.status}.`);
      setTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Listings"
        subtitle="Every listing on the platform. Taking one down keeps the bookings already committed against it."
      />

      <Toolbar>
        <SearchBox
          className="w-64"
          value={t.params.q}
          onChange={(q) => t.set({ q })}
          placeholder="Title, description or tag…"
        />
        <Select
          value={t.params.category}
          onChange={(category) => t.set({ category })}
          placeholder="All categories"
          options={(meta?.categories || []).map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c }))}
        />
        <Segmented
          value={t.params.status}
          onChange={(status) => t.set({ status })}
          options={[
            { value: '', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading listings" />
      ) : (
        <>
          <DataTable
            rows={t.data?.listings || []}
            empty="No listings match these filters."
            columns={[
              {
                key: 'title',
                header: 'Listing',
                render: (r) => (
                  <Stacked
                    title={r.title}
                    detail={`${CATEGORY_LABELS[r.category] || r.category} · ${r.totalQuantity} ${r.unit}`}
                    to={`/r/${r._id}`}
                  />
                ),
              },
              {
                key: 'owner',
                header: 'Owner',
                render: (r) => (
                  <Stacked
                    title={r.owner?.businessName || '—'}
                    detail={r.owner?.location?.city}
                    to={r.owner ? `/provider/${r.owner._id}` : null}
                  />
                ),
              },
              {
                key: 'price',
                header: 'Price',
                align: 'right',
                render: (r) => <Money amount={r.pricing?.basePrice} />,
              },
              {
                key: 'demand',
                header: 'Committed',
                align: 'right',
                render: (r) => (
                  <span title={`${r.stats.bookings} requests all time`}>
                    {r.stats.committed}
                    {r.stats.upcoming > 0 && (
                      <span className="text-[11px] text-amber-accent ml-1">({r.stats.upcoming} upcoming)</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'revenue',
                header: 'Revenue',
                align: 'right',
                render: (r) => <Money amount={r.stats.revenue} />,
              },
              {
                key: 'health',
                header: 'Health',
                render: (r) => (
                  <span className="flex items-center gap-1">
                    {!r.mappable && (
                      <span className="badge-amber" title="No coordinates — invisible to search">
                        <AlertTriangle size={10} /> unsearchable
                      </span>
                    )}
                    {r.windows > 0 && <span className="badge-muted">{r.windows} window(s)</span>}
                    {r.mappable && r.windows === 0 && <span className="text-xs text-ink-mute">—</span>}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <span className={`badge-${r.status === 'active' ? 'green' : r.status === 'paused' ? 'amber' : 'muted'}`}>
                    {r.status}
                  </span>
                ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (r) => (
                  <span className="flex items-center justify-end gap-1">
                    {r.status !== 'active' && (
                      <button type="button" className="btn-secondary btn-sm" title="Reinstate" onClick={() => setTarget({ row: r, status: 'active' })}>
                        <Play size={12} />
                      </button>
                    )}
                    {r.status !== 'paused' && (
                      <button type="button" className="btn-secondary btn-sm" title="Pause" onClick={() => setTarget({ row: r, status: 'paused' })}>
                        <Pause size={12} />
                      </button>
                    )}
                    {r.status !== 'archived' && (
                      <button type="button" className="btn-danger btn-sm" title="Archive" onClick={() => setTarget({ row: r, status: 'archived' })}>
                        <Archive size={12} />
                      </button>
                    )}
                  </span>
                ),
              },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}

      <ActionDialog
        open={Boolean(target)}
        title={`Move “${target?.row?.title}” to ${target?.status}?`}
        description={
          target?.status === 'active'
            ? 'The listing returns to search and the board immediately.'
            : 'It leaves search at once. Accepted and confirmed bookings against it are kept — the provider still owes them.'
        }
        confirmLabel={`Set ${target?.status}`}
        tone={target?.status === 'active' ? 'primary' : 'danger'}
        requireReason={target?.status !== 'active'}
        reasonPlaceholder="Sent to the owner as a notification"
        busy={setListingStatus.isPending}
        onConfirm={apply}
        onClose={() => setTarget(null)}
      >
        {target?.row?.stats?.upcoming > 0 && (
          <p className="text-sm text-amber-accent border border-amber-accent/25 bg-amber-accent/5 rounded-lg px-3 py-2">
            {target.row.stats.upcoming} upcoming reserved booking(s) will remain live against this listing.
          </p>
        )}
      </ActionDialog>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ BOOKINGS */

const FLAGS = [
  { value: '', label: 'All' },
  { value: 'stuck', label: 'Stuck' },
  { value: 'unpaid', label: 'Awaiting payment' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'overdue_return', label: 'Overdue return' },
];

export function AdminBookings() {
  const t = useTable('bookings');
  const { data: meta } = useAdminMeta();
  const { overrideBooking } = useAdminActions();
  const [target, setTarget] = useState(null);
  const [status, setStatus] = useState('cancelled');

  const apply = async (reason) => {
    try {
      await overrideBooking.mutateAsync({ id: target._id, status, reason });
      toast.success(`Booking moved to ${status}. Both parties notified.`);
      setTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Bookings"
        subtitle="Cross-tenant request ledger. An override re-checks availability first, so the console cannot create the oversubscription its own audit reports."
      />

      <Toolbar>
        <Segmented value={t.params.flagged} onChange={(flagged) => t.set({ flagged, status: '' })} options={FLAGS} />
        <Select
          value={t.params.status}
          onChange={(s) => t.set({ status: s, flagged: '' })}
          placeholder="Any status"
          options={meta?.bookingStatuses || []}
        />
        <Select
          value={t.params.category}
          onChange={(category) => t.set({ category })}
          placeholder="Any category"
          options={(meta?.categories || []).map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c }))}
        />
      </Toolbar>

      {t.params.flagged === 'stuck' && (
        <p className="text-sm muted mb-3">
          Still awaiting a provider decision although the requested start date has already passed.
        </p>
      )}
      {t.params.flagged === 'overdue_return' && (
        <p className="text-sm muted mb-3">
          Delivered stock whose hire window has closed with no return started — the platform's live exposure.
        </p>
      )}

      {t.isLoading ? (
        <Spinner label="Loading bookings" />
      ) : (
        <>
          <DataTable
            rows={t.data?.bookings || []}
            empty="No bookings match these filters."
            columns={[
              {
                key: 'resource',
                header: 'Listing',
                render: (r) => (
                  <Stacked
                    title={r.resource?.title || 'deleted listing'}
                    detail={`${r.requestedQuantity} × ${CATEGORY_LABELS[r.resource?.category] || '—'}`}
                    to={`/bookings/detail/${r._id}`}
                  />
                ),
              },
              {
                key: 'parties',
                header: 'Seeker → Provider',
                render: (r) => (
                  <Stacked
                    title={r.seeker?.businessName || '—'}
                    detail={`→ ${r.provider?.businessName || '—'}`}
                  />
                ),
              },
              { key: 'window', header: 'Window', render: (r) => <span className="text-xs">{dateRange(r.startDateTime, r.endDateTime)}</span> },
              { key: 'value', header: 'Value', align: 'right', render: (r) => <Money amount={r.agreedPrice ?? r.quotedPrice} /> },
              {
                key: 'money',
                header: 'Payment',
                render: (r) =>
                  r.transaction ? (
                    <span className={`badge-${r.transaction.status === 'simulated_paid' ? 'green' : r.transaction.status === 'refunded' ? 'red' : 'amber'}`}>
                      {r.transaction.status.replace(/_/g, ' ')}
                    </span>
                  ) : ['accepted', 'confirmed', 'completed'].includes(r.status) ? (
                    <span className="badge-red" title="Committed booking with no transaction">
                      <AlertTriangle size={10} /> missing
                    </span>
                  ) : (
                    <span className="text-xs text-ink-mute">—</span>
                  ),
              },
              {
                key: 'logistics',
                header: 'Logistics',
                render: (r) =>
                  r.return?.status ? (
                    <Pill status={r.return.status} />
                  ) : r.fulfillment?.status ? (
                    <Pill status={r.fulfillment.status} />
                  ) : (
                    <span className="text-xs text-ink-mute">—</span>
                  ),
              },
              {
                key: 'match',
                header: 'Match',
                align: 'right',
                render: (r) =>
                  r.matchScore != null ? (
                    <span title="Snapshotted match score at the time of booking">
                      {Math.round(r.matchScore * 100)}%
                    </span>
                  ) : (
                    <span className="text-xs text-ink-mute">—</span>
                  ),
              },
              { key: 'status', header: 'Status', render: (r) => <Pill status={r.status} /> },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (r) => (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    title="Override status"
                    onClick={() => {
                      setTarget(r);
                      setStatus(r.status === 'pending' ? 'cancelled' : 'cancelled');
                    }}
                  >
                    <Scale size={12} />
                  </button>
                ),
              },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}

      <ActionDialog
        open={Boolean(target)}
        title="Override booking status"
        description={`Currently ${target?.status}. Both the provider and the seeker are notified with your reason, verbatim.`}
        confirmLabel="Apply override"
        tone="danger"
        requireReason
        reasonLabel="Reason (sent to both parties)"
        busy={overrideBooking.isPending}
        onConfirm={apply}
        onClose={() => setTarget(null)}
      >
        <label className="block">
          <span className="label">New status</span>
          <Select
            className="w-full"
            value={status}
            onChange={setStatus}
            options={(meta?.bookingStatuses || []).filter((s) => s !== target?.status)}
          />
        </label>
        {['accepted', 'confirmed'].includes(status) && (
          <p className="text-xs muted mt-2">
            Availability is re-validated before this is written. If the window is already full the
            override is refused rather than oversubscribing the listing.
          </p>
        )}
      </ActionDialog>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════ RFQs */

export function AdminRequirements() {
  const t = useTable('requirements');
  const { data: meta } = useAdminMeta();
  const { setRequirementStatus } = useAdminActions();
  const [target, setTarget] = useState(null);
  const [status, setStatus] = useState('closed');

  const apply = async (reason) => {
    try {
      await setRequirementStatus.mutateAsync({ id: target._id, status, reason });
      toast.success(`Requirement moved to ${status}.`);
      setTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Requirements (RFQs)"
        subtitle="The reverse marketplace. A fulfilled requirement is tied to a booking and can only be changed through that booking."
      />

      <Toolbar>
        <SearchBox className="w-64" value={t.params.q} onChange={(q) => t.set({ q })} placeholder="Title or description…" />
        <Select
          value={t.params.status}
          onChange={(s) => t.set({ status: s })}
          placeholder="Any status"
          options={meta?.requirementStatuses || []}
        />
        <Select
          value={t.params.category}
          onChange={(category) => t.set({ category })}
          placeholder="Any category"
          options={(meta?.categories || []).map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c }))}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading requirements" />
      ) : (
        <>
          <DataTable
            rows={t.data?.requirements || []}
            empty="No requirements match these filters."
            columns={[
              {
                key: 'title',
                header: 'Requirement',
                render: (r) => (
                  <Stacked
                    title={r.title}
                    detail={`${CATEGORY_LABELS[r.category] || r.category} · ${r.requiredQuantity ?? r.quantity ?? 1} ${r.unit || ''}`}
                    to={`/requirements/${r._id}`}
                  />
                ),
              },
              {
                key: 'seeker',
                header: 'Posted by',
                render: (r) => (
                  <Stacked
                    title={r.seeker?.businessName || '—'}
                    detail={r.seeker?.suspended ? 'account suspended' : r.seeker?.location?.city}
                    to={r.seeker ? `/provider/${r.seeker._id}` : null}
                  />
                ),
              },
              { key: 'window', header: 'Window', render: (r) => <span className="text-xs">{dateRange(r.startDateTime, r.endDateTime)}</span> },
              { key: 'budget', header: 'Budget', align: 'right', render: (r) => <Money amount={r.maxBudget ?? r.maxPrice} /> },
              {
                key: 'responses',
                header: 'Responses',
                align: 'right',
                render: (r) => (
                  <span title={`${r.proposals.total} proposals, ${r.offerCount} board offers`}>
                    {r.proposals.submitted + r.offerCount}
                    {r.proposals.bestQuote != null && (
                      <span className="text-[11px] text-ink-mute ml-1">best {inr(r.proposals.bestQuote)}</span>
                    )}
                  </span>
                ),
              },
              { key: 'urgency', header: 'Urgency', render: (r) => <span className={`badge-${r.urgency === 'high' ? 'red' : r.urgency === 'medium' ? 'amber' : 'muted'}`}>{r.urgency}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <span className="flex items-center gap-1">
                    <Pill status={r.status} />
                    {r.expired && (
                      <span className="badge-amber" title="Open but the window has passed">
                        stale
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (r) => (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    title="Change status"
                    disabled={r.status === 'fulfilled'}
                    onClick={() => {
                      setTarget(r);
                      setStatus(r.status === 'open' ? 'closed' : 'open');
                    }}
                  >
                    <Scale size={12} />
                  </button>
                ),
              },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}

      <ActionDialog
        open={Boolean(target)}
        title={`Change status of “${target?.title}”`}
        description={`Currently ${target?.status}. The posting business is notified.`}
        confirmLabel="Apply"
        busy={setRequirementStatus.isPending}
        onConfirm={apply}
        onClose={() => setTarget(null)}
      >
        <label className="block">
          <span className="label">New status</span>
          <Select
            className="w-full"
            value={status}
            onChange={setStatus}
            options={(meta?.requirementStatuses || []).filter((s) => s !== target?.status && s !== 'fulfilled')}
          />
        </label>
      </ActionDialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ LEDGER */

export function AdminLedger() {
  const t = useTable('transactions');
  const { refund } = useAdminActions();
  const [target, setTarget] = useState(null);

  const totals = t.data?.totals || {};

  const apply = async (reason) => {
    try {
      await refund.mutateAsync({ id: target._id, reason });
      toast.success('Refunded and the booking cancelled.');
      setTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Payment ledger"
        subtitle="Payments are simulated in this prototype — no gateway is integrated. A refund also cancels its booking, so the provider is not left holding inventory for an unpaid order."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Settled" value={inr(totals.simulated_paid?.amount || 0)} sub={`${totals.simulated_paid?.count || 0} payments`} icon={Receipt} tone="green" />
        <Kpi label="Pending" value={inr(totals.pending?.amount || 0)} sub={`${totals.pending?.count || 0} awaiting payment`} icon={Receipt} tone="amber" />
        <Kpi label="Refunded" value={inr(totals.refunded?.amount || 0)} sub={`${totals.refunded?.count || 0} reversed`} icon={Receipt} tone="indigo" />
        <Kpi label="Ledger rows" value={(t.data?.total || 0).toLocaleString('en-IN')} icon={Receipt} tone="muted" />
      </div>

      <Toolbar>
        <Segmented
          value={t.params.status}
          onChange={(status) => t.set({ status })}
          options={[
            { value: '', label: 'All' },
            { value: 'simulated_paid', label: 'Settled' },
            { value: 'pending', label: 'Pending' },
            { value: 'refunded', label: 'Refunded' },
          ]}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading the ledger" />
      ) : (
        <>
          <DataTable
            rows={t.data?.transactions || []}
            empty="No transactions match these filters."
            columns={[
              {
                key: 'booking',
                header: 'Booking',
                render: (r) => (
                  <Stacked
                    title={r.booking?.resource?.title || 'deleted listing'}
                    detail={r.booking?.status}
                    to={r.booking ? `/bookings/detail/${r.booking._id}` : null}
                  />
                ),
              },
              { key: 'payer', header: 'Payer', render: (r) => r.payer?.businessName || '—' },
              { key: 'payee', header: 'Payee', render: (r) => r.payee?.businessName || '—' },
              { key: 'amount', header: 'Amount', align: 'right', render: (r) => <Money amount={r.amount} className="font-medium" /> },
              { key: 'method', header: 'Method', render: (r) => <span className="text-xs text-ink-mute">{r.paymentMethod || '—'}</span> },
              { key: 'paidAt', header: 'Settled', render: (r) => <span className="text-xs text-ink-mute">{r.paidAt ? dateTime(r.paidAt) : '—'}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <span className={`badge-${r.status === 'simulated_paid' ? 'green' : r.status === 'refunded' ? 'red' : 'amber'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                ),
              },
              { key: 'id', header: '', render: (r) => <CopyId value={r._id} /> },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (r) => (
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    title="Refund"
                    disabled={r.status !== 'simulated_paid'}
                    onClick={() => setTarget(r)}
                  >
                    Refund
                  </button>
                ),
              },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}

      <ActionDialog
        open={Boolean(target)}
        title={`Refund ${inr(target?.amount || 0)}?`}
        description="The payment is marked refunded and its booking is cancelled, which releases the reserved inventory back to the provider."
        confirmLabel="Refund and cancel"
        tone="danger"
        requireReason
        reasonLabel="Reason (sent to both parties)"
        busy={refund.isPending}
        onConfirm={apply}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ NEGOTIATIONS */

export function AdminNegotiations() {
  const t = useTable('negotiations');
  const move = t.data?.priceMovement;

  return (
    <div>
      <SectionHeader
        title="Negotiations"
        subtitle="Every counter-offer sent on the platform. Normally only the two parties can read these — here they are the evidence trail for a pricing dispute."
      />

      {move && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Kpi label="Negotiated deals" value={move.negotiatedDeals} sub="Closed after a thread" icon={MessageIcon} tone="teal" />
          <Kpi label="Average quoted" value={inr(move.avgQuoted)} icon={MessageIcon} tone="indigo" />
          <Kpi label="Average agreed" value={inr(move.avgAgreed)} sub={`${move.avgDiscountPct}% below the quote`} icon={MessageIcon} tone="green" />
          <Kpi label="Total conceded" value={inr(move.totalDiscount)} sub="Across all negotiated deals" icon={MessageIcon} tone="amber" />
        </div>
      )}

      <Toolbar>
        <SearchBox className="w-64" value={t.params.q} onChange={(q) => t.set({ q })} placeholder="Search message text…" />
        <Segmented
          value={t.params.type}
          onChange={(type) => t.set({ type })}
          options={[
            { value: '', label: `All (${Object.values(t.data?.byType || {}).reduce((a, b) => a + b, 0)})` },
            { value: 'message', label: `Messages (${t.data?.byType?.message || 0})` },
            { value: 'counter_offer', label: `Counter-offers (${t.data?.byType?.counter_offer || 0})` },
            { value: 'quotation', label: `Quotations (${t.data?.byType?.quotation || 0})` },
          ]}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading negotiations" />
      ) : (
        <>
          <DataTable
            rows={t.data?.messages || []}
            empty="No negotiation messages match these filters."
            columns={[
              { key: 'sender', header: 'From', render: (r) => <Stacked title={r.sender?.businessName || '—'} detail={String(r.type).replace(/_/g, ' ')} /> },
              {
                key: 'booking',
                header: 'On',
                render: (r) => (
                  <Stacked
                    title={r.booking?.resource?.title || 'deleted listing'}
                    detail={`${r.booking?.seeker?.businessName || '?'} ↔ ${r.booking?.provider?.businessName || '?'}`}
                    to={r.booking ? `/bookings/detail/${r.booking._id}` : null}
                  />
                ),
              },
              { key: 'message', header: 'Message', nowrap: false, render: (r) => <span className="text-xs block max-w-[44ch]">{r.message || <span className="text-ink-mute">—</span>}</span> },
              {
                key: 'prices',
                header: 'Quoted → proposed',
                align: 'right',
                render: (r) => (
                  <span className="text-xs">
                    {r.booking?.quotedPrice != null ? inr(r.booking.quotedPrice) : '—'}
                    {r.proposedPrice != null && (
                      <>
                        {' → '}
                        <span className="font-medium">{inr(r.proposedPrice)}</span>
                      </>
                    )}
                  </span>
                ),
              },
              { key: 'outcome', header: 'Settled at', align: 'right', render: (r) => <Money amount={r.booking?.agreedPrice} /> },
              { key: 'status', header: 'Booking', render: (r) => (r.booking?.status ? <Pill status={r.booking.status} /> : '—') },
              { key: 'when', header: 'Sent', render: (r) => <span className="text-xs text-ink-mute" title={dateTime(r.createdAt)}>{relative(r.createdAt)}</span> },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}
    </div>
  );
}

/* Local alias so the KPI tiles above read clearly. */
function MessageIcon(props) {
  return <Scale {...props} />;
}

/* ══════════════════════════════════════════════════════════════════ REVIEWS */

export function AdminReviews() {
  const t = useTable('reviews');
  const { deleteReview } = useAdminActions();
  const [target, setTarget] = useState(null);

  const apply = async () => {
    try {
      await deleteReview.mutateAsync({ id: target._id });
      toast.success('Review removed and ratings recomputed.');
      setTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Reviews"
        subtitle="Removing a review recomputes the denormalised ratings on both the business and the listing, so the numbers on every card stay reproducible from the data."
      />

      <Toolbar>
        <SearchBox className="w-64" value={t.params.q} onChange={(q) => t.set({ q })} placeholder="Search comment text…" />
        <Segmented
          value={t.params.rating}
          onChange={(rating) => t.set({ rating })}
          options={[
            { value: '', label: 'All ratings' },
            { value: '3', label: '3★ and below' },
            { value: '2', label: '2★ and below' },
            { value: '1', label: '1★ only' },
          ]}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading reviews" />
      ) : (
        <>
          <DataTable
            rows={t.data?.reviews || []}
            empty="No reviews match these filters."
            columns={[
              { key: 'rating', header: 'Rating', render: (r) => <span className={`badge-${r.rating >= 4 ? 'green' : r.rating >= 3 ? 'amber' : 'red'}`}><Star size={10} /> {r.rating}</span> },
              { key: 'reviewer', header: 'From', render: (r) => r.reviewer?.businessName || '—' },
              { key: 'reviewee', header: 'About', render: (r) => <Stacked title={r.reviewee?.businessName || '—'} detail={r.resource?.title} to={r.reviewee ? `/provider/${r.reviewee._id}` : null} /> },
              { key: 'comment', header: 'Comment', nowrap: false, render: (r) => <span className="text-xs block max-w-[48ch]">{r.comment || <span className="text-ink-mute">no comment</span>}</span> },
              { key: 'when', header: 'Written', render: (r) => <span className="text-xs text-ink-mute">{relative(r.createdAt)}</span> },
              { key: 'link', header: '', render: (r) => <OpenLink to={`/bookings/detail/${r.booking}`} label="Booking" /> },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (r) => (
                  <button type="button" className="btn-danger btn-sm" title="Remove review" onClick={() => setTarget(r)}>
                    <Trash2 size={12} />
                  </button>
                ),
              },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}

      <ActionDialog
        open={Boolean(target)}
        title="Remove this review?"
        description="It is deleted permanently and the ratings it fed are recomputed from the remaining reviews."
        confirmLabel="Remove review"
        tone="danger"
        busy={deleteReview.isPending}
        onConfirm={apply}
        onClose={() => setTarget(null)}
      >
        {target && (
          <blockquote className="text-sm border-l-2 border-line-strong pl-3 py-1 muted">
            {target.rating}★ — {target.comment || 'no comment'}
          </blockquote>
        )}
      </ActionDialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ BUSINESSES */

export function AdminBusinesses({ onOpen }) {
  const t = useTable('users');
  const { data: meta } = useAdminMeta();

  return (
    <div>
      <SectionHeader
        title="Businesses"
        subtitle="Every account is provider and seeker at once, so earned and spent are shown side by side. Select a row for the full dossier."
      />

      <Toolbar>
        <SearchBox className="w-64" value={t.params.q} onChange={(q) => t.set({ q })} placeholder="Name, email or phone…" />
        <Select
          value={t.params.businessType}
          onChange={(businessType) => t.set({ businessType })}
          placeholder="Any type"
          options={BUSINESS_TYPES}
        />
        <Select
          value={t.params.city}
          onChange={(city) => t.set({ city })}
          placeholder="Any city"
          options={meta?.cities || []}
        />
        <Segmented
          value={t.params.status}
          onChange={(status) => t.set({ status })}
          options={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <Select
          value={t.params.sort}
          onChange={(sort) => t.set({ sort })}
          placeholder="Newest first"
          options={[
            { value: 'name', label: 'Sort: name' },
            { value: 'rating', label: 'Sort: rating' },
          ]}
        />
      </Toolbar>

      {t.isLoading ? (
        <Spinner label="Loading businesses" />
      ) : (
        <>
          <DataTable
            rows={t.data?.users || []}
            onRowClick={(r) => onOpen(r._id)}
            empty="No businesses match these filters."
            columns={[
              {
                key: 'name',
                header: 'Business',
                render: (r) => (
                  <span className="block max-w-[28ch]">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{r.businessName}</span>
                      {r.suspended && <Ban size={12} className="text-red-accent shrink-0" title={r.suspensionReason || 'Suspended'} />}
                    </span>
                    <span className="block text-[11px] text-ink-mute truncate">{r.email}</span>
                  </span>
                ),
              },
              { key: 'type', header: 'Type', render: (r) => <span className="text-xs">{BUSINESS_TYPES.find((b) => b.value === r.businessType)?.label || r.businessType}</span> },
              {
                key: 'city',
                header: 'City',
                render: (r) => (
                  <span className="flex items-center gap-1 text-xs">
                    {r.city || <span className="text-ink-mute">—</span>}
                    {!r.mappable && <AlertTriangle size={10} className="text-amber-accent" title="No coordinates" />}
                  </span>
                ),
              },
              { key: 'listings', header: 'Listings', align: 'right', render: (r) => <span title={`${r.listings} total`}>{r.activeListings}</span> },
              {
                key: 'inbox',
                header: 'Inbox',
                align: 'right',
                render: (r) =>
                  r.pendingInbox ? (
                    <span className="badge-amber">{r.pendingInbox} pending</span>
                  ) : (
                    <span className="text-xs text-ink-mute">clear</span>
                  ),
              },
              { key: 'rfqs', header: 'RFQs', align: 'right', render: (r) => <span title={`${r.requirements} posted`}>{r.openRequirements}</span> },
              { key: 'earned', header: 'Earned', align: 'right', render: (r) => <Money amount={r.earned} /> },
              { key: 'spent', header: 'Spent', align: 'right', render: (r) => <Money amount={r.spent} /> },
              {
                key: 'net',
                header: 'Net',
                align: 'right',
                render: (r) => (
                  <Money amount={r.net} className={r.net > 0 ? 'text-green-accent' : r.net < 0 ? 'text-red-accent' : ''} />
                ),
              },
              { key: 'rating', header: 'Rating', align: 'right', render: (r) => (r.ratingCount ? <span title={`${r.ratingCount} reviews`}>{r.ratingAvg}</span> : <span className="text-xs text-ink-mute">—</span>) },
              { key: 'last', header: 'Last active', render: (r) => <span className="text-xs text-ink-mute">{r.lastActivityAt ? relative(r.lastActivityAt) : '—'}</span> },
            ]}
          />
          <Pager page={t.data?.page} pages={t.data?.pages} total={t.data?.total} onPage={t.setPage} />
        </>
      )}
    </div>
  );
}
