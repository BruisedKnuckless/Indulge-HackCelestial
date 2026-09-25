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

const VEHICLE_TYPES = [
  'Mini Truck (Tata Ace / Dost)',
  'Pickup (Mahindra Bolero Maxi)',
  'Cargo Van / Tempo',
  '3-Wheeler Cargo Auto',
  'Electric E-Loader',
  '14ft Heavy Flatbed Truck',
  'Temperature Controlled Reefer',
];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const isPartner = user?.userType === 'logistics_partner';

  const initialVehicle =
    typeof user?.logisticsProfile?.vehicleInfo === 'object' && user?.logisticsProfile?.vehicleInfo !== null
      ? user.logisticsProfile.vehicleInfo
      : {};

  const [form, setForm] = useState({
    businessName: user.businessName || '',
    phone: user.phone || '',
    businessType: user.businessType || 'other',
    gstNumber: user.gstNumber || '',
    preferredProviders: user.preferences?.preferredProviders?.map(String) || [],
    address: user.location?.address || '',
    city: user.location?.city || '',
    pincode: user.location?.pincode || '',
    // Logistics partner specific fields
    operatingStatus: user.logisticsProfile?.operatingStatus || 'active',
    serviceArea: Array.isArray(user.logisticsProfile?.serviceArea)
      ? user.logisticsProfile.serviceArea.join(', ')
      : 'Mumbai, Thane, Navi Mumbai',
    vehicleType: initialVehicle.vehicleType || 'Mini Truck (Tata Ace / Dost)',
    model: initialVehicle.model || '',
    licensePlate: initialVehicle.licensePlate || '',
    capacityKg: initialVehicle.capacityKg || 1200,
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

    const preset = CITY_PRESETS.find((c) => c.label.split(' (')[0] === form.city);
    const coordinates = preset ? preset.coordinates : user.location?.coordinates;

    try {
      if (isPartner) {
        const areaArr = form.serviceArea
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        await updateUser({
          businessName: form.businessName,
          phone: form.phone,
          gstNumber: form.gstNumber,
          location: {
            address: form.address,
            city: form.city,
            pincode: form.pincode,
            coordinates,
          },
          logisticsProfile: {
            operatingStatus: form.operatingStatus,
            serviceArea: areaArr.length ? areaArr : ['Mumbai', 'Thane'],
            vehicleInfo: {
              vehicleType: form.vehicleType,
              model: form.model,
              licensePlate: form.licensePlate,
              capacityKg: Number(form.capacityKg) || 1000,
            },
          },
        });
      } else {
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
      }
      toast.success(isPartner ? 'Logistics partner profile updated' : 'Profile updated');
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
        <span>{isPartner ? 'Logistics Partner Profile' : 'Business profile'}</span>
      </p>

      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="h-page mb-0">{isPartner ? 'Logistics Partner Profile' : 'Business profile'}</h1>
          {isPartner && (
            <span className="badge badge-accent text-xs">
              Logistics Network Partner
            </span>
          )}
        </div>
        <p className="text-base text-ink-soft mb-4">
          {isPartner
            ? 'Manage your dispatch fleet details, operating hub, service coverage, and availability for hospitality transit jobs.'
            : 'Your operating area determines which resources appear near you, and how distance is scored when ranking matches.'}
        </p>

        {user.ratingCount > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <Stars rating={user.ratingAvg} count={user.ratingCount} />
            <span className="text-base text-ink-soft">
              from {user.ratingCount} completed {isPartner ? 'dispatch assignment' : 'booking'}
              {user.ratingCount === 1 ? '' : 's'}
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
            <label className="label">{isPartner ? 'Fleet / Partner company name' : 'Business name'}</label>
            <input value={form.businessName} onChange={set('businessName')} className="field" required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isPartner && (
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
            )}

            {isPartner && (
              <div>
                <label className="label">Operating status</label>
                <select value={form.operatingStatus} onChange={set('operatingStatus')} className="field-select w-full">
                  <option value="active">Active (Accepting dispatch jobs)</option>
                  <option value="busy">Busy (On active delivery / route)</option>
                  <option value="offline">Offline (Standby)</option>
                </select>
              </div>
            )}

            <div>
              <label className="label">Contact Phone</label>
              <input value={form.phone} onChange={set('phone')} className="field" required={isPartner} />
            </div>
          </div>

          <div>
            <label className="label">GST / Trade registration number</label>
            <input value={form.gstNumber} onChange={set('gstNumber')} className="field" />
          </div>

          {isPartner && (
            <>
              <hr className="border-0 border-t border-line my-4" />
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
                  Fleet & Vehicle Specification
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="label">Vehicle Class</label>
                    <select value={form.vehicleType} onChange={set('vehicleType')} className="field-select w-full">
                      {VEHICLE_TYPES.map((vt) => (
                        <option key={vt} value={vt}>
                          {vt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Vehicle Model</label>
                    <input
                      value={form.model}
                      onChange={set('model')}
                      placeholder="e.g. Tata Ace Gold Diesel"
                      className="field"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Registration / License Plate</label>
                    <input
                      value={form.licensePlate}
                      onChange={set('licensePlate')}
                      placeholder="e.g. MH-04-AZ-2819"
                      className="field uppercase"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Payload Capacity (kg)</label>
                    <input
                      type="number"
                      min="100"
                      max="20000"
                      value={form.capacityKg}
                      onChange={set('capacityKg')}
                      className="field"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <label className="label">Service Coverage Areas (comma separated)</label>
                <input
                  value={form.serviceArea}
                  onChange={set('serviceArea')}
                  placeholder="e.g. Mumbai, Thane, Navi Mumbai, Kalyan"
                  className="field"
                  required
                />
                <p className="text-xs text-ink-mute mt-1">
                  Jobs within these operating zones are routed and suggested to your dispatch queue.
                </p>
              </div>
            </>
          )}

          <hr className="border-0 border-t border-line my-4" />

          <div>
            <label className="label">{isPartner ? 'Base Dispatch Hub / Operating Area' : 'Operating area'}</label>
            <select
              onChange={(e) => applyPreset(Number(e.target.value))}
              value={CITY_PRESETS.findIndex((c) => c.label.split(' (')[0] === form.city)}
              className="field-select w-full"
            >
              <option value={-1}>Choose a hub city / zone…</option>
              {CITY_PRESETS.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label} — {c.pincode}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-mute mt-1">
              Currently stationed at{' '}
              <span className="font-semibold">{user.location?.city || 'unassigned hub'}</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label className="label">Hub / Yard Address</label>
              <input value={form.address} onChange={set('address')} className="field" />
            </div>
            <div>
              <label className="label">Pincode</label>
              <input value={form.pincode} onChange={set('pincode')} className="field" />
            </div>
          </div>

          {!isPartner && (
            <>
              <hr className="rule" />
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
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-line">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {isPartner && (
              <Link to="/logistics" className="btn-secondary">
                Open Dispatch Center
              </Link>
            )}
            <Link to="/account" className="btn-secondary">
              Back to account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
