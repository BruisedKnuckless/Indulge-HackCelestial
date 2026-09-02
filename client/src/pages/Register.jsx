import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import Logo from '../components/layout/Logo';
import { Alert } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/constants';

/**
 * Cities are offered as presets because listings need coordinates for the
 * distance ranking, and a prototype has no geocoding service behind it.
 */
const CITY_PRESETS = [
  { label: 'Thane', pincode: '400601', coordinates: [72.9781, 19.2183] },
  { label: 'Mumbai (Powai)', pincode: '400076', coordinates: [72.9051, 19.1176] },
  { label: 'Mumbai (Mulund)', pincode: '400080', coordinates: [72.956, 19.1726] },
  { label: 'Navi Mumbai (Vashi)', pincode: '400703', coordinates: [73.0071, 19.076] },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: '',
    email: '',
    password: '',
    phone: '',
    businessType: 'hotel',
    address: '',
    cityIndex: 0,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('Passwords must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      const city = CITY_PRESETS[Number(form.cityIndex)];
      await register({
        businessName: form.businessName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        businessType: form.businessType,
        location: {
          address: form.address,
          city: city.label.split(' (')[0],
          pincode: city.pincode,
          coordinates: city.coordinates,
        },
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="flex flex-col items-center pt-4 px-4">
        <Link to="/" className="mb-4">
          <Logo width={130} dark />
        </Link>

        <div className="a-panel w-full max-w-[380px] p-5">
          <h1 className="text-page font-normal mb-4">Create account</h1>

          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="businessName" className="a-label">
                Business name
              </label>
              <input
                id="businessName"
                value={form.businessName}
                onChange={set('businessName')}
                className="a-input"
                required
              />
            </div>

            <div>
              <label htmlFor="businessType" className="a-label">
                Business type
              </label>
              <select
                id="businessType"
                value={form.businessType}
                onChange={set('businessType')}
                className="a-select w-full"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="email" className="a-label">
                Business email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                className="a-input"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="a-label">
                Mobile number
              </label>
              <input id="phone" value={form.phone} onChange={set('phone')} className="a-input" />
            </div>

            <div>
              <label htmlFor="cityIndex" className="a-label">
                Operating area
              </label>
              <select
                id="cityIndex"
                value={form.cityIndex}
                onChange={set('cityIndex')}
                className="a-select w-full"
              >
                {CITY_PRESETS.map((c, i) => (
                  <option key={c.label} value={i}>
                    {c.label} — {c.pincode}
                  </option>
                ))}
              </select>
              <p className="text-micro text-ink-mute mt-1">
                Used to rank resources by distance from you.
              </p>
            </div>

            <div>
              <label htmlFor="address" className="a-label">
                Street address
              </label>
              <input
                id="address"
                value={form.address}
                onChange={set('address')}
                className="a-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="a-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={set('password')}
                className="a-input"
                autoComplete="new-password"
                required
              />
              <p className="text-micro text-ink-mute mt-1">At least 6 characters.</p>
            </div>

            <button type="submit" disabled={busy} className="btn-yellow w-full">
              {busy ? 'Creating account…' : 'Create your Indulge account'}
            </button>
          </form>

          <p className="text-mini text-ink-soft mt-4 leading-snug">
            By creating an account you agree to Indulge’s Conditions of Use and Privacy Notice.
          </p>

          <hr className="my-4 border-0 border-t border-bd" />

          <p className="text-mini">
            Already have an account?{' '}
            <Link to="/login" className="a-link">
              Sign in ›
            </Link>
          </p>
        </div>
      </div>

      <div className="border-t border-bd mt-8 pt-6 pb-10 text-center">
        <p className="text-micro text-ink-mute">
          © {new Date().getFullYear()} Indulge — B2B Hospitality Resource Exchange
        </p>
      </div>
    </div>
  );
}
