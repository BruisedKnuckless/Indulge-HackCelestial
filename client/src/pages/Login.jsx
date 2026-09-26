import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import Logo from '../components/layout/Logo';
import { Alert } from '../components/ui';

const DEMO_ACCOUNTS = [
  { email: 'ops@grandorchid.in', label: 'The Grand Orchid Hotel', note: 'listings + incoming requests' },
  { email: 'events@seasonsbanquet.in', label: 'Seasons Banquet', note: 'owns the flagship ballroom' },
  { email: 'desk@kalpataruevents.in', label: 'Kalpataru Events', note: 'active seeker, has history' },
  { email: 'dispatch@swiftfleet.in', label: 'SwiftFleet Logistics', note: 'verified logistics partner' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from || '/';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      if (user?.userType === 'logistics_partner') {
        navigate('/logistics', { replace: true });
      } else if (user?.userType === 'inspector') {
        navigate('/technician', { replace: true });
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('indulge123');
  };

  return (
    <div className="bg-surface min-h-screen">
      <div className="flex flex-col items-center pt-4 px-4">
        <Link to="/" className="mb-4">
          <Logo width={130} dark />
        </Link>

        <div className="border border-line rounded w-full max-w-[350px] p-5">
          <h1 className="h-page mb-8">Sign in</h1>

          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className="label">
                Business email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-ink-soft mt-4 leading-snug">
            By continuing, you agree to Indulge’s Conditions of Use and acknowledge our Privacy
            Notice.
          </p>
        </div>

        {/* Demo shortcut — this is a prototype with seeded accounts. */}
        <div className="w-full max-w-[350px] mt-4">
          <p className="text-xs font-semibold text-ink-soft mb-1.5">Demo accounts</p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => {
              const isLogistics = a.email.includes('swiftfleet');
              return (
                <button
                  key={a.email}
                  onClick={() => useDemo(a.email)}
                  className={`w-full text-left border rounded px-3 py-2 transition-all ${
                    isLogistics
                      ? 'border-indigo/40 bg-indigo/5 hover:bg-indigo/10'
                      : 'border-line hover:bg-surface-sunk'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold block text-ink">{a.label}</span>
                    {isLogistics && (
                      <span className="badge badge-indigo text-[10px] py-0.5 px-1.5 uppercase font-bold tracking-wide">
                        Logistics Partner
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-soft">
                    {a.email} · {a.note}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-mute mt-1.5">
            All demo accounts use the password <span className="font-semibold">indulge123</span>.
          </p>
        </div>

        <div className="w-full max-w-[350px] my-6">
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-line" />
            <span className="text-xs text-ink-soft">New to Indulge?</span>
            <hr className="flex-1 border-0 border-t border-line" />
          </div>
          <Link to="/register" className="btn-secondary w-full mt-4">
            Create your Indulge account
          </Link>

          {/* Admins are separate platform accounts with their own sign-in. */}
          <p className="text-xs text-ink-soft text-center mt-4">
            Platform administrator?{' '}
            <Link to="/admin/login" className="link">
              Admin sign in
            </Link>
            {' · '}
            <Link to="/technician/login" className="link">
              Technician sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="border-t border-line mt-8 pt-6 pb-10 text-center">
        <div className="flex justify-center gap-6 text-xs mb-2">
          <span className="link">Conditions of Use</span>
          <span className="link">Privacy Notice</span>
          <span className="link">Help</span>
        </div>
        <p className="text-xs text-ink-mute">
          © {new Date().getFullYear()} Indulge — B2B Hospitality Resource Exchange
        </p>
      </div>
    </div>
  );
}
