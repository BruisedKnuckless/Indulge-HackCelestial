import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import api, { errorMessage } from '../api/client';
import { useResource } from '../hooks/queries';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES, PRICE_UNITS, UNITS } from '../lib/constants';
import { toLocalInput } from '../lib/format';

const BLANK = {
  title: '',
  category: 'banquet_space',
  description: '',
  highlights: '',
  totalQuantity: 1,
  unit: 'unit',
  capacity: '',
  basePrice: '',
  priceUnit: 'per_day',
  minRentalPeriodHours: 1,
  conditions: '',
  tags: '',
  images: '',
  availabilityWindows: [],
};

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-mute mt-1">{hint}</p>}
    </div>
  );
}

export default function ListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = Boolean(id);

  const { data, isLoading } = useResource(id);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Flatten the nested resource shape into the flat form state.
  useEffect(() => {
    const r = data?.resource;
    if (!r) return;
    setForm({
      title: r.title || '',
      category: r.category || 'banquet_space',
      description: r.description || '',
      highlights: (r.highlights || []).join('\n'),
      totalQuantity: r.totalQuantity ?? 1,
      unit: r.unit || 'unit',
      capacity: r.capacity ?? '',
      basePrice: r.pricing?.basePrice ?? '',
      priceUnit: r.pricing?.priceUnit || 'per_day',
      minRentalPeriodHours: r.pricing?.minRentalPeriodHours ?? 1,
      conditions: r.conditions || '',
      tags: (r.tags || []).join(', '),
      images: (r.images || []).join('\n'),
      availabilityWindows: (r.availabilityWindows || []).map((w) => ({
        start: toLocalInput(w.start),
        end: toLocalInput(w.end),
      })),
    });
  }, [data]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addWindow = () =>
    setForm((f) => ({ ...f, availabilityWindows: [...f.availabilityWindows, { start: '', end: '' }] }));

  const updateWindow = (index, key, value) =>
    setForm((f) => ({
      ...f,
      availabilityWindows: f.availabilityWindows.map((w, i) =>
        i === index ? { ...w, [key]: value } : w
      ),
    }));

  const removeWindow = (index) =>
    setForm((f) => ({
      ...f,
      availabilityWindows: f.availabilityWindows.filter((_, i) => i !== index),
    }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    const payload = {
      title: form.title,
      category: form.category,
      description: form.description,
      highlights: form.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
      totalQuantity: Number(form.totalQuantity) || 1,
      unit: form.unit,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      pricing: {
        basePrice: Number(form.basePrice),
        priceUnit: form.priceUnit,
        minRentalPeriodHours: Number(form.minRentalPeriodHours) || 1,
      },
      conditions: form.conditions,
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      images: form.images.split('\n').map((s) => s.trim()).filter(Boolean),
      // Empty means "always bookable"; only fully-filled rows are sent.
      availabilityWindows: form.availabilityWindows
        .filter((w) => w.start && w.end)
        .map((w) => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() })),
    };

    try {
      if (editing) {
        await api.patch(`/resources/${id}`, payload);
        toast.success('Listing updated');
      } else {
        await api.post('/resources', payload);
        toast.success('Listing published');
      }
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['resource', id] });
      navigate('/listings');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the listing.'));
    } finally {
      setBusy(false);
    }
  };

  if (editing && isLoading) return <Spinner label="Loading listing" />;

  return (
    <div className="shell pt-12 pb-20 max-w-prose">
      <p className="text-xs text-ink-soft mb-3">
        <Link to="/listings" className="link">
          Your listings
        </Link>
        {' › '}
        <span>{editing ? 'Edit listing' : 'New listing'}</span>
      </p>

      <div className="card">
        <h1 className="h-page mb-2">
          {editing ? 'Edit your listing' : 'List a resource'}
        </h1>
        <p className="text-base text-ink-soft mb-5">
          Businesses nearby will see this in search, ranked by price, distance, availability and fit.
        </p>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        <form onSubmit={submit}>
          <Field label="Title" hint="What another business would search for, e.g. “Crystal Ballroom — 500 guests”.">
            <input value={form.title} onChange={set('title')} className="field" required />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="Category">
              <select value={form.category} onChange={set('category')} className="field-select w-full">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Guest capacity" hint="Leave blank if capacity does not apply.">
              <input
                type="number"
                min="0"
                value={form.capacity}
                onChange={set('capacity')}
                className="field"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={4}
              value={form.description}
              onChange={set('description')}
              className="field-area"
            />
          </Field>

          <Field label="Highlights" hint="One per line — these appear as bullet points on the listing.">
            <textarea
              rows={4}
              value={form.highlights}
              onChange={set('highlights')}
              className="field-area"
              placeholder={'Pillarless 6,500 sq ft floor\nIn-house stage & lighting'}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field
              label="Total quantity"
              hint="Use 1 for a single hall or vehicle. Use the real count for stock like chairs — Indulge will allocate partially across overlapping bookings."
            >
              <input
                type="number"
                min="1"
                value={form.totalQuantity}
                onChange={set('totalQuantity')}
                className="field"
                required
              />
            </Field>

            <Field label="Unit">
              <select value={form.unit} onChange={set('unit')} className="field-select w-full">
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
            <Field label="Price (₹)">
              <input
                type="number"
                min="0"
                value={form.basePrice}
                onChange={set('basePrice')}
                className="field"
                required
              />
            </Field>

            <Field label="Charged">
              <select value={form.priceUnit} onChange={set('priceUnit')} className="field-select w-full">
                {PRICE_UNITS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Minimum hire (hours)">
              <input
                type="number"
                min="1"
                value={form.minRentalPeriodHours}
                onChange={set('minRentalPeriodHours')}
                className="field"
              />
            </Field>
          </div>

          <Field label="Conditions" hint="Anything a hirer must agree to — deposits, licences, timing limits.">
            <textarea
              rows={2}
              value={form.conditions}
              onChange={set('conditions')}
              className="field-area"
            />
          </Field>

          <Field label="Tags" hint="Comma separated. Improves how often you surface in search.">
            <input
              value={form.tags}
              onChange={set('tags')}
              className="field"
              placeholder="wedding, AC, stage, valet"
            />
          </Field>

          <Field label="Image URLs" hint="One per line. The first is used as the main image.">
            <textarea
              rows={3}
              value={form.images}
              onChange={set('images')}
              className="field-area"
              placeholder="https://images.unsplash.com/photo-…"
            />
          </Field>

          {/* Availability windows: when the resource is offered at all. Distinct
              from bookings, which are what has already been taken within them. */}
          <div className="mb-4">
            <label className="label">When is this available?</label>
            <p className="text-xs text-ink-mute mb-3">
              Leave empty if it can be hired at any time. Add windows to restrict it — an
              off-peak kitchen offered only overnight, or a lawn only in season. Requests
              outside every window are refused automatically.
            </p>

            {form.availabilityWindows.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.availabilityWindows.map((w, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div>
                      <span className="block text-xs text-ink-mute mb-1">From</span>
                      <input
                        type="datetime-local"
                        value={w.start}
                        onChange={(e) => updateWindow(i, 'start', e.target.value)}
                        className="field text-sm w-[210px]"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-ink-mute mb-1">To</span>
                      <input
                        type="datetime-local"
                        value={w.end}
                        onChange={(e) => updateWindow(i, 'end', e.target.value)}
                        className="field text-sm w-[210px]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeWindow(i)}
                      className="btn-ghost btn-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addWindow} className="btn-secondary btn-sm">
              Add a window
            </button>
          </div>

          <div className="flex gap-2 pt-2 border-t border-line">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}
            </button>
            <Link to="/listings" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
