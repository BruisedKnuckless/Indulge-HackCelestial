import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DECISIONS, RESULT_BY_KEY } from '../../lib/inspection';

/**
 * Last step before submit: what is still blocking, and the score the server
 * will compute from the results so far. The server recomputes on submit and
 * refuses anything incomplete, so this preview is informational only.
 */
export default function InspectionReview({ inspection, preview, problems, onJump, onSubmit, submitting }) {
  const [notes, setNotes] = useState(inspection.inspectorNotes || '');
  const blocked = problems.length > 0;
  const byId = new Map(inspection.parameters.map((p, i) => [p.id, i]));
  const counts = preview?.breakdown?.counts || {};
  const decision = DECISIONS[preview?.status];

  return (
    <div>
      <h2 className="text-xl font-semibold">Review and submit</h2>
      <p className="text-sm text-ink-soft mt-1">Once submitted the results are locked and the listing is updated.</p>

      {blocked ? (
        <div className="mt-4 border border-danger/30 bg-danger/5 rounded p-4">
          <p className="font-semibold text-danger flex items-center gap-2">
            <AlertTriangle size={18} /> {problems[0].message}
          </p>
          <ul className="mt-3 space-y-2">
            {problems.map((pr, i) => (
              <li key={i} className="text-sm">
                {pr.code === 'REQUIRED_REMAINING' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {pr.parameterIds.map((pid) => (
                      <button key={pid} className="btn-secondary btn-sm" onClick={() => onJump(byId.get(pid))}>
                        {inspection.parameters[byId.get(pid)]?.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button className="link text-left" onClick={() => onJump(byId.get(pr.parameterIds[0]))}>
                    {pr.message}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4 border border-success/30 bg-success/5 rounded p-4 text-success font-semibold flex items-center gap-2">
          <CheckCircle2 size={18} /> Every required check is recorded.
        </div>
      )}

      <div className="card p-4 mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">Score so far</span>
          <span className="text-3xl font-semibold tabular-nums">{preview?.score ?? '—'}<span className="text-base text-ink-mute">/100</span></span>
        </div>
        {decision && !blocked && (
          <p className="mt-1 text-right">
            <span className={`badge ${decision.tone}`}>{decision.label}</span>
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 mt-4 text-center text-sm">
          {['pass', 'minor_issue', 'fail', 'not_applicable'].map((k) => (
            <div key={k} className={`rounded border py-2 ${RESULT_BY_KEY[k].tone}`}>
              <p className="text-lg font-semibold tabular-nums">{counts[k] || 0}</p>
              <p className="text-xs">{RESULT_BY_KEY[k].short}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-mute mt-3">
          Pass counts in full, a minor issue half, a failure zero; N/A is left out. A failed critical check or a score under 60 fails the inspection.
        </p>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="inspector-notes">
          Overall notes <span className="text-ink-mute">(optional)</span>
        </label>
        <textarea id="inspector-notes" rows={3} className="field-area" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button
        onClick={() => onSubmit(notes)}
        disabled={blocked || submitting}
        className="btn-primary w-full h-14 text-base mt-5"
      >
        {submitting ? 'Submitting…' : 'Submit inspection'}
      </button>
    </div>
  );
}
