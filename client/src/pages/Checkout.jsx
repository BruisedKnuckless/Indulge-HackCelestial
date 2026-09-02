import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCart, useCartMutations } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Panel, Spinner, Alert, Price } from '../components/ui';
import { resourceImage } from '../lib/constants';
import { inr, dateRange } from '../lib/format';

/** Numbered section, the way a checkout funnel segments its steps. */
function Step({ n, title, children, aside }) {
  return (
    <div className="bg-white p-5 mb-3">
      <div className="flex gap-3">
        <span className="text-section font-bold text-ink-soft shrink-0">{n}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-section font-bold mb-2">{title}</h2>
          {children}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </div>
  );
}

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useCart();
  const { checkout } = useCartMutations();

  const [urgency, setUrgency] = useState('medium');
  const [logistics, setLogistics] = useState('self_pickup');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => (data?.items || []).filter((i) => !i.savedForLater), [data]);

  // Requests fan out per provider, so group the review list the same way.
  const byProvider = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const owner = item.resource?.owner;
      const key = String(owner?._id || 'unknown');
      if (!map.has(key)) map.set(key, { owner, items: [] });
      map.get(key).items.push(item);
    }
    return [...map.values()];
  }, [items]);

  if (isLoading) return <Spinner label="Loading checkout" />;

  if (items.length === 0) {
    return (
      <div className="page-shell py-8">
        <div className="bg-white p-8 text-center">
          <p className="text-title font-bold mb-2">Nothing to request</p>
          <Link to="/s" className="btn-yellow btn-pill">
            Browse resources
          </Link>
        </div>
      </div>
    );
  }

  const blocked = items.filter((i) => !i.available);

  const placeRequest = async () => {
    setBusy(true);
    try {
      const result = await checkout.mutateAsync({ urgency, logistics, notes });

      if (result.created > 0) {
        toast.success(
          `${result.created} request${result.created > 1 ? 's' : ''} sent to ${byProvider.length} provider${byProvider.length > 1 ? 's' : ''}`
        );
      }
      if (result.failed?.length) {
        toast.error(`${result.failed.length} item(s) could not be requested.`);
      }
      navigate('/bookings/sent');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not place the request.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="border-b border-bd">
        <div className="page-shell py-3 flex items-baseline justify-between">
          <h1 className="text-page font-normal">
            Review your request ({items.length} item{items.length === 1 ? '' : 's'})
          </h1>
          <Link to="/cart" className="a-link text-base">
            Back to cart
          </Link>
        </div>
      </div>

      <div className="page-shell py-4 bg-ground">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div>
            <Step n="1" title="Requesting business">
              <p className="text-base font-bold">{user.businessName}</p>
              <p className="text-base text-ink-soft">
                {user.location?.address}
                {user.location?.city ? `, ${user.location.city}` : ''}{' '}
                {user.location?.pincode}
              </p>
              <p className="text-base text-ink-soft">{user.phone || 'No phone on file'}</p>
              <Link to="/account/profile" className="a-link text-base mt-1 inline-block">
                Change
              </Link>
            </Step>

            <Step n="2" title="Logistics & priority">
              <fieldset className="mb-4">
                <legend className="a-label mb-1">How will the resource be moved?</legend>
                {[
                  ['self_pickup', 'We will collect and return it ourselves'],
                  ['provider_transport', 'Ask the provider to arrange transport'],
                ].map(([value, label]) => (
                  <label key={value} className="flex items-start gap-2 text-base py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="logistics"
                      value={value}
                      checked={logistics === value}
                      onChange={(e) => setLogistics(e.target.value)}
                      className="mt-1"
                    />
                    {label}
                  </label>
                ))}
                <p className="text-mini text-ink-mute mt-1">
                  Transport costs are agreed with the provider and are not included in the estimate.
                </p>
              </fieldset>

              <fieldset>
                <legend className="a-label mb-1">How urgent is this?</legend>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="a-select w-full max-w-[280px]"
                >
                  <option value="low">Planning ahead — no rush</option>
                  <option value="medium">Normal</option>
                  <option value="high">Urgent — needed within 24 hours</option>
                </select>
                <p className="text-mini text-ink-mute mt-1">
                  Urgent requests are flagged at the top of the provider’s inbox.
                </p>
              </fieldset>

              <div className="mt-4">
                <label htmlFor="notes" className="a-label">
                  Notes for the provider (optional)
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Event details, access timings, setup requirements…"
                  className="a-textarea max-w-[560px]"
                />
              </div>
            </Step>

            <Step n="3" title={`Review items — ${byProvider.length} provider${byProvider.length > 1 ? 's' : ''}`}>
              {blocked.length > 0 && (
                <Alert tone="error" className="mb-3">
                  {blocked.length} item{blocked.length > 1 ? 's are' : ' is'} unavailable and will be
                  skipped. Go back to the cart to fix the dates.
                </Alert>
              )}

              <div className="space-y-4">
                {byProvider.map(({ owner, items: group }) => (
                  <div key={owner?._id} className="border border-bd rounded">
                    <div className="bg-[#F0F2F2] px-3 py-1.5 text-base font-bold border-b border-bd">
                      Request to {owner?.businessName}
                      <span className="font-normal text-ink-soft">
                        {' '}
                        · {group.length} item{group.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {group.map((item) => (
                      <div key={item._id} className="flex gap-3 p-3 border-b border-bd last:border-0">
                        <img
                          src={resourceImage(item.resource)}
                          alt=""
                          className="w-[70px] h-[70px] object-cover rounded shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold line-clamp-1">{item.resource.title}</p>
                          <p className="text-mini text-ink-soft">
                            {dateRange(item.startDateTime, item.endDateTime)}
                          </p>
                          <p className="text-mini text-ink-soft">Quantity: {item.quantity}</p>
                          {!item.available && (
                            <p className="text-mini text-danger font-bold mt-0.5">
                              {item.unavailableReason}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <Price amount={item.estimatedPrice} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Step>
          </div>

          <div>
            <Panel className="p-4 sticky top-[120px]">
              <button
                onClick={placeRequest}
                disabled={busy || items.length === blocked.length}
                className="btn-yellow btn-pill w-full mb-3"
              >
                {busy ? 'Sending…' : 'Place your request'}
              </button>

              <p className="text-mini text-ink-soft mb-3">
                By placing this request you agree to Indulge’s Conditions of Use. Providers must
                accept before anything is confirmed.
              </p>

              <hr className="border-0 border-t border-bd mb-3" />

              <h2 className="text-lead font-bold mb-2">Request summary</h2>
              <dl className="text-base space-y-1">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Items</dt>
                  <dd>{items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Providers</dt>
                  <dd>{byProvider.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Estimated total</dt>
                  <dd>{inr(data.subtotal)}</dd>
                </div>
              </dl>

              <hr className="border-0 border-t border-bd my-3" />

              <div className="flex justify-between text-title text-danger font-bold">
                <span>Order total</span>
                <span>{inr(data.subtotal)}</span>
              </div>

              <p className="text-mini text-ink-mute mt-2">
                Estimates only. Final pricing is set when each provider accepts or counter-offers.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
