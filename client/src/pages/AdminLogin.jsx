import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { errorMessage } from '../api/client';
import Logo from '../components/layout/Logo';
import { Alert, Spinner } from '../components/ui';

/**
 * Platform-admin sign-in. Mirrors the business login's layout, but talks only
 * to /api/admin/auth — business credentials are refused here, and admin
 * credentials are refused at /login.
 */
export default function AdminLogin() {
  const { admin, loading, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from || '/admin';

  if (loading) return <Spinner label="Loading your account" />;
  if (admin) return <Navigate to={redirectTo} replace />;

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

  return (
    <div className="bg-surface min-h-screen">
      <div className="flex flex-col items-center pt-4 px-4">
        <Link to="/" className="mb-4">
          <Logo width={130} dark />
        </Link>

        <div className="border border-line rounded w-full max-w-[350px] p-5">
          <h1 className="h-page mb-2">Admin sign in</h1>
          <p className="text-sm muted mb-6">Platform console for Indulge administrators.</p>

          {error && (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="admin-email" className="label">
                Admin email
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="label">
                Password
              </label>
              <input
                id="admin-password"
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
        </div>

        <div className="w-full max-w-[350px] my-6">
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-0 border-t border-line" />
            <span className="text-xs text-ink-soft">Running a business?</span>
            <hr className="flex-1 border-0 border-t border-line" />
          </div>
          <Link to="/login" className="btn-secondary w-full mt-4">
            Business sign in
          </Link>
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
