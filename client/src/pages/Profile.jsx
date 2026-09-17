import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Alert, Stars } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/constants';
import { useSearch } from '../hooks/queries';

const CITY_PRESETS = [
  { label: 'Thane', pincode: '400601', coordinates: [72.9781, 19.2183] },
  { label: 'Mumbai (Powai)', pincode: '400076', coordinates: [72.9051, 19.1176] },
  { label: 'Mumbai (Mulund)', pincode: '400080', coordinates: [72.956, 19.1726] },
  { label: 'Navi Mumbai (Vashi)', pincode: '400703', coordinates: [73.0071, 19.076] },
];

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [form, setForm] = useState({
    businessName: user.businessName || '',
    phone: user.phone || '',
    businessType: user.businessType || 'other',
    gstNumber: user.gstNumber || '',
    preferredProviders: user.preferences?.preferredProviders?.map(String) || [],
    address: user.location?.address || '',
    city: user.location?.city || '',
    pincode: user.location?.pincode || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // The search index already carries owner details, so the list of businesses
  // to prefer comes from there rather than a dedicated directory endpoint.
  const { data: directory } = useSearch({ limit: 60, radiusKm: 200 });
  const providers = Object.values(
    Object.fromEntries(
      (directory?.results || [])
        .map((r) => r.owner)
        .filter((o) => o && String(o._id) !== String(user._id))
        .map((o) => [String(o._id), o])
    )
  );

  const togglePreferred = (id) =>
    setForm((f) => ({
      ...f,
      preferredProviders: f.preferredProviders.includes(id)
        ? f.preferredProviders.filter((x) => x !== id)
        : [...f.preferredProviders, id],
    }));

  const applyPreset = (index) => {
    const c = CITY_PRESETS[index];
    if (!c) return;
    setForm((f) => ({ ...f, city: c.label.split(' (')[0], pincode: c.pincode }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    // Keep the existing coordinates unless the city changed, so distance
    // ranking never silently breaks on an unrelated edit.
    const preset = CITY_PRESETS.find((c) => c.label.split(' (')[0] === form.city);
    const coordinates = preset ? preset.coordinates : user.location?.coordinates;

    try {
      await updateUser({
        businessName: form.businessName,
        phone: form.phone,
        businessType: form.businessType,
        gstNumber: form.gstNumber,
        preferences: { preferredProviders: form.preferredProviders },
        location: {
          address: form.address,
          city: form.city,
          pincode: form.pincode,
          coordinates,
        },
      });
      toast.success('Profile updated');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your profile.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell pt-12 pb-20 max-w-prose">
      <p className="text-xs text-ink-soft mb-3">
        <Link to="/account" className="link">
          Your Account
        </Link>
        {' › '}
        <span>Business profile</span>
      </p>

      <div className="card">
        <h1 className="h-page mb-2">Business profile</h1>
        <p className="text-base text-ink-soft mb-4">
          Your operating area determines which resources appear near you, and how distance is scored
          when ranking matches.
        </p>

        {user.ratingCount > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <Stars rating={user.ratingAvg} count={user.ratingCount} />
            <span className="text-base text-ink-soft">
              from {user.ratingCount} completed booking{user.ratingCount === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Business name</label>
            <input value={form.businessName} onChange={set('businessName')} className="field" required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Business type</label>
              <select value={form.businessType} onChange={set('businessType')} className="field-select w-full">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Phone</label>
              <input value={form.phone} onChange={set('phone')} className="field" />
            </div>
          </div>

          <div>
            <label className="label">GST number</label>
            <input value={form.gstNumber} onChange={set('gstNumber')} className="field" />
          </div>

          <hr className="border-0 border-t border-line" />

          <div>
            <label className="label">Operating area</label>
            <select
              onChange={(e) => applyPreset(Number(e.target.value))}
              value={CITY_PRESETS.findIndex((c) => c.label.split(' (')[0] === form.city)}
              className="field-select w-full"
            >
              <option value={-1}>Choose an area…</option>
              {CITY_PRESETS.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label} — {c.pincode}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-mute mt-1">
              Currently ranking distances from{' '}
              <span className="font-semibold">{user.location?.city || 'nowhere set'}</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label className="label">Street address</label>
              <input value={form.address} onChange={set('address')} className="field" />
            </div>
            <div>
              <label className="label">Pincode</label>
              <input value={form.pincode} onChange={set('pincode')} className="field" />
            </div>
          </div>

          <hr className="rule" />

          {/* Preferred providers earn a small ranking bonus in search, so this
              is the one preference that visibly changes what the seeker sees. */}
          <div>
            <label className="label">Preferred providers</label>
            <p className="text-xs text-ink-mute mb-3">
              Businesses you have worked with and trust. Their listings get a 5% ranking boost in
              your search results.
            </p>

            {providers.length === 0 ? (
              <p className="text-sm muted">No other businesses to choose from yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {providers.map((p) => {
                  const on = form.preferredProviders.includes(String(p._id));
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => togglePreferred(String(p._id))}
                      className={`h-9 px-3 text-sm rounded-full border transition-colors ${
                        on
                          ? 'bg-ink border-ink text-ink-invert'
                          : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink'
                      }`}
                    >
                      {p.businessName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-line">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <Link to="/account" className="btn-secondary">
              Back to account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
