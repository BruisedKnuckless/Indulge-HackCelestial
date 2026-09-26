import { useEffect, useState } from 'react';
import { AlertTriangle, History, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import EvidenceCapture from './EvidenceCapture';
import { errorMessage } from '../../api/client';
import { RESULTS, RESULT_BY_KEY, humanise } from '../../lib/inspection';

/**
 * One check, sized for a phone held in one hand: instructions, the
 * provider's claim, the baseline result on a return, four large result
 * buttons, and evidence. Every tap is saved straight away; typed values save
 * when the field loses focus.
 */
export default function InspectionParameter({ parameter: p, evidence, baseline, actions, disabled }) {
  const [observed, setObserved] = useState(p.observedValue || '');
  const [note, setNote] = useState(p.note || '');
  useEffect(() => {
    setObserved(p.observedValue || '');
    setNote(p.note || '');
  }, [p.id, p.observedValue, p.note]);

  const save = async (body) => {
    try {
      await actions.record.mutateAsync({ parameterId: p.id, ...body });
    } catch (err) {
      toast.error(errorMessage(err, 'Not saved — check your connection'));
    }
  };

  const hasMedia = evidence.some((e) => e.type === 'photo' || e.type === 'video');
  const needsMedia = p.result === 'fail' && (p.required || p.requiresEvidenceOnFail) && !hasMedia;
  const needsSomething = p.result === 'minor_issue' && p.requiresEvidenceOnFail && evidence.length === 0 && !note.trim();
  const needsReason = p.result === 'not_applicable' && p.required && !note.trim();
  const askValue = Boolean(p.claimedValue) || ['measurement', 'comparison', 'serial_check'].includes(p.verificationType);

  return (
    <article>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="badge badge-muted">{humanise(p.category)}</span>
        {p.required ? <span className="badge badge-indigo">Required</span> : <span className="badge badge-muted">Optional</span>}
        {p.priority === 'critical' && <span className="badge badge-red">Critical</span>}
        {p.generationSource !== 'baseline' && <span className="badge badge-teal">AI-suggested</span>}
      </div>
      <h2 className="text-xl font-semibold text-ink leading-snug">{p.name}</h2>
      {p.description && <p className="text-sm text-ink-soft mt-1">{p.description}</p>}

      {p.requiresQualifiedInspector && (
        <p className="mt-3 text-sm text-warn flex items-start gap-1.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" /> Needs a qualified inspector. If you are not qualified, mark Not applicable and say so.
        </p>
      )}

      {p.instructions?.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-sm list-decimal pl-5">
          {p.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      <div className="mt-4 grid gap-2 text-sm">
        {p.claimedValue && (
          <div className="card-quiet px-3 py-2 flex justify-between gap-3">
            <span className="text-ink-soft">Provider claims</span>
            <span className="font-semibold">{p.claimedValue}</span>
          </div>
        )}
        {p.expectedResult && (
          <div className="card-quiet px-3 py-2">
            <span className="text-ink-soft">Expected: </span>
            {p.expectedResult}
          </div>
        )}
        {baseline && (
          <div className="card-quiet px-3 py-2 flex items-center gap-2">
            <History size={15} className="text-ink-soft shrink-0" />
            <span className="text-ink-soft">At baseline:</span>
            <span className="font-semibold">{RESULT_BY_KEY[baseline.result]?.label || 'Not recorded'}</span>
            {baseline.observedValue && <span className="text-ink-soft">· {baseline.observedValue}</span>}
            {baseline.note && <span className="text-ink-mute truncate">· {baseline.note}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-5" role="radiogroup" aria-label="Result">
        {RESULTS.map((r) => {
          const on = p.result === r.key;
          return (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => save({ result: r.key })}
              className={`h-14 rounded-lg border-2 text-base font-semibold transition-colors ${
                on ? r.tone : 'border-line bg-surface text-ink hover:bg-surface-sunk'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {askValue && (
        <div className="mt-4">
          <label className="label" htmlFor={`obs-${p.id}`}>
            Observed value
          </label>
          <input
            id={`obs-${p.id}`}
            className="field h-12"
            value={observed}
            disabled={disabled}
            placeholder={p.claimedValue ? `Claimed ${p.claimedValue}` : 'What you measured or read'}
            onChange={(e) => setObserved(e.target.value)}
            onBlur={() => observed !== (p.observedValue || '') && save({ observedValue: observed })}
          />
        </div>
      )}

      <div className="mt-4">
        <label className="label" htmlFor={`note-${p.id}`}>
          Note {needsReason ? <span className="text-danger">(required: why does it not apply?)</span> : <span className="text-ink-mute">(optional)</span>}
        </label>
        <textarea
          id={`note-${p.id}`}
          rows={2}
          className="field-area"
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (p.note || '') && save({ note })}
        />
      </div>

      <div className="mt-5">
        <h3 className="h-card mb-2">Evidence</h3>
        {(needsMedia || needsSomething) && (
          <p className="text-sm text-danger flex items-center gap-1.5 mb-2">
            <AlertTriangle size={15} />
            {needsMedia ? 'A failed required check needs a photo or video.' : 'Add evidence or a note describing the issue.'}
          </p>
        )}
        <EvidenceCapture parameter={p} evidence={evidence} actions={actions} disabled={disabled} />
      </div>
    </article>
  );
}
