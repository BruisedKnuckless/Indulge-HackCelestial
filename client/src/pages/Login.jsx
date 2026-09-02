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
      await login(email, password);
      navigate(redirectTo, { replace: true });
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
    <div className="bg-white min-h-screen">
      <div className="flex flex-col items-center pt-4 px-4">
        <Link to="/" className="mb-4">
          <Logo width={130} dark />
        </Link>

        <div className="a-panel w-full max-w-[350px] p-5">
          <h1 className="text-page font-normal mb-4">Sign in</h1>

          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className="a-label">
                Business email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="a-input"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="a-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="a-input"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" disabled={busy} className="btn-yellow w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-mini text-ink-soft mt-4 leading-snug">
            By continuing, you agree to Indulge’s Conditions of Use and acknowledge our Privacy
            Notice.
          </p>
        </div>

        {/* Demo shortcut — this is a prototype with seeded accounts. */}
        <div className="w-full max-w-[350px] mt-4">
          <p className="text-mini font-bold text-ink-soft mb-1.5">Demo accounts</p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => useDemo(a.email)}
                className="w-full text-left a-panel px-3 py-2 hover:bg-[#F7FAFA]"
              >
                <span className="text-base font-bold block">{a.label}</span>
                <span className="text-mini text-ink-soft">
                  {a.email} · {a.note}
                </span>
              </button>
            ))}
          </div>
          <p className="text-micro text-ink-mute mt-1.5">
            All demo accounts use the password <span className="font-bold">indulge123</span>.
          </p>
        </div>

        <div className="w-full max-w-[350px] my-6">
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-bd" />
            <span className="text-mini text-ink-soft">New to Indulge?</span>
            <hr className="flex-1 border-0 border-t border-bd" />
          </div>
          <Link to="/register" className="btn-secondary w-full mt-4">
            Create your Indulge account
          </Link>
        </div>
      </div>

      <div className="border-t border-bd mt-8 pt-6 pb-10 text-center">
        <div className="flex justify-center gap-6 text-mini mb-2">
          <span className="a-link">Conditions of Use</span>
          <span className="a-link">Privacy Notice</span>
          <span className="a-link">Help</span>
        </div>
        <p className="text-micro text-ink-mute">
          © {new Date().getFullYear()} Indulge — B2B Hospitality Resource Exchange
        </p>
      </div>
    </div>
  );
}
