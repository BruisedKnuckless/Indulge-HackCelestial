import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useRequirement, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Spinner, Stars, Price, Alert, EmptyState } from '../components/ui';
import { CATEGORY_LABELS, resourceImage } from '../lib/constants';
import { inr, dateRange, relative } from '../lib/format';

export default function RequirementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useRequirement(id);
  const { acceptOffer, withdrawOffer, close } = useRequirementActions();
  const [busy, setBusy] = useState('');

  if (isLoading) return <Spinner label="Loading requirement" />;

  const r = data?.requirement;
  if (!r) return <div className="shell pt-12 pb-20">Requirement not found.</div>;

  const isOwner = String(r.seeker?._id) === String(user._id);
  const offers = r.offers || [];
  const liveOffers = offers.filter((o) => o.status === 'offered');

  const accept = async (offerId) => {
    setBusy(offerId);
    try {
      const { booking } = await acceptOffer.mutateAsync({ id, offerId });
      toast.success('Offer accepted — booking created');
      navigate(`/bookings/detail/${booking._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept the offer.'));
    } finally {
      setBusy('');
    }
  };

  const withdraw = async (offerId) => {
    setBusy(offerId);
    try {
      await withdrawOffer.mutateAsync({ id, offerId });
      toast.success('Offer withdrawn');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const closeIt = async () => {
    if (!window.confirm('Close this requirement? Providers will no longer be able to offer.')) return;
    try {
      await close.mutateAsync(id);
      toast.success('Requirement closed');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="shell pt-12 pb-20 max-w-[900px]">
      <p className="text-sm muted mb-6">
        <Link to={isOwner ? '/requirements' : '/requirements/board'} className="link">
          {isOwner ? 'Your requirements' : 'Open requirements'}
        </Link>
        {' / '}
        <span>{r.title}</span>
      </p>

      <header className="pb-8 border-b border-line">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="tag capitalize">{r.status}</span>
              {r.urgency === 'high' && r.status === 'open' && (
                <span className="text-xs text-danger">Urgent</span>
              )}
            </div>
            <h1 className="h-page">{r.title}</h1>
            <p className="text-sm muted mt-3">
              {CATEGORY_LABELS[r.category]} · qty {r.quantity} ·{' '}
              {dateRange(r.startDateTime, r.endDateTime)}
              {r.maxPrice ? ` · budget ${inr(r.maxPrice)}` : ''}
              {r.minCapacity ? ` · capacity ${r.minCapacity}+` : ''}
            </p>
            <p className="text-sm muted mt-1">
              Posted by {r.seeker?.businessName} · {relative(r.createdAt)}
            </p>
          </div>

          {isOwner && r.status === 'open' && (
            <button onClick={closeIt} className="btn-ghost btn-sm shrink-0">
              Close requirement
            </button>
          )}
        </div>

        {r.description && <p className="text-base muted mt-5 max-w-prose">{r.description}</p>}
      </header>

      {r.status === 'fulfilled' && (
        <Alert tone="success" className="mt-8">
          This requirement was fulfilled.{' '}
          {r.fulfilledBooking && (
            <Link to={`/bookings/detail/${r.fulfilledBooking}`} className="link">
              View the booking
            </Link>
          )}
        </Alert>
      )}

      <section className="mt-10">
        <h2 className="h-section mb-6">
          Offers {offers.length > 0 && <span className="muted font-normal">({offers.length})</span>}
        </h2>

        {offers.length === 0 ? (
          <EmptyState
            title="No offers yet"
            message={
              isOwner
                ? 'Providers who can supply this will respond here. You will get a notification.'
                : 'Be the first to offer against this requirement.'
            }
          />
        ) : (
          <div className="border-t border-line">
            {offers.map((o) => {
              const isMine = String(o.provider?._id) === String(user._id);
              const res = o.resource || {};
              return (
                <div key={o._id} className="flex flex-col sm:flex-row gap-5 py-6 border-b border-line">
                  <Link to={`/r/${res._id}`} className="shrink-0">
                    <img
                      src={resourceImage(res)}
                      alt={res.title}
                      className="w-full sm:w-[110px] h-[90px] object-cover rounded bg-surface-sunk"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/r/${res._id}`}
                      className="text-base font-medium hover:underline underline-offset-4"
                    >
                      {res.title}
                    </Link>
                    <p className="text-sm muted mt-0.5">
                      <Link to={`/provider/${o.provider?._id}`} className="link-quiet">
                        {o.provider?.businessName}
                      </Link>
                      {isMine && ' · your offer'}
                    </p>
                    {o.provider?.ratingCount > 0 && (
                      <Stars
                        rating={o.provider.ratingAvg}
                        count={o.provider.ratingCount}
                        size={13}
                        className="mt-1"
                      />
                    )}
                    {o.message && <p className="text-sm muted mt-2 max-w-prose">“{o.message}”</p>}
                    <p className="text-xs text-ink-mute mt-2">
                      {relative(o.createdAt)}
                      {o.status !== 'offered' && ` · ${o.status}`}
                    </p>
                  </div>

                  <div className="shrink-0 sm:text-right flex sm:flex-col items-start sm:items-end gap-3">
                    <Price amount={o.price} />
                    {r.maxPrice != null && (
                      <span
                        className={`text-xs ${o.price <= r.maxPrice ? 'text-success' : 'text-danger'}`}
                      >
                        {o.price <= r.maxPrice ? 'Within budget' : 'Over budget'}
                      </span>
                    )}

                    {isOwner && r.status === 'open' && o.status === 'offered' && (
                      <button
                        onClick={() => accept(o._id)}
                        disabled={Boolean(busy)}
                        className="btn-primary btn-sm"
                      >
                        {busy === o._id ? 'Accepting…' : 'Accept offer'}
                      </button>
                    )}

                    {isMine && o.status === 'offered' && (
                      <button
                        onClick={() => withdraw(o._id)}
                        disabled={Boolean(busy)}
                        className="btn-ghost btn-sm"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isOwner && liveOffers.length > 1 && (
          <p className="text-sm muted mt-6">
            Accepting one offer declines the rest and creates the booking straight away — the
            provider has already agreed these terms.
          </p>
        )}
      </section>
    </div>
  );
}
