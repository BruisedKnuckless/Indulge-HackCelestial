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
        <p className="text-xs text-ink-mute mt-4">
          Technician accounts are created by Indulge operations. Demo technician: inspector@indulge.com
        </p>
      </div>

      <Link to="/login" className="link text-sm mt-6">
        Business sign-in
      </Link>
    </div>
  );
}
