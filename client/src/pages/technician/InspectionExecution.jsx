import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, List, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTechInspection, useTechInspectionActions } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Spinner, EmptyState } from '../../components/ui';
import InspectionParameter from '../../components/technician/InspectionParameter';
import InspectionReview from '../../components/technician/InspectionReview';
import { FINAL_STATUSES, RESULT_BY_KEY, fmtDateTime } from '../../lib/inspection';

/**
 * The checklist, one check per screen. The step lives in the URL so a reload
 * or a dropped connection comes back to the same check; every result is
 * already saved on the server.
 */
export default function InspectionExecution() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [listOpen, setListOpen] = useState(false);
  const { data, isLoading, error } = useTechInspection(id);
  const actions = useTechInspectionActions(id);

  const total = data?.inspection?.parameters?.length || 0;
  const step = Math.min(Math.max(0, Number(params.get('step')) || 0), total); // total = review
  const go = (i) => {
    setParams({ step: String(i) }, { replace: true });
    setListOpen(false);
    window.scrollTo({ top: 0 });
  };

  // Resume at the first unanswered check.
  useEffect(() => {
    if (!data || params.has('step')) return;
    const first = data.inspection.parameters.findIndex((p) => !p.result);
    go(first === -1 ? total : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const evidenceBy = useMemo(() => {
    const m = {};
    for (const e of data?.inspection?.evidence || []) (m[e.parameterId] ||= []).push(e);
    return m;
  }, [data]);

  if (isLoading) return <Spinner label="Loading checklist" />;
  if (error || !data) return <EmptyState title="Inspection not found" action={<Link to="/technician" className="btn-primary">Back to queue</Link>} />;

  const { inspection: vr, progress, baseline } = data;
  if (FINAL_STATUSES.includes(vr.status)) {
    return (
      <EmptyState
        title="This inspection is submitted"
        message="Results are locked once submitted."
        action={<Link to={`/technician/inspections/${vr._id}/report`} className="btn-primary">View report</Link>}
      />
    );
  }

  const p = vr.parameters[step];
  const saving = actions.record.isPending || actions.addEvidence.isPending;
  const pct = total ? Math.round((progress.done / total) * 100) : 0;

  const submit = async (inspectorNotes) => {
    try {
      await actions.submit.mutateAsync({ inspectorNotes });
      toast.success('Inspection submitted');
      navigate(`/technician/inspections/${vr._id}/report`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not submit'));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-3 pb-28">
      {/* Progress */}
      <div className="sticky top-24 sm:top-14 z-30 bg-surface pt-2 pb-3 -mx-4 px-4 border-b border-line">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/technician/inspections/${vr._id}`} className="btn-ghost p-1.5" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <span className="font-mono text-xs text-ink-soft">{vr.inspectionId}</span>
          <span className="text-ink-soft truncate">{vr.resourceName}</span>
          <button className="btn-ghost p-1.5 ml-auto" onClick={() => setListOpen(true)} aria-label="All checks">
            <List size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-2 flex-1 rounded-full bg-surface-sunk overflow-hidden">
            <div className="h-full bg-indigo transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-ink-soft">
            {progress.done}/{total}
          </span>
        </div>
        <p className="text-xs text-ink-mute mt-1" aria-live="polite">
          {saving ? 'Saving…' : vr.lastSavedAt ? `All changes saved · ${fmtDateTime(vr.lastSavedAt)}` : 'Results save as you go'}
          {' · '}
          required {progress.requiredDone}/{progress.requiredTotal}
        </p>
      </div>

      <div className="mt-4">
        {step < total ? (
          <>
            <p className="text-xs text-ink-mute mb-2">
              Check {step + 1} of {total}
            </p>
            <InspectionParameter
              key={p.id}
              parameter={p}
              evidence={evidenceBy[p.id] || []}
              baseline={baseline?.results?.[p.id]}
              actions={actions}
            />
          </>
        ) : (
          <InspectionReview
            inspection={vr}
            preview={data.preview}
            problems={data.problems}
            onJump={go}
            onSubmit={submit}
            submitting={actions.submit.isPending}
          />
        )}
      </div>

      {/* Step navigation */}
      <div className="fixed bottom-0 inset-x-0 bg-surface-alt border-t border-line p-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <button onClick={() => go(step - 1)} disabled={step === 0} className="btn-secondary h-14 flex-1 inline-flex items-center justify-center gap-1 text-base">
            <ChevronLeft size={20} /> Back
          </button>
          {step < total && (
            <button onClick={() => go(step + 1)} className="btn-primary h-14 flex-[2] inline-flex items-center justify-center gap-1 text-base">
              {step + 1 === total ? 'Review' : 'Next'} <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Jump list */}
      {listOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex justify-end" onClick={() => setListOpen(false)}>
          <div className="bg-surface w-full max-w-sm h-full overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center mb-3">
              <h2 className="h-card">All checks</h2>
              <button className="btn-ghost p-2 ml-auto" onClick={() => setListOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <ul className="space-y-1">
              {vr.parameters.map((q, i) => (
                <li key={q.id}>
                  <button
                    onClick={() => go(i)}
                    className={`w-full text-left px-3 py-3 rounded flex items-center gap-2 ${i === step ? 'bg-surface-sunk' : 'hover:bg-surface-sunk'}`}
                  >
                    <span className="text-xs text-ink-mute w-6 tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-sm">
                      {q.name}
                      {q.required && <span className="text-danger"> *</span>}
                    </span>
                    {q.result ? (
                      <span className={`badge border ${RESULT_BY_KEY[q.result].tone}`}>{RESULT_BY_KEY[q.result].short}</span>
                    ) : (
                      <span className="text-xs text-ink-mute">—</span>
                    )}
                  </button>
                </li>
              ))}
              <li>
                <button onClick={() => go(total)} className="btn-primary w-full h-12 mt-3">
                  Review and submit
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
