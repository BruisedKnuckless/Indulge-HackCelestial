import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Plus, Trash2, ShieldAlert } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useResource, useDeliveryPreview } from '../hooks/queries';
import { Alert, Spinner } from '../components/ui';
import DeliveryConditions from '../components/DeliveryConditions';
import { CATEGORIES, PRICE_UNITS, UNITS } from '../lib/constants';
import { toLocalInput, dateTime } from '../lib/format';

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

/** Physical items get an Indulge inspection; mirrors INSPECTABLE_CATEGORIES on the server. */
const INSPECTED_CATEGORIES = ['furniture', 'av_equipment', 'vehicle', 'other'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Worn'];

/** "RAM: 16GB" per line → { RAM: '16GB' }. Lines without a colon are ignored. */
function parseSpecs(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0 && line.slice(i + 1).trim()) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

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
  // Product details — turned into claim-vs-actual inspection checks
  brand: '',
  model: '',
  declaredCondition: '',
  specifications: '',
  accessories: '',
  // Availability policy
  availabilityMode: 'indefinite',
  availableUntil: '',
  recurringDays: [1, 2, 3, 4, 5], // Mon-Fri default
  recurringStartTime: '09:00',
  recurringEndTime: '20:00',
  availabilityWindows: [],
  // Turnaround buffers
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
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

  // Block management state
  const [blockedPeriods, setBlockedPeriods] = useState([]);
  const [newBlock, setNewBlock] = useState({
    start: '',
    end: '',
    type: 'unavailable',
    reason: '',
  });
  const [blockBusy, setBlockBusy] = useState(false);

  // Live delivery-conditions preview for the full stock, debounced so typing
  // a title doesn't fire a request per keystroke.
  const [previewDraft, setPreviewDraft] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setPreviewDraft({
        title: form.title,
        description: form.description,
        category: form.category,
        totalQuantity: Number(form.totalQuantity) || 1,
        unit: form.unit,
        capacity: Number(form.capacity) || undefined,
        pricing: { basePrice: Number(form.basePrice) || 0, priceUnit: form.priceUnit },
        highlights: form.highlights.split('\n').map((x) => x.trim()).filter(Boolean),
        tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [form.title, form.description, form.category, form.totalQuantity, form.unit, form.capacity, form.basePrice, form.priceUnit, form.highlights, form.tags]);
  const { data: deliveryPreview, isFetching: previewLoading } = useDeliveryPreview(previewDraft);

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
      brand: r.brand || '',
      model: r.model || '',
      declaredCondition: r.declaredCondition || '',
      specifications: Object.entries(r.specifications || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
      accessories: (r.accessories || []).join(', '),
      availabilityMode: r.availabilityMode || 'indefinite',
      availableUntil: r.availableUntil ? toLocalInput(r.availableUntil) : '',
      recurringDays: r.recurringSchedule?.daysOfWeek?.length
        ? r.recurringSchedule.daysOfWeek
        : [1, 2, 3, 4, 5],
      recurringStartTime: r.recurringSchedule?.startTime || '09:00',
      recurringEndTime: r.recurringSchedule?.endTime || '20:00',
      availabilityWindows: (r.availabilityWindows || []).map((w) => ({
        start: toLocalInput(w.start),
        end: toLocalInput(w.end),
      })),
      bufferBeforeMinutes: r.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: r.bufferAfterMinutes ?? 0,
    });
    setBlockedPeriods(r.blockedPeriods || []);
  }, [data]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleRecurringDay = (dayVal) => {
    setForm((f) => {
      const exists = f.recurringDays.includes(dayVal);
      const nextDays = exists
        ? f.recurringDays.filter((d) => d !== dayVal)
        : [...f.recurringDays, dayVal];
      return { ...f, recurringDays: nextDays.sort() };
    });
  };

  const addWindow = () =>
    setForm((f) => ({
      ...f,
      availabilityWindows: [...f.availabilityWindows, { start: '', end: '' }],
    }));

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

  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (!newBlock.start || !newBlock.end) {
      toast.error('Start and end date/time are required for a blocked period.');
      return;
    }
    setBlockBusy(true);
    try {
      const res = await api.post(`/resources/${id}/blocks`, {
        start: new Date(newBlock.start).toISOString(),
        end: new Date(newBlock.end).toISOString(),
        type: newBlock.type,
        reason: newBlock.reason,
      });
      toast.success('Blocked period added');
      setBlockedPeriods(res.data.blockedPeriods);
      setNewBlock({ start: '', end: '', type: 'unavailable', reason: '' });
      qc.invalidateQueries({ queryKey: ['resource', id] });
      qc.invalidateQueries({ queryKey: ['availability', id] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add blocked period'));
    } finally {
      setBlockBusy(false);
    }
  };

  const handleDeleteBlock = async (blockId) => {
    try {
      const res = await api.delete(`/resources/${id}/blocks/${blockId}`);
      toast.success('Blocked period removed');
      setBlockedPeriods(res.data.blockedPeriods);
      qc.invalidateQueries({ queryKey: ['resource', id] });
      qc.invalidateQueries({ queryKey: ['availability', id] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to remove block'));
    }
  };

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
      ...(INSPECTED_CATEGORIES.includes(form.category) && {
        brand: form.brand.trim(),
        model: form.model.trim(),
        declaredCondition: form.declaredCondition,
        specifications: parseSpecs(form.specifications),
        accessories: form.accessories.split(',').map((s) => s.trim()).filter(Boolean),
      }),

      // Availability policy
      availabilityMode: form.availabilityMode,
      availableUntil:
        form.availabilityMode === 'until_date' && form.availableUntil
          ? new Date(form.availableUntil).toISOString()
          : null,
      recurringSchedule: {
        daysOfWeek: form.recurringDays,
        startTime: form.recurringStartTime,
        endTime: form.recurringEndTime,
      },
      availabilityWindows: form.availabilityWindows
        .filter((w) => w.start && w.end)
        .map((w) => ({
          start: new Date(w.start).toISOString(),
          end: new Date(w.end).toISOString(),
        })),
      bufferBeforeMinutes: Number(form.bufferBeforeMinutes) || 0,
      bufferAfterMinutes: Number(form.bufferAfterMinutes) || 0,
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
          Businesses nearby will discover this listing across continuous bookings, managed by your availability policy and turnaround buffers.
        </p>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        <form onSubmit={submit}>
          <Field label="Title" hint="What another business would search for, e.g. “Grand Ballroom — 500 guests”.">
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

          <Field label="Highlights" hint="One per line — bullet points on the listing.">
            <textarea
              rows={3}
              value={form.highlights}
              onChange={set('highlights')}
              className="field-area"
              placeholder={'Pillarless 6,500 sq ft floor\nIn-house stage & lighting'}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field
              label="Total quantity"
              hint="1 for exclusive assets (hall, vehicle). Real count for stock (chairs, projectors) — allocated partially across overlapping bookings."
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

          {/* ── How this listing will be delivered (ML preview) ─────── */}
          <div className="mb-6">
            <DeliveryConditions
              assessment={deliveryPreview}
              loading={previewLoading}
              title="How this will be delivered"
              wide
              note="preview for your full stock — seekers see it for the quantity they choose"
            />
          </div>

          {/* ── Turnaround & Booking Buffers ────────────────────────── */}
          <div className="p-4 rounded-xl border border-line bg-surface-alt/40 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-indigo" />
              <h2 className="text-sm font-bold text-ink">Turnaround & Setup Buffers</h2>
            </div>
            <p className="text-xs text-ink-soft mb-3">
              Safeguard your operations by reserving buffer time before and after every booking for setup, sanitization, inspection, or transport.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Buffer before booking (minutes)"
                hint="Prep / stage time before hire begins."
              >
                <input
                  type="number"
                  min="0"
                  step="15"
                  value={form.bufferBeforeMinutes}
                  onChange={set('bufferBeforeMinutes')}
                  className="field"
                />
              </Field>

              <Field
                label="Buffer after booking (minutes)"
                hint="Cleanup / inspection turnaround before next hire."
              >
                <input
                  type="number"
                  min="0"
                  step="15"
                  value={form.bufferAfterMinutes}
                  onChange={set('bufferAfterMinutes')}
                  className="field"
                />
              </Field>
            </div>
          </div>

          {/* ── Availability Policy Mode ────────────────────────────── */}
          <div className="p-4 rounded-xl border border-line bg-surface-alt/40 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={16} className="text-indigo" />
              <h2 className="text-sm font-bold text-ink">Availability Policy</h2>
            </div>
            <p className="text-xs text-ink-soft mb-4">
              Your listing persists permanently. Choose how and when you accept bookings.
            </p>

            <Field label="Availability Mode">
              <select
                value={form.availabilityMode}
                onChange={set('availabilityMode')}
                className="field-select w-full"
              >
                <option value="indefinite">Continuous / Indefinite (Always available until paused)</option>
                <option value="until_date">Available until specific date</option>
                <option value="recurring">Recurring weekly operating schedule</option>
                <option value="date_range">Explicit availability windows</option>
                <option value="custom">Custom (Schedule + Windows)</option>
              </select>
            </Field>

            {/* Until Date */}
            {(form.availabilityMode === 'until_date' || form.availabilityMode === 'custom') && (
              <Field
                label="Available Until Date"
                hint="New bookings beyond this cutoff will be automatically refused."
              >
                <input
                  type="datetime-local"
                  value={form.availableUntil}
                  onChange={set('availableUntil')}
                  className="field max-w-[280px]"
                />
              </Field>
            )}

            {/* Recurring Schedule */}
            {(form.availabilityMode === 'recurring' || form.availabilityMode === 'custom') && (
              <div className="mt-3 pt-3 border-t border-line/60">
                <label className="label mb-1">Operating Days</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DAYS_OF_WEEK.map((d) => {
                    const active = form.recurringDays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleRecurringDay(d.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-indigo text-white border-indigo'
                            : 'bg-surface text-ink-soft border-line hover:border-line-strong'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-[320px]">
                  <div>
                    <span className="block text-xs text-ink-mute mb-1">Daily Start Time</span>
                    <input
                      type="time"
                      value={form.recurringStartTime}
                      onChange={set('recurringStartTime')}
                      className="field text-sm"
                    />
                  </div>
                  <div>
                    <span className="block text-xs text-ink-mute mb-1">Daily End Time</span>
                    <input
                      type="time"
                      value={form.recurringEndTime}
                      onChange={set('recurringEndTime')}
                      className="field text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Date Range Windows */}
            {(form.availabilityMode === 'date_range' || form.availabilityMode === 'custom') && (
              <div className="mt-4 pt-3 border-t border-line/60">
                <label className="label">Explicit Availability Windows</label>
                <p className="text-xs text-ink-mute mb-3">
                  Only dates and times inside one of these windows are bookable.
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
                            className="field text-sm w-[200px]"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-ink-mute mb-1">To</span>
                          <input
                            type="datetime-local"
                            value={w.end}
                            onChange={(e) => updateWindow(i, 'end', e.target.value)}
                            className="field text-sm w-[200px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWindow(i)}
                          className="btn-ghost btn-sm text-danger"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addWindow}
                  className="btn-secondary btn-sm gap-1"
                >
                  <Plus size={13} />
                  Add window
                </button>
              </div>
            )}
          </div>

          <Field label="Conditions" hint="Deposits, license rules, or house regulations.">
            <textarea
              rows={2}
              value={form.conditions}
              onChange={set('conditions')}
              className="field-area"
            />
          </Field>

          <Field label="Tags" hint="Comma-separated keywords for search discovery.">
            <input
              value={form.tags}
              onChange={set('tags')}
              className="field"
              placeholder="wedding, stage, AC, banquet, chairs"
            />
          </Field>

          {INSPECTED_CATEGORIES.includes(form.category) && (
            <div className="border border-line rounded p-4 mb-4">
              <p className="h-card">Product details</p>
              <p className="text-xs text-ink-soft mt-0.5 mb-4">
                Optional. An Indulge technician inspects physical items before they are marked verified; every detail you give here becomes something they check.
              </p>
              <div className="grid sm:grid-cols-3 gap-x-3">
                <Field label="Brand">
                  <input value={form.brand} onChange={set('brand')} className="field" placeholder="Dell" />
                </Field>
                <Field label="Model">
                  <input value={form.model} onChange={set('model')} className="field" placeholder="Latitude 5420" />
                </Field>
                <Field label="Condition">
                  <select value={form.declaredCondition} onChange={set('declaredCondition')} className="field-select w-full">
                    <option value="">Not stated</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Specifications" hint="One per line, as “Name: value”.">
                <textarea rows={3} value={form.specifications} onChange={set('specifications')} className="field-area" placeholder={'RAM: 16GB\nStorage: 512GB SSD'} />
              </Field>
              <Field label="Accessories included" hint="Comma-separated.">
                <input value={form.accessories} onChange={set('accessories')} className="field" placeholder="Charger, carry case" />
              </Field>
            </div>
          )}

          <Field label="Image URLs" hint="One per line. First image is the card cover.">
            <textarea
              rows={3}
              value={form.images}
              onChange={set('images')}
              className="field-area"
              placeholder="https://images.unsplash.com/photo-…"
            />
          </Field>

          <div className="flex gap-2 pt-2 border-t border-line">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}
            </button>
            <Link to="/listings" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </form>

        {/* ── Blocked Dates & Maintenance Manager (Edit mode) ───────── */}
        {editing && (
          <div className="mt-10 pt-8 border-t border-line">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={18} className="text-amber-accent" />
              <h2 className="text-lg font-bold text-ink">Owner Blocked Dates & Maintenance</h2>
            </div>
            <p className="text-sm text-ink-soft mb-5">
              Temporarily take this resource off the market for internal use, maintenance, or private events without deleting the listing. Existing confirmed bookings are protected.
            </p>

            {blockedPeriods.length > 0 ? (
              <div className="space-y-2 mb-6">
                {blockedPeriods.map((b) => (
                  <div
                    key={b._id}
                    className="p-3 rounded-lg border border-line bg-surface-alt/60 flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            b.type === 'maintenance'
                              ? 'badge-amber'
                              : b.type === 'internal_use'
                              ? 'badge-indigo'
                              : 'badge-muted'
                          } capitalize text-[11px]`}
                        >
                          {b.type.replace('_', ' ')}
                        </span>
                        <span className="font-semibold text-ink">
                          {dateTime(b.start)} → {dateTime(b.end)}
                        </span>
                      </div>
                      {b.reason && <p className="text-xs text-ink-soft mt-1">{b.reason}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteBlock(b._id)}
                      className="btn-ghost btn-sm text-danger hover:bg-danger/10"
                      title="Remove block"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-mute mb-4 italic">No dates currently blocked.</p>
            )}

            <div className="p-4 rounded-xl border border-line/80 bg-surface-sunk/40">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-3">
                Schedule a Block or Maintenance
              </h3>
              <form onSubmit={handleAddBlock} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1">Start Time</label>
                    <input
                      type="datetime-local"
                      value={newBlock.start}
                      onChange={(e) => setNewBlock((prev) => ({ ...prev, start: e.target.value }))}
                      className="field text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      value={newBlock.end}
                      onChange={(e) => setNewBlock((prev) => ({ ...prev, end: e.target.value }))}
                      className="field text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1">Block Type</label>
                    <select
                      value={newBlock.type}
                      onChange={(e) => setNewBlock((prev) => ({ ...prev, type: e.target.value }))}
                      className="field-select w-full text-sm"
                    >
                      <option value="internal_use">Internal Business Use</option>
                      <option value="maintenance">Maintenance / Servicing</option>
                      <option value="private_event">Private Closed Event</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1">Reason (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Annual HVAC deep clean"
                      value={newBlock.reason}
                      onChange={(e) => setNewBlock((prev) => ({ ...prev, reason: e.target.value }))}
                      className="field text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={blockBusy}
                  className="btn-secondary btn-sm gap-1 font-semibold"
                >
                  <Plus size={13} />
                  {blockBusy ? 'Adding…' : 'Add Blocked Period'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
