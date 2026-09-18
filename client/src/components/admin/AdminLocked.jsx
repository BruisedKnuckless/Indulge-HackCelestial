import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Shown when a signed-in account reaches /admin without the platform-admin
 * flag.
 *
 * This replaced a silent redirect to the homepage. The API answers 404 to a
 * non-admin on purpose — the console should not be advertised — but that makes
 * "you are not an admin" and "ADMIN_EMAILS was never set on this deployment"
 * look identical, and the second one cost real time to diagnose. Naming the
 * variable here gives nothing away: it grants no access, reveals no admin's
 * identity, and the repository is where anyone would look anyway.
 */
export default function AdminLocked() {
  const { user } = useAuth();

  return (
    <div className="shell py-16">
      <div className="max-w-xl mx-auto text-center">
        <span className="icon-box icon-box-muted w-14 h-14 mx-auto mb-5">
          <ShieldCheck size={24} strokeWidth={1.6} />
        </span>

        <h1 className="h-page mb-3">Platform console unavailable</h1>

        <p className="text-sm muted mb-6">
          {user?.email ? (
            <>
              <span className="font-medium text-ink">{user.email}</span> is not on this
              deployment's platform-admin allowlist.
            </>
          ) : (
            <>This account is not on this deployment's platform-admin allowlist.</>
          )}
        </p>

        <div className="card text-left">
          <h2 className="h-card mb-2">If this is your deployment</h2>
          <p className="text-sm muted mb-3">
            Admin access is granted by an environment variable on the API service, not by a field on
            any account — provider and seeker are decided by context in this marketplace, so there
            is no role column to flip. Set it and redeploy:
          </p>
          <pre className="text-xs font-mono bg-surface-sunk border border-line rounded-lg px-3.5 py-3 overflow-x-auto mb-3">
            ADMIN_EMAILS={user?.email || 'you@yourbusiness.com'}
          </pre>
          <p className="text-sm muted">
            Then sign out and back in — the flag is computed when your session is issued. The API
            prints whether the console is enabled or locked in its startup logs.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6">
          <Link to="/" className="btn-secondary">
            Back to marketplace
          </Link>
          <Link to="/analytics" className="btn-ghost">
            Your own analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
