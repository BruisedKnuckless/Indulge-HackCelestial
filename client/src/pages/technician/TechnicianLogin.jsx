import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Alert } from '../../components/ui';

/**
 * Sign-in for Indulge technicians. Same account system as businesses, but a
 * non-technician account is signed straight back out: this door only opens
 * the inspection workspace.
 */
export default function TechnicianLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.userType === 'inspector') return <Navigate to="/technician" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const signedIn = await login(email, password);
      if (signedIn?.userType !== 'inspector') {
        logout();
        setError('This is not a technician account. Businesses sign in on the main sign-in page.');
        return;
      }
      navigate('/technician', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  };

  const quickSignIn = async (demoEmail) => {
    setError('');
    setBusy(true);
    try {
      const signedIn = await login(demoEmail, 'indulge123');
      if (signedIn?.userType !== 'inspector') {
        logout();
        setError('This is not a technician account.');
        return;
      }
      navigate('/technician', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface min-h-screen flex flex-col items-center px-4 pt-12">
      <span className="icon-box icon-box-indigo w-12 h-12 mb-3">
        <ClipboardCheck size={24} />
      </span>
      <p className="text-xl font-semibold text-ink">Indulge Inspect</p>
      <p className="text-sm muted mb-6">Technician sign-in</p>

      <div className="card w-full max-w-sm p-5">
        {error && (
          <Alert tone="error" className="mb-3">
            {error}
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="tech-email" className="label">
              Work email
            </label>
            <input
              id="tech-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field h-12"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="tech-password" className="label">
              Password
            </label>
            <input
              id="tech-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field h-12"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full h-12 text-base">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-line space-y-2">
          <p className="text-xs font-semibold text-ink-soft uppercase tracking-wider">Demo Technicians (1-Click Sign-in)</p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => quickSignIn('inspector@indulge.com')}
              className="btn-secondary w-full text-left py-2.5 px-3 flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-medium text-ink block">Rahul Sharma</span>
                <span className="text-[11px] text-ink-mute">Senior Field Tech (inspector@indulge.com)</span>
              </div>
              <span className="text-indigo font-semibold text-[11px]">Sign in →</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => quickSignIn('priya.tech@indulge.com')}
              className="btn-secondary w-full text-left py-2.5 px-3 flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-medium text-ink block">Priya Nair</span>
                <span className="text-[11px] text-ink-mute">Field Tech (priya.tech@indulge.com)</span>
              </div>
              <span className="text-indigo font-semibold text-[11px]">Sign in →</span>
            </button>
          </div>
        </div>

        <p className="text-sm text-ink-mute mt-4">
          New technician?{' '}
          <Link to="/technician/register" className="link">
            Create an account
          </Link>
        </p>
      </div>

      <Link to="/login" className="link text-sm mt-6">
        Business sign-in
      </Link>
    </div>
  );
}
