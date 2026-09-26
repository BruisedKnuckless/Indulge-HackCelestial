import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function VerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDismissed = sessionStorage.getItem('dismiss_verification_banner');
      if (isDismissed === 'true') {
        setDismissed(true);
      }
    }
  }, []);

  if (!user || user.userType === 'logistics_partner' || dismissed) {
    return null;
  }

  // Only show if business is not verified
  const isVerified = user.businessVerified || user.verificationStatus === 'verified' || user.isDemoBusiness;
  if (isVerified) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismiss_verification_banner', 'true');
    }
  };

  return (
    <aside
      aria-label="Account verification notice"
      className="bg-indigo/10 border-b border-indigo/25 text-ink px-4 py-2.5 transition-all text-xs"
    >
      <div className="shell flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-indigo/15 text-indigo flex items-center justify-center shrink-0">
            <ShieldCheck size={14} />
          </span>
          <p className="text-ink-soft">
            <strong className="text-ink font-semibold mr-1.5">Complete business verification:</strong>
            Add your GSTIN or business registration to unlock trusted public badges and payout readiness.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Link
            to="/account"
            className="btn-primary btn-sm text-[11px] py-1 px-3 inline-flex items-center gap-1"
          >
            Verify Business <ArrowRight size={11} />
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn-secondary btn-sm text-[11px] py-1 px-2.5 text-ink-mute hover:text-ink"
            title="Dismiss for this session"
          >
            Later
          </button>
        </div>
      </div>
    </aside>
  );
}
