import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import api, { errorMessage } from '../api/client';
import { useResource } from '../hooks/queries';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES, PRICE_UNITS, UNITS } from '../lib/constants';

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
};

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      <label className="a-label">{label}</label>
      {children}
      {hint && <p className="text-mini text-ink-mute mt-1">{hint}</p>}
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
    });
  }, [data]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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
    <div className="page-shell py-4 max-w-[860px]">
      <p className="text-mini text-ink-soft mb-3">
        <Link to="/listings" className="a-link">
          Your listings
        </Link>
        {' › '}
        <span>{editing ? 'Edit listing' : 'New listing'}</span>
      </p>

      <div className="bg-white p-6">
        <h1 className="text-page font-normal mb-1">
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
            <input value={form.title} onChange={set('title')} className="a-input" required />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="Category">
              <select value={form.category} onChange={set('category')} className="a-select w-full">
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
                className="a-input"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={4}
              value={form.description}
              onChange={set('description')}
              className="a-textarea"
            />
          </Field>

          <Field label="Highlights" hint="One per line — these appear as bullet points on the listing.">
            <textarea
              rows={4}
              value={form.highlights}
              onChange={set('highlights')}
              className="a-textarea"
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
                className="a-input"
                required
              />
            </Field>

            <Field label="Unit">
              <select value={form.unit} onChange={set('unit')} className="a-select w-full">
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
                className="a-input"
                required
              />
            </Field>

            <Field label="Charged">
              <select value={form.priceUnit} onChange={set('priceUnit')} className="a-select w-full">
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
                className="a-input"
              />
            </Field>
          </div>

          <Field label="Conditions" hint="Anything a hirer must agree to — deposits, licences, timing limits.">
            <textarea
              rows={2}
              value={form.conditions}
              onChange={set('conditions')}
              className="a-textarea"
            />
          </Field>

          <Field label="Tags" hint="Comma separated. Improves how often you surface in search.">
            <input
              value={form.tags}
              onChange={set('tags')}
              className="a-input"
              placeholder="wedding, AC, stage, valet"
            />
          </Field>

          <Field label="Image URLs" hint="One per line. The first is used as the main image.">
            <textarea
              rows={3}
              value={form.images}
              onChange={set('images')}
              className="a-textarea"
              placeholder="https://images.unsplash.com/photo-…"
            />
          </Field>

          <div className="flex gap-2 pt-2 border-t border-bd">
            <button type="submit" disabled={busy} className="btn-yellow btn-pill">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}
            </button>
            <Link to="/listings" className="btn-secondary btn-pill">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
