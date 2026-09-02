import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/client';
import { useResource, useCartMutations, useBookingActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { Price, Stars, Panel, Spinner, Alert, DealBadge } from '../components/ui';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { CATEGORY_LABELS, PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { toLocalInput, defaultWindow, durationHours, relative, inr } from '../lib/format';

export default function ResourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useResource(id);
  const { add } = useCartMutations();
  const { create } = useBookingActions();

  const [imgIndex, setImgIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const initial = useMemo(() => defaultWindow(7, 10, 10), []);
  const [start, setStart] = useState(toLocalInput(initial.start));
  const [end, setEnd] = useState(toLocalInput(initial.end));

  const resource = data?.resource;
  const reviews = data?.reviews || [];

  // Live availability for the chosen window — this is what the buy box reports.
  const { data: check } = useQuery({
    queryKey: ['check', id, start, end],
    queryFn: async () =>
      (
        await api.get(`/resources/${id}/check`, {
          params: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        })
      ).data,
    enabled: Boolean(id && start && end),
  });

  if (isLoading) return <Spinner label="Loading resource" />;
  if (!resource) return <div className="page-shell py-8">Resource not found.</div>;

  const owner = resource.owner || {};
  const isOwn = user && String(owner._id) === String(user._id);
  const unit = PRICE_UNIT_LABELS[resource.pricing?.priceUnit] || '';
  const hours = durationHours(start, end);
  const minHours = resource.pricing?.minRentalPeriodHours || 0;
  const tooShort = minHours > 0 && hours < minHours;
  const available = check?.available ?? resource.totalQuantity;
  const enough = available >= quantity;

  const payload = () => ({
    resourceId: resource._id,
    quantity,
    startDateTime: new Date(start).toISOString(),
    endDateTime: new Date(end).toISOString(),
  });

  const requireLogin = () => {
    if (!user) {
      toast.error('Sign in to request resources.');
      navigate('/login', { state: { from: `/r/${id}` } });
      return true;
    }
    return false;
  };

  const addToCart = async () => {
    if (requireLogin()) return;
    setBusy(true);
    try {
      await add.mutateAsync(payload());
      toast.success('Added to your request cart');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add to cart.'));
    } finally {
      setBusy(false);
    }
  };

  const requestNow = async () => {
    if (requireLogin()) return;
    setBusy(true);
    try {
      const { booking } = await create.mutateAsync(payload());
      toast.success('Request sent to the provider');
      navigate(`/bookings/detail/${booking._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the request.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white">
      <div className="page-shell py-4">
        {/* Breadcrumb */}
        <p className="text-mini text-ink-soft mb-3">
          <Link to="/s" className="a-link">
            All resources
          </Link>
          {' › '}
          <Link to={`/s?category=${resource.category}`} className="a-link">
            {CATEGORY_LABELS[resource.category]}
          </Link>
          {' › '}
          <span>{resource.title}</span>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)_320px] gap-6">
          {/* ------------------------------------------------- gallery */}
          <div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 shrink-0">
                {(resource.images || []).slice(0, 5).map((src, i) => (
                  <button
                    key={src + i}
                    onMouseEnter={() => setImgIndex(i)}
                    onClick={() => setImgIndex(i)}
                    className={`w-[42px] h-[42px] rounded border-2 overflow-hidden ${
                      i === imgIndex ? 'border-link' : 'border-bd'
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="flex-1 bg-[#F7F8F8] rounded overflow-hidden">
                <img
                  src={resourceImage(resource, imgIndex)}
                  alt={resource.title}
                  className="w-full h-[380px] object-cover"
                />
              </div>
            </div>
          </div>

          {/* ------------------------------------------------- details */}
          <div className="min-w-0">
            <h1 className="text-page font-normal leading-tight mb-1">{resource.title}</h1>

            <Link to={`/provider/${owner._id}`} className="a-link text-body">
              Visit the {owner.businessName} listings
            </Link>

            {/* An unrated listing shows a prompt rather than five empty stars,
                which otherwise reads as a bad rating. */}
            <div className="flex items-center gap-2 mt-1 mb-3">
              {resource.ratingCount > 0 ? (
                <>
                  <Stars rating={resource.ratingAvg} count={resource.ratingCount} linkTo="#reviews" />
                  <span className="text-base text-ink-soft">
                    {resource.ratingAvg.toFixed(1)} out of 5
                  </span>
                </>
              ) : (
                <span className="text-base text-ink-soft">No reviews yet</span>
              )}
            </div>

            <hr className="border-0 border-t border-bd mb-3" />

            <div className="mb-3">
              <Price amount={resource.pricing?.basePrice} unit={unit} size="lg" />
              {minHours > 1 && (
                <p className="text-base text-ink-soft mt-1">
                  Minimum hire {minHours} hours
                </p>
              )}
            </div>

            <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-base mb-4">
              <dt className="font-bold">Category</dt>
              <dd>{CATEGORY_LABELS[resource.category]}</dd>

              <dt className="font-bold">Total quantity</dt>
              <dd>
                {resource.totalQuantity} {resource.unit}
                {resource.totalQuantity > 1 ? 's' : ''}
              </dd>

              {resource.capacity && (
                <>
                  <dt className="font-bold">Capacity</dt>
                  <dd>{resource.capacity} guests</dd>
                </>
              )}

              <dt className="font-bold">Location</dt>
              <dd>
                {resource.location?.address}
                {resource.location?.city ? `, ${resource.location.city}` : ''}
              </dd>
            </dl>

            {resource.highlights?.length > 0 && (
              <div className="mb-4">
                <h2 className="text-lead font-bold mb-1">About this resource</h2>
                <ul className="list-disc pl-5 space-y-0.5 text-base">
                  {resource.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {resource.description && (
              <p className="text-base text-ink-soft mb-4">{resource.description}</p>
            )}

            {resource.conditions && (
              <Alert tone="warn" className="mb-4">
                <span className="font-bold">Conditions: </span>
                {resource.conditions}
              </Alert>
            )}

            {resource.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {resource.tags.map((t) => (
                  <Link
                    key={t}
                    to={`/s?q=${encodeURIComponent(t)}`}
                    className="text-mini border border-bd rounded-full px-2.5 py-0.5 hover:bg-[#F7FAFA]"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ------------------------------------------------- buy box */}
          <div>
            <Panel className="p-4 sticky top-[120px]">
              <Price amount={resource.pricing?.basePrice} unit={unit} size="md" />

              <p
                className={`text-title mt-2 mb-3 ${enough && !tooShort ? 'text-success' : 'text-danger'}`}
              >
                {tooShort
                  ? `Minimum hire is ${minHours} hours`
                  : enough
                    ? 'Available for your dates'
                    : available > 0
                      ? `Only ${available} available`
                      : 'Fully booked for these dates'}
              </p>

              {check && (
                <p className="text-base text-ink-soft mb-3">
                  {check.available} of {check.total} {resource.unit}
                  {check.total > 1 ? 's' : ''} free in this window
                </p>
              )}

              <div className="space-y-2 mb-3">
                <div>
                  <label className="a-label" htmlFor="start">
                    From
                  </label>
                  <input
                    id="start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="a-input"
                  />
                </div>
                <div>
                  <label className="a-label" htmlFor="end">
                    To
                  </label>
                  <input
                    id="end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="a-input"
                  />
                </div>
                <div>
                  <label className="a-label" htmlFor="qty">
                    Quantity
                  </label>
                  <select
                    id="qty"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="a-select w-full"
                  >
                    {Array.from(
                      { length: Math.min(resource.totalQuantity, 20) },
                      (_, i) => i + 1
                    ).map((n) => (
                      <option key={n} value={n}>
                        Qty: {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hours > 0 && (
                <p className="text-base text-ink-soft mb-3">
                  {hours.toFixed(0)} hour hire ·{' '}
                  <span className="font-bold text-ink">
                    est. {inr(estimate(resource, quantity, hours))}
                  </span>
                </p>
              )}

              {isOwn ? (
                <Alert tone="info">
                  This is your own listing.{' '}
                  <Link to={`/listings/${resource._id}/edit`} className="a-link">
                    Edit it
                  </Link>
                  .
                </Alert>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={addToCart}
                    disabled={busy || tooShort || !enough}
                    className="btn-yellow btn-pill w-full"
                  >
                    Add to Request Cart
                  </button>
                  <button
                    onClick={requestNow}
                    disabled={busy || tooShort || !enough}
                    className="btn-orange btn-pill w-full"
                  >
                    Request Now
                  </button>
                </div>
              )}

              <hr className="my-3 border-0 border-t border-bd" />

              <dl className="text-mini space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Provider</dt>
                  <dd className="text-right">
                    <Link to={`/provider/${owner._id}`} className="a-link">
                      {owner.businessName}
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Ships from</dt>
                  <dd className="text-right">{resource.location?.city}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-soft">Payment</dt>
                  <dd className="text-right">On confirmation</dd>
                </div>
              </dl>
            </Panel>
          </div>
        </div>

        {/* ---------------------------------------------- availability */}
        <div className="mt-8">
          <h2 className="text-section font-bold mb-3">Availability calendar</h2>
          <AvailabilityCalendar resourceId={resource._id} />
        </div>

        {/* --------------------------------------------------- reviews */}
        <div id="reviews" className="mt-8 max-w-[860px]">
          <h2 className="text-section font-bold mb-3">Customer reviews</h2>

          {reviews.length === 0 ? (
            <p className="text-base text-ink-soft">
              No reviews yet. Reviews appear once a booking is completed.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Stars rating={resource.ratingAvg} size={20} />
                <span className="text-title">
                  {resource.ratingAvg.toFixed(1)} out of 5
                </span>
                <span className="text-base text-ink-soft">
                  {resource.ratingCount} rating{resource.ratingCount === 1 ? '' : 's'}
                </span>
              </div>

              {reviews.map((rev) => (
                <div key={rev._id} className="border-t border-bd pt-4">
                  <p className="text-base font-bold mb-0.5">{rev.reviewer?.businessName}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <Stars rating={rev.rating} size={14} />
                    {rev.title && <span className="text-base font-bold">{rev.title}</span>}
                  </div>
                  <p className="text-mini text-ink-soft mb-1">Reviewed {relative(rev.createdAt)}</p>
                  <p className="text-base">{rev.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mirrors the server's estimatePrice so the buy box preview matches the cart. */
function estimate(resource, quantity, hours) {
  const base = resource.pricing?.basePrice || 0;
  switch (resource.pricing?.priceUnit) {
    case 'per_hour':
      return base * Math.max(1, Math.ceil(hours)) * quantity;
    case 'per_day':
      return base * Math.max(1, Math.ceil(hours / 24)) * quantity;
    case 'per_unit':
      return base * quantity * Math.max(1, Math.ceil(hours / 24));
    default:
      return base * quantity;
  }
}
