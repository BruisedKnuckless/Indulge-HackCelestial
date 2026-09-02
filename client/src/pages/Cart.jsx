import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCart, useCartMutations } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { Price, Panel, Spinner, Alert } from '../components/ui';
import { PRICE_UNIT_LABELS, resourceImage } from '../lib/constants';
import { inr, dateRange, toLocalInput } from '../lib/format';

function CartLine({ item, onUpdate, onRemove }) {
  const r = item.resource;
  const unit = PRICE_UNIT_LABELS[r.pricing?.priceUnit] || '';

  return (
    <div className="flex gap-4 py-4 border-b border-bd last:border-0">
      <Link to={`/r/${r._id}`} className="shrink-0">
        <img
          src={resourceImage(r)}
          alt={r.title}
          className="w-[140px] h-[140px] object-contain bg-white"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/r/${r._id}`} className="text-title a-link block leading-snug">
          {r.title}
        </Link>

        <p className="text-base text-ink-soft mt-0.5">by {r.owner?.businessName}</p>

        {item.available ? (
          <p className="text-base text-success font-bold mt-0.5">Available for your dates</p>
        ) : (
          <p className="text-base text-danger font-bold mt-0.5">{item.unavailableReason}</p>
        )}

        <p className="text-base text-ink-soft mt-1">
          {dateRange(item.startDateTime, item.endDateTime)}
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <label className="flex items-center gap-1.5 text-base">
            <span className="text-ink-soft">Qty:</span>
            <select
              value={item.quantity}
              onChange={(e) => onUpdate({ itemId: item._id, quantity: Number(e.target.value) })}
              className="a-select"
            >
              {Array.from({ length: Math.min(r.totalQuantity, 30) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <span className="text-bd">|</span>

          <button onClick={() => onRemove(item._id)} className="a-link text-base">
            Delete
          </button>

          <span className="text-bd">|</span>

          <button
            onClick={() => onUpdate({ itemId: item._id, savedForLater: !item.savedForLater })}
            className="a-link text-base"
          >
            {item.savedForLater ? 'Move to cart' : 'Save for later'}
          </button>
        </div>

        {/* Inline date editing keeps the cart usable without going back to the PDP. */}
        <div className="flex flex-wrap gap-3 mt-2">
          <label className="text-mini text-ink-soft">
            From
            <input
              type="datetime-local"
              value={toLocalInput(item.startDateTime)}
              onChange={(e) =>
                onUpdate({
                  itemId: item._id,
                  startDateTime: new Date(e.target.value).toISOString(),
                })
              }
              className="a-input mt-0.5 w-[190px]"
            />
          </label>
          <label className="text-mini text-ink-soft">
            To
            <input
              type="datetime-local"
              value={toLocalInput(item.endDateTime)}
              onChange={(e) =>
                onUpdate({ itemId: item._id, endDateTime: new Date(e.target.value).toISOString() })
              }
              className="a-input mt-0.5 w-[190px]"
            />
          </label>
        </div>
      </div>

      <div className="text-right shrink-0">
        <Price amount={item.estimatedPrice} size="md" />
        <p className="text-mini text-ink-soft mt-0.5">
          {inr(r.pricing?.basePrice)}
          {unit}
        </p>
      </div>
    </div>
  );
}

export default function Cart() {
  const { data, isLoading } = useCart();
  const { update, remove } = useCartMutations();
  const navigate = useNavigate();

  if (isLoading) return <Spinner label="Loading your cart" />;

  const items = data?.items || [];
  const active = items.filter((i) => !i.savedForLater);
  const saved = items.filter((i) => i.savedForLater);
  const blocked = active.filter((i) => !i.available);

  const onUpdate = async (patch) => {
    try {
      await update.mutateAsync(patch);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the item.'));
    }
  };

  const onRemove = async (itemId) => {
    try {
      await remove.mutateAsync(itemId);
      toast.success('Removed from cart');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page-shell py-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="bg-white p-5">
          <div className="flex items-baseline justify-between border-b border-bd pb-2 mb-2">
            <h1 className="text-page font-normal">Request Cart</h1>
            <span className="text-base text-ink-soft">Price</span>
          </div>

          {active.length === 0 && saved.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-title font-bold mb-1">Your Indulge cart is empty</p>
              <p className="text-base text-ink-soft mb-4">
                Add resources from search or a listing page and request them together.
              </p>
              <Link to="/s" className="btn-yellow btn-pill">
                Browse resources
              </Link>
            </div>
          ) : (
            <>
              {blocked.length > 0 && (
                <Alert tone="error" className="mb-3">
                  {blocked.length} item{blocked.length > 1 ? 's are' : ' is'} no longer available for
                  the selected dates. Adjust the dates or remove{' '}
                  {blocked.length > 1 ? 'them' : 'it'} before requesting.
                </Alert>
              )}

              {active.map((item) => (
                <CartLine key={item._id} item={item} onUpdate={onUpdate} onRemove={onRemove} />
              ))}

              <div className="text-right pt-3 text-title">
                Subtotal ({active.length} item{active.length === 1 ? '' : 's'}):{' '}
                <span className="font-bold">{inr(data.subtotal)}</span>
              </div>
            </>
          )}

          {saved.length > 0 && (
            <div className="mt-8">
              <h2 className="text-section font-bold border-b border-bd pb-2 mb-2">
                Saved for later ({saved.length})
              </h2>
              {saved.map((item) => (
                <CartLine key={item._id} item={item} onUpdate={onUpdate} onRemove={onRemove} />
              ))}
            </div>
          )}
        </div>

        {active.length > 0 && (
          <div>
            <Panel className="p-4 sticky top-[120px]">
              {blocked.length === 0 ? (
                <p className="text-base text-success mb-2">
                  All items available for your dates
                </p>
              ) : (
                <p className="text-base text-danger mb-2">
                  Resolve {blocked.length} unavailable item{blocked.length > 1 ? 's' : ''}
                </p>
              )}

              <p className="text-title mb-3">
                Subtotal ({active.length} item{active.length === 1 ? '' : 's'}):{' '}
                <span className="font-bold">{inr(data.subtotal)}</span>
              </p>

              <button
                onClick={() => navigate('/checkout')}
                disabled={blocked.length > 0}
                className="btn-yellow btn-pill w-full"
              >
                Proceed to Request
              </button>

              <p className="text-mini text-ink-soft mt-3">
                Requests are sent to each provider for approval. Nothing is charged until a booking
                is confirmed.
              </p>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
