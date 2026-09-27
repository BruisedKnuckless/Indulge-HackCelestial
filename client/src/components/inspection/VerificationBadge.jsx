import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CircleHelp, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtDate, RESULT_BY_KEY } from '../../lib/inspection';
import { useAuth } from '../../context/AuthContext';
import { useNudgeVerification } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import VerificationActions from './VerificationActions';

/**
 * A listing's physical verification, always shown as exactly one of three
 * states — Indulge Verified, Externally Verified, or Not Verified — never
 * silently absent, so a seeker is never left guessing.
 *
 * `verification` is the server's summary (services/verification/verification.service.js
 * publicVerificationSummary); `resource` and `isOwner` drive the owner-only
 * request/submit actions and the seeker-only "ask the lister" nudge.
 */
export default function VerificationBadge({ verification: v, resource, isOwner }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const nudge = useNudgeVerification();
  if (!v) return null;

  const method = v.method || 'none';

  const nudgeLister = async () => {
    try {
      await nudge.mutateAsync(resource._id);
      toast.success('The lister has been notified that you’d like this Indulge Verified.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the request'));
    }
  };

  /* ---------------------------------------------------- Indulge technician */
  if (method === 'indulge_technician') {
    if (!v.decision) {
      return (
        <div className="mb-3">
          <div className="inline-flex items-center gap-2 badge badge-muted">
            <Clock size={13} /> Indulge inspection {v.status === 'in_progress' ? 'in progress' : 'pending'}
            {isOwner && v.inspectionId ? ` · ${v.inspectionId}` : ''}
          </div>
          {isOwner && <p className="text-xs text-ink-mute mt-1">An Indulge technician will inspect this listing against its AI-generated checklist.</p>}
        </div>
      );
    }
    // A failed inspection isn't broadcast to seekers as "Failed" — it simply
    // isn't shown as verified. The owner still sees exactly what happened.
    const passed = v.decision === 'VERIFIED' || v.decision === 'VERIFIED_WITH_ISSUES';
    if (!passed && !isOwner) return null;

    const tone = v.decision === 'VERIFIED' ? 'border-success/40 bg-success/5' : v.decision === 'VERIFIED_WITH_ISSUES' ? 'border-warn/40 bg-warn/5' : 'border-danger/40 bg-danger/5';
    const iconTone = v.decision === 'VERIFIED' ? 'text-success' : v.decision === 'VERIFIED_WITH_ISSUES' ? 'text-warn' : 'text-danger';

    return (
      <div className={`border rounded-lg px-3 py-2 mb-3 text-sm ${tone}`}>
        <button className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <BadgeCheck size={17} className={iconTone} />
          <span className="font-semibold">{passed ? '✓ Indulge Verified' : 'Failed Indulge inspection'}</span>
          {v.decision === 'VERIFIED_WITH_ISSUES' && <span className="text-ink-soft">· with noted issues</span>}
          <span className="text-ink-soft">
            · Condition: {v.conditionStatus} ({v.score}/100) · {fmtDate(v.inspectedAt)}
          </span>
          <span className="ml-auto text-ink-mute">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </button>
        {open && (
          <div className="mt-2 pt-2 border-t border-line space-y-2">
            <p className="text-ink-soft">
              Verified by {v.verifiedBy}. {v.checks} checks
              {v.counts ? `: ${v.counts.pass} passed, ${v.counts.minor_issue} minor, ${v.counts.fail} failed, ${v.counts.not_applicable} not applicable.` : '.'}
            </p>
            {v.issues?.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {v.issues.map((i) => (
                  <li key={i.name} className={`badge border ${RESULT_BY_KEY[i.result]?.tone}`}>
                    {RESULT_BY_KEY[i.result]?.short}: {i.name}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-mute">{v.disclaimer}</p>
            {isOwner && (
              <Link to={`/inspections/${v.inspectionId}`} className="link text-xs">
                Full inspection report ({v.inspectionId})
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------- Externally verified */
  if (method === 'external_technician' && v.decision === 'EXTERNALLY_VERIFIED') {
    return (
      <div className="border border-warn/40 bg-warn/5 rounded-lg px-3 py-2 mb-3 text-sm">
        <button className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <BadgeCheck size={17} className="text-warn" />
          <span className="font-semibold">⚠ Externally Verified</span>
          <span className="text-ink-soft">
            · {v.technicianName}
            {v.company ? ` (${v.company})` : ''} · {fmtDate(v.submittedAt)}
          </span>
          <span className="ml-auto text-ink-mute">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </button>
        {open && (
          <div className="mt-2 pt-2 border-t border-line space-y-2">
            {v.note && <p className="text-ink-soft">{v.note}</p>}
            <p className="text-ink-soft">{v.evidenceCount} evidence item{v.evidenceCount === 1 ? '' : 's'} submitted.</p>
            <p className="text-xs font-medium text-warn">{v.disclaimer}</p>
            {isOwner && (
              <Link to={`/inspections/${v.inspectionId}`} className="link text-xs">
                View submitted report ({v.inspectionId})
              </Link>
            )}
          </div>
        )}
        {isOwner && (
          <div className="mt-2 pt-2 border-t border-line">
            <VerificationActions resource={resource} verification={v} />
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------- Not verified */
  // Covers method:'none', and method:'external_technician' before the report
  // is submitted — seekers see the same honest "not yet verified" either way.
  return (
    <div className="mb-3">
      <div className="inline-flex items-center gap-2 badge badge-muted">
        <CircleHelp size={13} /> ○ Not Verified
      </div>
      {!isOwner && (
        <p className="text-xs text-ink-mute mt-1">
          No Indulge verification has been completed for this listing.{' '}
          {user && (
            <button className="link" disabled={nudge.isPending} onClick={nudgeLister}>
              Request Indulge Verification
            </button>
          )}
        </p>
      )}
      {isOwner && (
        <div className="mt-2">
          <p className="text-xs text-ink-mute mb-2">
            {method === 'external_technician'
              ? 'You chose to arrange your own technician — submit their report to record it.'
              : 'No physical verification has been completed through Indulge for this listing.'}
          </p>
          <VerificationActions resource={resource} verification={v} />
        </div>
      )}
    </div>
  );
}
