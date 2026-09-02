import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Alert, Stars } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/constants';

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
    address: user.location?.address || '',
    city: user.location?.city || '',
    pincode: user.location?.pincode || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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
    <div className="page-shell py-4 max-w-[760px]">
      <p className="text-mini text-ink-soft mb-3">
        <Link to="/account" className="a-link">
          Your Account
        </Link>
        {' › '}
        <span>Business profile</span>
      </p>

      <div className="bg-white p-6">
        <h1 className="text-page font-normal mb-1">Business profile</h1>
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
            <label className="a-label">Business name</label>
            <input value={form.businessName} onChange={set('businessName')} className="a-input" required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="a-label">Business type</label>
              <select value={form.businessType} onChange={set('businessType')} className="a-select w-full">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="a-label">Phone</label>
              <input value={form.phone} onChange={set('phone')} className="a-input" />
            </div>
          </div>

          <div>
            <label className="a-label">GST number</label>
            <input value={form.gstNumber} onChange={set('gstNumber')} className="a-input" />
          </div>

          <hr className="border-0 border-t border-bd" />

          <div>
            <label className="a-label">Operating area</label>
            <select
              onChange={(e) => applyPreset(Number(e.target.value))}
              value={CITY_PRESETS.findIndex((c) => c.label.split(' (')[0] === form.city)}
              className="a-select w-full"
            >
              <option value={-1}>Choose an area…</option>
              {CITY_PRESETS.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label} — {c.pincode}
                </option>
              ))}
            </select>
            <p className="text-mini text-ink-mute mt-1">
              Currently ranking distances from{' '}
              <span className="font-bold">{user.location?.city || 'nowhere set'}</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label className="a-label">Street address</label>
              <input value={form.address} onChange={set('address')} className="a-input" />
            </div>
            <div>
              <label className="a-label">Pincode</label>
              <input value={form.pincode} onChange={set('pincode')} className="a-input" />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-bd">
            <button type="submit" disabled={busy} className="btn-yellow btn-pill">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <Link to="/account" className="btn-secondary btn-pill">
              Back to account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
