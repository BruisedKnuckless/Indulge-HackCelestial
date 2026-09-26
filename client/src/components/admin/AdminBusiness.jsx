import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Ban, Play, KeyRound, Archive, Star, MapPin, Phone, Mail, Copy,
} from 'lucide-react';
import { useAdminBusiness, useAdminActions } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Spinner } from '../ui';
import { inr, dateTime, dateRange, relative, longDate } from '../../lib/format';
import { CATEGORY_LABELS, BUSINESS_TYPES } from '../../lib/constants';
import { Drawer, Pill, Money, ActionDialog, DataTable, Stacked, CopyId } from './primitives';

/**
 * Everything the platform stores about one business, on one screen.
 *
 * Both marketplace directions sit side by side deliberately: every account is
 * provider and seeker at once, so "what they earn" and "what they spend" are
 * two halves of the same picture and no per-tenant screen shows both.
 */
export default function AdminBusiness({ id, onClose }) {
  const { data, isLoading } = useAdminBusiness(id);
  const actions = useAdminActions();
  const [dialog, setDialog] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [tab, setTab] = useState('activity');

  const b = data?.business;

  const run = async (fn, successMessage) => {
    try {
      const res = await fn();
      toast.success(successMessage);
      setDialog(null);
      return res;
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <Drawer
      open={Boolean(id)}
      title={b?.businessName || 'Business'}
      subtitle={b ? `${typeLabel(b.businessType)} · ${b.location?.city || 'no city'} · joined ${longDate(b.createdAt)}` : ''}
      onClose={onClose}
    >
      {isLoading && <Spinner label="Loading the dossier" />}

      {b && (
        <>
          {/* ── Flags ─────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {b.suspended ? (
              <span className="badge-red">
                <Ban size={11} /> Suspended {b.suspendedAt ? relative(b.suspendedAt) : ''}
              </span>
            ) : (
              <span className="badge-green">Active</span>
            )}
            {b.ratingCount > 0 && (
              <span className="badge-amber">
                <Star size={11} /> {b.ratingAvg} from {b.ratingCount}
              </span>
            )}
            {!b.location?.coordinates?.length && (
              <span className="badge-amber">No coordinates — its listings cannot rank by distance</span>
            )}
          </div>

          {b.suspended && b.suspensionReason && (
            <p className="text-sm text-red-accent border border-red-accent/25 bg-red-accent/5 rounded-lg px-3.5 py-2.5">
              <span className="font-medium">Suspension reason:</span> {b.suspensionReason}
            </p>
          )}

          {/* ── Contact & identity ────────────────────────────────────────── */}
          <section>
            <h3 className="h-card mb-3">Account record</h3>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <Field icon={Mail} label="Email" value={b.email} mono />
              <Field icon={Phone} label="Phone" value={b.phone} />
              <Field label="GST number" value={b.gstNumber} mono />
              <Field label="Business type" value={typeLabel(b.businessType)} />
              <Field icon={MapPin} label="Address" value={b.location?.address} />
              <Field label="City / PIN" value={[b.location?.city, b.location?.pincode].filter(Boolean).join(' · ')} />
              <Field
                label="Coordinates"
                value={b.location?.coordinates?.length ? b.location.coordinates.join(', ') : null}
                mono
              />
              <Field label="Record id" value={b._id} mono />
              <Field label="Notifications" value={`${data.notifications.total} total · ${data.notifications.unread} unread`} />
              <Field
                label="Preferred resource types"
                value={(b.preferences?.preferredResourceTypes || []).map((t) => CATEGORY_LABELS[t] || t).join(', ')}
              />
            </dl>

            {data.preferredProviders?.length > 0 && (
              <div className="mt-4">
                <p className="label">
                  Preferred providers — each one gets a +5% ranking bonus for this business
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.preferredProviders.map((p) => (
                    <Link key={p._id} to={`/provider/${p._id}`} className="tag hover:border-line-strong">
                      {p.businessName}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Money, both directions ────────────────────────────────────── */}
          <section>
            <h3 className="h-card mb-3">Money</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Tile label="Earned as provider" value={inr(sum(data.money, 'receivedIn'))} tone="text-green-accent" />
              <Tile label="Spent as seeker" value={inr(sum(data.money, 'paidOut'))} tone="text-ink" />
              <Tile
                label="Net position"
                value={inr(sum(data.money, 'receivedIn') - sum(data.money, 'paidOut'))}
              />
              <Tile label="Transactions" value={data.money.reduce((n, m) => n + m.count, 0)} />
            </div>
            {data.money.length > 0 && (
              <p className="text-xs text-ink-mute mt-2">
                {data.money.map((m) => `${m.count} ${String(m._id).replace(/_/g, ' ')}`).join(' · ')}
              </p>
            )}
          </section>

          {/* ── Volume ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Tile label="Listings" value={data.listings.length} />
            <Tile label="Requests received" value={data.bookings.provided.length} />
            <Tile label="Requests sent" value={data.bookings.sought.length} />
            <Tile label="RFQs posted" value={data.requirements.length} />
          </div>

          {/* ── Tabs over the long lists ──────────────────────────────────── */}
          <section>
            <div className="flex flex-wrap gap-1 mb-4 border-b border-line">
              {[
                ['activity', `As provider (${data.bookings.provided.length})`],
                ['sought', `As seeker (${data.bookings.sought.length})`],
                ['listings', `Listings (${data.listings.length})`],
                ['rfqs', `RFQs (${data.requirements.length})`],
                ['quotes', `Quotes (${data.proposals.length})`],
                ['reviews', `Reviews (${data.reviews.received.length}/${data.reviews.given.length})`],
                ['threads', `Negotiations (${data.negotiations.length})`],
                ['cart', `Cart (${data.cart.length})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3 h-9 text-xs font-medium -mb-px border-b-2 transition-colors ${
                    tab === key
                      ? 'border-indigo text-ink'
                      : 'border-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'activity' && <BookingList rows={data.bookings.provided} counterpartKey="seeker" />}
            {tab === 'sought' && <BookingList rows={data.bookings.sought} counterpartKey="provider" />}

            {tab === 'listings' && (
              <DataTable
                rows={data.listings}
                empty="This business has no listings."
                columns={[
                  { key: 'title', header: 'Listing', render: (r) => <Stacked title={r.title} detail={CATEGORY_LABELS[r.category] || r.category} to={`/r/${r._id}`} /> },
                  { key: 'qty', header: 'Qty', align: 'right', render: (r) => `${r.totalQuantity} ${r.unit}` },
                  { key: 'price', header: 'Base price', align: 'right', render: (r) => <Money amount={r.pricing?.basePrice} /> },
                  { key: 'windows', header: 'Windows', align: 'right', render: (r) => (r.availabilityWindows?.length || 0) || '—' },
                  { key: 'rating', header: 'Rating', align: 'right', render: (r) => (r.ratingCount ? `${r.ratingAvg} (${r.ratingCount})` : '—') },
                  { key: 'status', header: 'Status', render: (r) => <span className={`badge-${r.status === 'active' ? 'green' : 'muted'}`}>{r.status}</span> },
                ]}
              />
            )}

            {tab === 'rfqs' && (
              <DataTable
                rows={data.requirements}
                empty="This business has posted no requirements."
                columns={[
                  { key: 'title', header: 'Requirement', render: (r) => <Stacked title={r.title} detail={CATEGORY_LABELS[r.category] || r.category} to={`/requirements/${r._id}`} /> },
                  { key: 'window', header: 'Window', render: (r) => <span className="text-xs">{dateRange(r.startDateTime, r.endDateTime)}</span> },
                  { key: 'qty', header: 'Qty', align: 'right', render: (r) => `${r.requiredQuantity ?? r.quantity ?? 1} ${r.unit || ''}` },
                  { key: 'budget', header: 'Budget', align: 'right', render: (r) => <Money amount={r.maxBudget ?? r.maxPrice} /> },
                  { key: 'offers', header: 'Responses', align: 'right', render: (r) => `${r.proposalCount || 0}q / ${(r.offers || []).length}o` },
                  { key: 'status', header: 'Status', render: (r) => <Pill status={r.status} /> },
                ]}
              />
            )}

            {tab === 'quotes' && (
              <DataTable
                rows={data.proposals}
                empty="This business has quoted on no requirements."
                columns={[
                  { key: 'req', header: 'Requirement', render: (r) => <Stacked title={r.requirement?.title || '—'} detail={`offering ${r.resource?.title || '—'}`} to={r.requirement ? `/requirements/${r.requirement._id}` : null} /> },
                  { key: 'quote', header: 'Quoted', align: 'right', render: (r) => <Money amount={r.quotedPrice} /> },
                  { key: 'when', header: 'Sent', render: (r) => <span className="text-xs text-ink-mute">{relative(r.createdAt)}</span> },
                  { key: 'status', header: 'Status', render: (r) => <Pill status={r.status} /> },
                ]}
              />
            )}

            {tab === 'reviews' && (
              <div className="space-y-4">
                <ReviewList title="Received" rows={data.reviews.received} otherKey="reviewer" />
                <ReviewList title="Written" rows={data.reviews.given} otherKey="reviewee" />
              </div>
            )}

            {tab === 'threads' && (
              <DataTable
                rows={data.negotiations}
                empty="This business has sent no negotiation messages."
                columns={[
                  { key: 'type', header: 'Type', render: (r) => <span className="badge-muted">{String(r.type).replace(/_/g, ' ')}</span> },
                  { key: 'msg', header: 'Message', nowrap: false, render: (r) => <span className="text-xs">{r.message || <span className="text-ink-mute">—</span>}</span> },
                  { key: 'price', header: 'Proposed', align: 'right', render: (r) => <Money amount={r.proposedPrice} /> },
                  { key: 'on', header: 'On', render: (r) => <Stacked title={r.booking?.resource?.title || '—'} detail={r.booking?.status} to={r.booking ? `/bookings/detail/${r.booking._id}` : null} /> },
                  { key: 'when', header: 'Sent', render: (r) => <span className="text-xs text-ink-mute">{relative(r.createdAt)}</span> },
                ]}
              />
            )}

            {tab === 'cart' && (
              <DataTable
                rows={data.cart}
                empty="This business has an empty cart."
                columns={[
                  { key: 'res', header: 'Listing', render: (r) => <Stacked title={r.resource?.title || 'removed listing'} detail={r.resource?.status !== 'active' ? `listing is ${r.resource?.status || 'gone'} — cannot check out` : null} to={r.resource ? `/r/${r.resource._id}` : null} /> },
                  { key: 'qty', header: 'Qty', align: 'right', render: (r) => r.quantity },
                  { key: 'window', header: 'Window', render: (r) => <span className="text-xs">{dateRange(r.startDateTime, r.endDateTime)}</span> },
                  { key: 'saved', header: '', render: (r) => (r.savedForLater ? <span className="badge-muted">saved</span> : null) },
                  { key: 'added', header: 'Added', render: (r) => <span className="text-xs text-ink-mute">{relative(r.addedAt)}</span> },
                ]}
              />
            )}
          </section>

          {/* ── Powers ────────────────────────────────────────────────────── */}
          <section className="border-t border-line pt-5">
            <h3 className="h-card mb-1">Administrative actions</h3>
            <p className="text-sm muted mb-4">
              Suspension is enforced centrally at authentication, so it locks every route at once.
              Bookings already committed survive an unlisting on purpose — the business still owes them.
            </p>

            <div className="flex flex-wrap gap-2">
              {b.suspended ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    run(
                      () => actions.suspendBusiness.mutateAsync({ id: b._id, suspended: false }),
                      `${b.businessName} restored.`
                    )
                  }
                  disabled={actions.suspendBusiness.isPending}
                >
                  <Play size={13} /> Restore account
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => setDialog('suspend')}
                >
                  <Ban size={13} /> Suspend account
                </button>
              )}

              <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('unlist')}>
                <Archive size={13} /> Pause all listings
              </button>

              <button type="button" className="btn-secondary btn-sm" onClick={() => setDialog('reset')}>
                <KeyRound size={13} /> Force password reset
              </button>
            </div>

            {tempPassword && (
              <div className="mt-4 border border-amber-accent/30 bg-amber-accent/5 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-amber-accent">Temporary password — shown once</p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="font-mono text-sm bg-surface-sunk border border-line rounded px-2.5 py-1.5">
                    {tempPassword}
                  </code>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(tempPassword);
                      toast.success('Copied');
                    }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <p className="text-xs text-ink-mute mt-2">
                  Pass it to {b.email} over a channel you trust. A real deployment would email a
                  single-use link instead.
                </p>
              </div>
            )}
          </section>

          <ActionDialog
            open={dialog === 'suspend'}
            title={`Suspend ${b.businessName}?`}
            description="They will be signed out of every route immediately and cannot log back in until restored."
            confirmLabel="Suspend"
            tone="danger"
            requireReason
            reasonPlaceholder="Shown on their next sign-in attempt"
            busy={actions.suspendBusiness.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(reason) =>
              run(
                () => actions.suspendBusiness.mutateAsync({ id: b._id, suspended: true, reason }),
                `${b.businessName} suspended.`
              )
            }
          />

          <ActionDialog
            open={dialog === 'unlist'}
            title={`Pause every listing for ${b.businessName}?`}
            description={`${data.listings.filter((l) => l.status === 'active').length} active listing(s) leave the market and any open RFQs close. Accepted and confirmed bookings are kept.`}
            confirmLabel="Pause listings"
            tone="danger"
            requireReason
            busy={actions.unlistBusiness.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(reason) =>
              run(async () => {
                const res = await actions.unlistBusiness.mutateAsync({ id: b._id, status: 'paused', reason });
                return res;
              }, 'Listings paused and open RFQs closed.')
            }
          />

          <ActionDialog
            open={dialog === 'reset'}
            title={`Reset the password for ${b.email}?`}
            description="Their current password stops working at once. The replacement is shown to you only in this response."
            confirmLabel="Generate password"
            busy={actions.resetPassword.isPending}
            onClose={() => setDialog(null)}
            onConfirm={() =>
              run(async () => {
                const res = await actions.resetPassword.mutateAsync({ id: b._id });
                setTempPassword(res.temporaryPassword);
                return res;
              }, 'Password reset.')
            }
          />
        </>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ helpers */

const sum = (rows, key) => (rows || []).reduce((n, r) => n + (r[key] || 0), 0);

const typeLabel = (t) => BUSINESS_TYPES.find((b) => b.value === t)?.label || t || 'Other';

function Field({ icon: Icon, label, value, mono }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-ink-mute flex items-center gap-1 mb-0.5">
        {Icon && <Icon size={11} />}
        {label}
      </dt>
      <dd className={`truncate ${mono ? 'font-mono text-xs' : ''} ${value ? '' : 'text-ink-mute'}`}>
        {value || 'Not set'}
      </dd>
    </div>
  );
}

function Tile({ label, value, tone = '' }) {
  return (
    <div className="border border-line rounded-lg bg-surface-alt px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wider text-ink-mute mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums leading-none ${tone}`}>{value}</p>
    </div>
  );
}

function BookingList({ rows, counterpartKey }) {
  return (
    <DataTable
      rows={rows}
      empty="No requests on this side of the marketplace yet."
      columns={[
        {
          key: 'resource',
          header: 'Listing',
          render: (r) => (
            <Stacked
              title={r.resource?.title || 'deleted listing'}
              detail={CATEGORY_LABELS[r.resource?.category] || r.resource?.category}
              to={`/bookings/detail/${r._id}`}
            />
          ),
        },
        {
          key: 'party',
          header: counterpartKey === 'seeker' ? 'Requested by' : 'Provided by',
          render: (r) => r[counterpartKey]?.businessName || '—',
        },
        { key: 'window', header: 'Window', render: (r) => <span className="text-xs">{dateRange(r.startDateTime, r.endDateTime)}</span> },
        { key: 'qty', header: 'Qty', align: 'right', render: (r) => r.requestedQuantity },
        { key: 'price', header: 'Value', align: 'right', render: (r) => <Money amount={r.agreedPrice ?? r.quotedPrice} /> },
        { key: 'status', header: 'Status', render: (r) => <Pill status={r.status} /> },
      ]}
    />
  );
}

function ReviewList({ title, rows, otherKey }) {
  return (
    <div>
      <p className="label">
        {title} ({rows.length})
      </p>
      {!rows.length ? (
        <p className="text-sm muted">None.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r._id} className="border border-line rounded-lg bg-surface-alt px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{r[otherKey]?.businessName || '—'}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="badge-amber">
                    <Star size={10} /> {r.rating}
                  </span>
                  <span className="text-[11px] text-ink-mute">{dateTime(r.createdAt)}</span>
                  <CopyId value={r._id} />
                </span>
              </div>
              {r.comment && <p className="text-xs muted mt-1.5">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
