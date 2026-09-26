import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import Logo from '../components/layout/Logo';
import { Alert } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/constants';
import LocationAutocomplete from '../components/map/LocationAutocomplete';
import ServiceAreaChips from '../components/map/ServiceAreaChips';

const VEHICLE_TYPE_PRESETS = [
  'Tata Ace / Pickup Truck (1.0T - 1.5T)',
  'Medium Commercial Vehicle / 407 (2.5T)',
  'Heavy Freight Cargo Truck (5T+)',
  'Refrigerated Catering Van',
  'Three Wheeler Cargo (500kg)',
  'Two Wheeler Express Dispatch',
  'Other Transport Vehicle',
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [accountType, setAccountType] = useState('business');
  const [form, setForm] = useState({
    businessName: '',
    email: '',
    password: '',
    phone: '',
    businessType: 'hotel',
    customBusinessType: '',
    location: null,
    // Business Verification Foundation
    gstin: '',
    notGstRegistered: false,
    udyamNumber: '',
    constitution: 'private_limited',
    // Logistics Partner specific
    serviceAreas: ['Mumbai', 'Thane', 'Navi Mumbai'],
    vehicleType: VEHICLE_TYPE_PRESETS[0],
    vehicleModel: '',
    licensePlate: '',
    vehicleCapacity: '1200',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleBusinessTypeChange = (e) => {
    const val = e.target.value;
    setForm((f) => ({
      ...f,
      businessType: val,
      customBusinessType: val === 'other' ? f.customBusinessType : '',
    }));
  };

  const fillDemoPartner = () => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setForm({
      businessName: `SwiftFleet Cargo ${randomSuffix}`,
      email: `dispatch${randomSuffix}@swiftfleet.in`,
      password: 'indulge123',
      phone: '+91 98200 11099',
      businessType: 'other',
      customBusinessType: 'Logistics Fleet Dispatch',
      location: {
        type: 'Point',
        coordinates: [72.9781, 19.2183],
        address: 'Majiwada Logistics Park, Eastern Express Hwy',
        formattedAddress: 'Majiwada Logistics Park, Eastern Express Hwy, Thane 400601',
        addressLine2: 'Bay 4, Cargo Dispatch Terminal',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400601',
        postalCode: '400601',
        placeId: `demo_hub_${randomSuffix}`,
      },
      serviceAreas: ['Thane', 'Mumbai', 'Navi Mumbai', 'Kalyan'],
      vehicleType: VEHICLE_TYPE_PRESETS[0],
      vehicleModel: 'Tata Ace Gold Diesel',
      licensePlate: `MH-04-SF-${randomSuffix}`,
      vehicleCapacity: '1200',
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('Passwords must be at least 6 characters.');
      return;
    }

    const isPartner = accountType === 'logistics_partner';

    if (!isPartner && form.businessType === 'other' && !form.customBusinessType?.trim()) {
      setError('Please specify your business type.');
      return;
    }

    const coords = form.location?.coordinates;
    if (
      !Array.isArray(coords) ||
      coords.length !== 2 ||
      typeof coords[0] !== 'number' ||
      typeof coords[1] !== 'number' ||
      isNaN(coords[0]) ||
      isNaN(coords[1])
    ) {
      setError(
        'Please search and select a valid location from the search suggestions or enter coordinates.'
      );
      return;
    }

    if (isPartner && (!form.serviceAreas || form.serviceAreas.length === 0)) {
      setError('Please add at least one service area region where your fleet operates.');
      return;
    }

    setBusy(true);
    try {
      // GeoJSON ordering: [longitude, latitude]
      const structuredLocation = {
        type: 'Point',
        coordinates: [coords[0], coords[1]],
        address: form.location.address || form.location.formattedAddress || '',
        formattedAddress: form.location.formattedAddress || form.location.address || '',
        addressLine2: form.location.addressLine2 || '',
        city: form.location.city || '',
        state: form.location.state || '',
        pincode: form.location.pincode || form.location.postalCode || '',
        postalCode: form.location.postalCode || form.location.pincode || '',
        placeId: form.location.placeId || '',
      };

      const payload = {
        businessName: form.businessName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        businessType: isPartner ? 'other' : form.businessType,
        customBusinessType: !isPartner && form.businessType === 'other' ? form.customBusinessType.trim() : undefined,
        userType: isPartner ? 'logistics_partner' : 'business',
        location: structuredLocation,
        gstin: !isPartner && !form.notGstRegistered && form.gstin ? form.gstin.trim().toUpperCase() : undefined,
        gstNumber: !isPartner && !form.notGstRegistered && form.gstin ? form.gstin.trim().toUpperCase() : undefined,
        notGstRegistered: !isPartner ? Boolean(form.notGstRegistered) : undefined,
        udyamNumber: !isPartner && form.udyamNumber ? form.udyamNumber.trim().toUpperCase() : undefined,
        constitution: !isPartner ? form.constitution : undefined,
      };

      if (isPartner) {
        payload.logisticsProfile = {
          serviceArea: form.serviceAreas,
          hubLocation: structuredLocation,
          operatingStatus: 'active',
          vehicleInfo: {
            vehicleType: form.vehicleType,
            model: form.vehicleModel || form.vehicleType,
            licensePlate: form.licensePlate,
            capacityKg: Number(form.vehicleCapacity) || 0,
          },
          capacityDescription: form.vehicleCapacity ? `${form.vehicleCapacity} kg payload` : '',
          completedJobs: 0,
          rating: 5.0,
        };
      }

      const registered = await register(payload);

      if (isPartner || registered?.userType === 'logistics_partner') {
        navigate('/logistics', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  const isPartner = accountType === 'logistics_partner';

  return (
    <div className="bg-surface min-h-screen">
      <div className="flex flex-col items-center pt-4 px-4">
        <Link to="/" className="mb-4">
          <Logo width={130} dark />
        </Link>

        <div className={`border border-line rounded w-full ${isPartner ? 'max-w-[480px]' : 'max-w-[440px]'} p-5 transition-all`}>
          <h1 className="h-page mb-2">Create account</h1>
          <p className="text-xs text-ink-mute mb-5">
            {isPartner
              ? 'Join as an Indulge Logistics Partner to handle pickups and physical deliveries.'
              : 'One hospitality account to both share and request resources across venues.'}
          </p>

          {/* ── Account Type Selector ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-sunk mb-6 border border-line">
            <button
              type="button"
              onClick={() => {
                setAccountType('business');
                setError('');
              }}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                !isPartner
                  ? 'bg-surface-alt text-ink shadow-xs'
                  : 'text-ink-mute hover:text-ink'
              }`}
            >
              <Building2 size={13} />
              Business
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountType('logistics_partner');
                setError('');
              }}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                isPartner
                  ? 'bg-surface-alt text-indigo shadow-xs'
                  : 'text-ink-mute hover:text-ink'
              }`}
            >
              <Truck size={14} />
              Logistics Partner
            </button>
          </div>

          {isPartner && (
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-indigo/25 bg-indigo/5 mb-4">
              <div>
                <p className="text-xs font-semibold text-indigo">Testing Logistics Registration?</p>
                <p className="text-[11px] text-ink-mute">Prefill demo partner credentials with 1-click.</p>
              </div>
              <button
                type="button"
                onClick={fillDemoPartner}
                className="btn-secondary btn-sm text-xs py-1 px-2.5 font-medium border-indigo/30 hover:bg-indigo/10 shrink-0"
              >
                ⚡ Fill Demo
              </button>
            </div>
          )}

          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {/* Business / Partner Name */}
            <div>
              <label htmlFor="businessName" className="label">
                {isPartner ? 'Partner / Company name' : 'Business name'} <span className="text-red-500">*</span>
              </label>
              <input
                id="businessName"
                value={form.businessName}
                onChange={set('businessName')}
                placeholder={isPartner ? 'e.g. SwiftFleet Express Logistics' : 'e.g. The Grand Orchid Hotel'}
                className="field"
                required
              />
            </div>

            {/* Business Type (Business only) */}
            {!isPartner && (
              <div className="space-y-2.5">
                <div>
                  <label htmlFor="businessType" className="label">
                    Business type <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="businessType"
                    value={form.businessType}
                    onChange={handleBusinessTypeChange}
                    className="field-select w-full"
                  >
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditional Other Type Field */}
                {form.businessType === 'other' && (
                  <div>
                    <label htmlFor="customBusinessType" className="label">
                      Specify business type <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="customBusinessType"
                      value={form.customBusinessType}
                      onChange={set('customBusinessType')}
                      placeholder="e.g. Convention Centre, Wedding Planner, Cloud Kitchen"
                      className="field"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="label">
                {isPartner ? 'Dispatch / Business email' : 'Business email'} <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder={isPartner ? 'dispatch@swiftfleet.in' : 'ops@grandorchid.in'}
                className="field"
                autoComplete="email"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="label">
                {isPartner ? 'Mobile / Dispatch phone' : 'Mobile number'} {isPartner && <span className="text-red-500">*</span>}
              </label>
              <input
                id="phone"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+91 98200 11099"
                className="field"
                required={isPartner}
              />
            </div>

            {/* ── Business Verification Foundation (Business only) ───────── */}
            {!isPartner && (
              <div className="p-3.5 rounded-xl border border-line bg-surface-sunk/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Business Verification Details
                  </span>
                  <span className="text-[11px] text-ink-mute">Optional at signup</span>
                </div>

                {/* GSTIN Field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="gstin" className="label mb-0">
                      GSTIN (15-character GST Number)
                    </label>
                  </div>
                  <input
                    id="gstin"
                    value={form.gstin}
                    onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                    placeholder="e.g. 27AABCU9603R1ZM"
                    className="field font-mono uppercase text-xs"
                    disabled={form.notGstRegistered}
                    maxLength={15}
                  />
                </div>

                {/* Checkbox: Not GST Registered */}
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-ink-soft select-none">
                  <input
                    type="checkbox"
                    checked={form.notGstRegistered}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        notGstRegistered: e.target.checked,
                        gstin: e.target.checked ? '' : f.gstin,
                      }))
                    }
                    className="mt-0.5 rounded border-line text-indigo focus:ring-indigo"
                  />
                  <span>
                    <strong className="text-ink font-medium">My business is not GST registered</strong>
                    <span className="block text-[11px] text-ink-mute">
                      You can register and verify later using Udyam, business registration, or manual review.
                    </span>
                  </span>
                </label>

                {/* Udyam Registration Number (Optional) */}
                <div>
                  <label htmlFor="udyamNumber" className="label">
                    Udyam Registration Number <span className="text-ink-mute font-normal">(Optional)</span>
                  </label>
                  <input
                    id="udyamNumber"
                    value={form.udyamNumber}
                    onChange={(e) => setForm((f) => ({ ...f, udyamNumber: e.target.value.toUpperCase() }))}
                    placeholder="e.g. UDYAM-MH-01-0012345"
                    className="field font-mono uppercase text-xs"
                  />
                </div>

                {/* Constitution */}
                <div>
                  <label htmlFor="constitution" className="label">
                    Business Constitution
                  </label>
                  <select
                    id="constitution"
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
            )}

            {/* ── Searchable Location Autocomplete ──────────────────────── */}
            <div className="pt-1">
              <LocationAutocomplete
                label={isPartner ? 'Base dispatch hub' : 'Business location'}
                required
                placeholder={
                  isPartner
                    ? 'Search hub address, depot, or landmark (e.g. Bhiwandi Logistics Hub)...'
                    : 'Search venue, mall, street, or landmark (e.g. Viviana Mall, Thane)...'
                }
                helperText={
                  isPartner
                    ? 'Base depot for initial fleet dispatch and proximity calculation.'
                    : 'Used to rank resources by exact distance from your venue.'
                }
                value={form.location}
                onChange={(loc) => setForm((f) => ({ ...f, location: loc }))}
                showAddressLine2={true}
              />
            </div>

            {/* Logistics Partner Specific Fields */}
            {isPartner && (
              <>
                <div className="pt-1">
                  <ServiceAreaChips
                    areas={form.serviceAreas}
                    onChange={(newAreas) => setForm((f) => ({ ...f, serviceAreas: newAreas }))}
                  />
                </div>

                <div className="pt-2 border-t border-line">
                  <p className="text-xs font-semibold text-ink uppercase tracking-wider mb-2">
                    Fleet Vehicle Details
                  </p>

                  <div className="space-y-2.5">
                    <div>
                      <label htmlFor="vehicleType" className="label">
                        Vehicle category
                      </label>
                      <select
                        id="vehicleType"
                        value={form.vehicleType}
                        onChange={set('vehicleType')}
                        className="field-select w-full text-xs"
                      >
                        {VEHICLE_TYPE_PRESETS.map((vt) => (
                          <option key={vt} value={vt}>
                            {vt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="vehicleModel" className="label">
                          Vehicle model
                        </label>
                        <input
                          id="vehicleModel"
                          value={form.vehicleModel}
                          onChange={set('vehicleModel')}
                          placeholder="e.g. Tata Ace Gold"
                          className="field text-xs"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="licensePlate" className="label">
                          License plate
                        </label>
                        <input
                          id="licensePlate"
                          value={form.licensePlate}
                          onChange={set('licensePlate')}
                          placeholder="e.g. MH-04-AB-1234"
                          className="field text-xs"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="vehicleCapacity" className="label">
                        Payload capacity (kg)
                      </label>
                      <input
                        id="vehicleCapacity"
                        type="number"
                        min="50"
                        max="20000"
                        value={form.vehicleCapacity}
                        onChange={set('vehicleCapacity')}
                        placeholder="1200"
                        className="field text-xs"
                        required
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="label">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={set('password')}
                className="field"
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-ink-mute mt-1">At least 6 characters.</p>
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy
                ? 'Creating account…'
                : isPartner
                ? 'Register as Logistics Partner →'
                : 'Create your Indulge account'}
            </button>
          </form>

          <p className="text-xs text-ink-soft mt-4 leading-snug">
            By creating an account you agree to Indulge’s Conditions of Use and Privacy Notice.
          </p>

          <hr className="my-4 border-0 border-t border-line" />

          <p className="text-xs">
            Already have an account?{' '}
            <Link to="/login" className="link">
              Sign in ›
            </Link>
          </p>
        </div>
      </div>

      <div className="border-t border-line mt-8 pt-6 pb-10 text-center">
        <p className="text-xs text-ink-mute">
          © {new Date().getFullYear()} Indulge — B2B Hospitality Resource Exchange
        </p>
      </div>
    </div>
  );
}
