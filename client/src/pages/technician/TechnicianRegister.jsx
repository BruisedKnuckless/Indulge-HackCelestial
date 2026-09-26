import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Alert } from '../../components/ui';
import { TECHNICIAN_CITIES } from '../../lib/constants';

const EMPTY = { name: '', email: '', phone: '', city: '', password: '', confirm: '' };

/**
 * Self-registration for Indulge technicians. Creates an inspector account
 * (POST /api/auth/technician/register) and signs straight into the inspection
 * workspace. Title and employee ID are assigned by operations, not here.
 */
export default function TechnicianRegister() {
  const { user, registerTechnician } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.userType === 'inspector') return <Navigate to="/technician" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      await registerTechnician({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        city: form.city || undefined,
      });
      navigate('/technician', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface min-h-screen flex flex-col items-center px-4 pt-12 pb-12">
      <span className="icon-box icon-box-indigo w-12 h-12 mb-3">
        <ClipboardCheck size={24} />
      </span>
      <p className="text-xl font-semibold text-ink">Indulge Inspect</p>
      <p className="text-sm muted mb-6">Technician registration</p>

      <div className="card w-full max-w-sm p-5">
        {error && (
          <Alert tone="error" className="mb-3">
            {error}
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="tech-name" className="label">
              Full name
            </label>
            <input
              id="tech-name"
              value={form.name}
              onChange={set('name')}
              className="field h-12"
              autoComplete="name"
              minLength={2}
              required
            />
          </div>
          <div>
            <label htmlFor="tech-email" className="label">
              Work email
            </label>
            <input
              id="tech-email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={set('email')}
              className="field h-12"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="tech-phone" className="label">
              Phone <span className="text-ink-mute font-normal">(optional)</span>
            </label>
            <input
              id="tech-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={set('phone')}
              className="field h-12"
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="tech-city" className="label">
              Base city
            </label>
            <select id="tech-city" value={form.city} onChange={set('city')} className="field h-12" required>
              <option value="" disabled>
                Select your city
              </option>
              {TECHNICIAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tech-password" className="label">
              Password
            </label>
            <input
              id="tech-password"
              type="password"
              value={form.password}
              onChange={set('password')}
              className="field h-12"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-ink-mute mt-1">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="tech-confirm" className="label">
              Confirm password
            </label>
            <input
              id="tech-confirm"
              type="password"
              value={form.confirm}
              onChange={set('confirm')}
              className="field h-12"
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full h-12 text-base">
            {busy ? 'Creating account…' : 'Create technician account'}
          </button>
        </form>
        <p className="text-sm text-ink-mute mt-4">
          Already registered?{' '}
          <Link to="/technician/login" className="link">
            Sign in
          </Link>
        </p>
      </div>

      <Link to="/login" className="link text-sm mt-6">
        Business sign-in
      </Link>
    </div>
  );
}
