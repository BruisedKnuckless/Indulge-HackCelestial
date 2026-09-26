import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { fmtDate, RESULT_BY_KEY } from '../../lib/inspection';

/**
 * "✓ Indulge Verified" on a listing page, from the server's summary of the
 * latest physical inspection. Seekers see verified outcomes only; the owner
 * also sees pending and failed states and a link to the full report.
 */
export default function VerificationBadge({ verification: v, isOwner }) {
  const [open, setOpen] = useState(false);
  if (!v) return null;

  const passed = v.decision === 'VERIFIED' || v.decision === 'VERIFIED_WITH_ISSUES';
  if (!passed && !isOwner) return null;

  if (!v.decision) {
    return (
      <div className="inline-flex items-center gap-2 badge badge-muted mb-2">
        <Clock size={13} /> Indulge inspection {v.status === 'in_progress' ? 'in progress' : 'pending'} · {v.inspectionId}
      </div>
    );
  }

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
