import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Alert, Stars } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/constants';
import { useSearch } from '../hooks/queries';
import LocationAutocomplete from '../components/map/LocationAutocomplete';
import ServiceAreaChips from '../components/map/ServiceAreaChips';

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
    customBusinessType: user.customBusinessType || '',
    gstNumber: user.gstin || user.gstNumber || '',
    gstin: user.gstin || user.gstNumber || '',
    udyamNumber: user.udyamNumber || '',
    constitution: user.constitution || 'private_limited',
    preferredProviders: user.preferences?.preferredProviders?.map(String) || [],
    location: user.location || null,
    // Logistics partner specific fields
    operatingStatus: user.logisticsProfile?.operatingStatus || 'active',
    serviceAreas: Array.isArray(user.logisticsProfile?.serviceArea)
      ? user.logisticsProfile.serviceArea
      : user.logisticsProfile?.serviceArea
      ? [user.logisticsProfile.serviceArea]
      : ['Mumbai', 'Thane', 'Navi Mumbai'],
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

  const handleBusinessTypeChange = (e) => {
    const val = e.target.value;
    setForm((f) => ({
      ...f,
      businessType: val,
      customBusinessType: val === 'other' ? f.customBusinessType : '',
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const loc = form.location;
      let structuredLocation = undefined;

      if (loc && typeof loc === 'object') {
        const coords = loc.coordinates;
        structuredLocation = {
          type: 'Point',
          coordinates:
            Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])
              ? [Number(coords[0]), Number(coords[1])]
              : user.location?.coordinates,
          address: loc.address || loc.formattedAddress || '',
          formattedAddress: loc.formattedAddress || loc.address || '',
          addressLine2: loc.addressLine2 || '',
          city: loc.city || '',
          state: loc.state || '',
          pincode: loc.pincode || loc.postalCode || '',
          postalCode: loc.postalCode || loc.pincode || '',
          placeId: loc.placeId || '',
        };
      }

      if (isPartner) {
        await updateUser({
          businessName: form.businessName,
          phone: form.phone,
          gstNumber: form.gstNumber,
          location: structuredLocation,
          logisticsProfile: {
            operatingStatus: form.operatingStatus,
            serviceArea: form.serviceAreas.length ? form.serviceAreas : ['Mumbai', 'Thane'],
            hubLocation: structuredLocation,
            vehicleInfo: {
              vehicleType: form.vehicleType,
              model: form.model,
              licensePlate: form.licensePlate,
              capacityKg: Number(form.capacityKg) || 1000,
            },
          },
        });
      } else {
        const cleanGst = form.gstin?.trim().toUpperCase();
        if (!cleanGst) {
          setError('GSTIN is mandatory for business accounts. Please enter your 15-character GSTIN.');
          return;
        }
        if (cleanGst.length !== 15) {
          setError('GSTIN must be exactly 15 characters (e.g. 27AABCU9603R1ZM).');
          return;
        }
        await updateUser({
          businessName: form.businessName,
          phone: form.phone,
          businessType: form.businessType,
          customBusinessType: form.businessType === 'other' ? form.customBusinessType : undefined,
          gstNumber: cleanGst,
          gstin: cleanGst,
          udyamNumber: form.udyamNumber ? form.udyamNumber.trim().toUpperCase() : undefined,
          constitution: form.constitution,
          preferences: { preferredProviders: form.preferredProviders },
          location: structuredLocation,
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
                <select value={form.businessType} onChange={handleBusinessTypeChange} className="field-select w-full">
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isPartner && form.businessType === 'other' && (
              <div>
                <label className="label">Specify business type</label>
                <input
                  value={form.customBusinessType}
                  onChange={set('customBusinessType')}
                  placeholder="e.g. Convention Centre, Wedding Planner"
                  className="field"
                  required
                />
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

          {/* ── Business Verification & Tax Registration ───────────── */}
          {!isPartner ? (
            <div className="p-4 rounded-xl border border-line bg-surface-sunk/40 space-y-3.5 my-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo" />
                  Business Verification & Tax Details
                </span>
                {user.verificationStatus === 'verified' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                    <ShieldCheck size={12} />
                    {user.isDemoBusiness ? 'Demo Verified' : 'Verified'}
                  </span>
                ) : user.verificationStatus === 'pending' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    <Clock size={12} />
                    Pending Review
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-sunk text-ink-mute border border-line">
                    Unverified
                  </span>
                )}
              </div>

              <div>
                <label className="label mb-1">
                  GSTIN (15-character GST Number) <span className="text-accent">*</span>
                </label>
                <input
                  value={form.gstin}
                  onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 27AABCU9603R1ZM"
                  className="field font-mono uppercase text-xs"
                  maxLength={15}
                  required
                />
                <p className="text-[11px] text-ink-mute mt-1">
                  Mandatory for commercial hospitality trading, invoices, and verified business badge.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label mb-1">
                    Udyam Registration <span className="text-ink-mute font-normal">(Optional)</span>
                  </label>
                  <input
                    value={form.udyamNumber}
                    onChange={(e) => setForm((f) => ({ ...f, udyamNumber: e.target.value.toUpperCase() }))}
                    placeholder="e.g. UDYAM-MH-01-0012345"
                    className="field font-mono uppercase text-xs"
                  />
                </div>
                <div>
                  <label className="label mb-1">Business Constitution</label>
                  <select
                    value={form.constitution}
                    onChange={set('constitution')}
                    className="field-select w-full text-xs"
                  >
                    <option value="proprietorship">Sole Proprietorship</option>
                    <option value="partnership">Partnership Firm</option>
                    <option value="llp">Limited Liability Partnership (LLP)</option>
                    <option value="private_limited">Private Limited Company (Pvt Ltd)</option>
                    <option value="public_limited">Public Limited Company (Ltd)</option>
                    <option value="other">Other Registered Entity</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="label">GST / Trade registration number</label>
              <input value={form.gstNumber} onChange={set('gstNumber')} className="field" />
            </div>
          )}

          {/* ── Searchable Location Component ── */}
          <hr className="border-0 border-t border-line my-4" />
          <LocationAutocomplete
            label={isPartner ? 'Base Fleet Hub / Station Location' : 'Business Location'}
            value={form.location}
            onChange={(loc) => setForm((f) => ({ ...f, location: loc }))}
            placeholder={
              isPartner
                ? 'Search dispatch hub, depot, or yard location...'
                : 'Search venue, address, or landmark...'
            }
            helperText={
              isPartner
                ? 'Primary hub station coordinates for transit dispatch calculations.'
                : 'Your operating location determines which resources appear near you, and how distance is scored.'
            }
            showAddressLine2={true}
          />

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

              {/* ── Multi-area Service Chips ── */}
              <div className="mt-3">
                <ServiceAreaChips
                  areas={form.serviceAreas}
                  onChange={(areas) => setForm((f) => ({ ...f, serviceAreas: areas }))}
                />
              </div>
            </>
          )}

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
                          className={`btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {on ? '✓ ' : '+ '}
                          {p.businessName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save profile changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
