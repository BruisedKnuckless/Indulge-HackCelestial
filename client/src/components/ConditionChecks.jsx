import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, ClipboardCheck } from 'lucide-react';
import { useRecordConditionCheck } from '../hooks/queries';
import { errorMessage } from '../api/client';
import { dateTime } from '../lib/format';

/**
 * Before/after condition checks on a booking, one per checkpoint of its
 * delivery plan (dispatch → delivery → return). Shows what was recorded to
 * both sides, and lets whoever holds the goods at that moment record the next
 * one. The API enforces the same rules (who, order, once only, checklist).
 */

const RECORDERS = { dispatch: ['lister', 'logistics'], delivery: ['seeker', 'logistics'], return: ['lister', 'logistics'] };
const OVERALL = {
  good: { label: 'Good', cls: 'badge-green' },
  minor_issues: { label: 'Minor issues', cls: 'badge-amber' },
  damaged: { label: 'Damaged', cls: 'badge-red' },
};
const ROLE_LABEL = { lister: 'Lister', seeker: 'Seeker', logistics: 'Logistics crew' };

function Recorded({ check, quantity }) {
  const short = check.countVerified != null && check.countVerified < quantity;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={OVERALL[check.overall]?.cls}>{OVERALL[check.overall]?.label}</span>
        <span className="text-xs text-ink-soft">
          {ROLE_LABEL[check.role]}
          {check.recordedBy?.businessName ? ` · ${check.recordedBy.businessName}` : ''} · {dateTime(check.recordedAt)}
        </span>
      </div>
      {check.countVerified != null && (
        <p className={`text-sm ${short ? 'text-red-accent font-medium' : 'text-ink-soft'}`}>
          {check.countVerified} of {quantity} counted{short ? ' — short' : ''}
        </p>
      )}
      <ul className="space-y-1">
        {check.items.map((i) => (
          <li key={i.key} className="flex gap-2 text-sm">
            {i.ok ? (
              <Check size={15} className="text-green-accent shrink-0 mt-0.5" aria-label="Passed" />
            ) : (
              <X size={15} className="text-red-accent shrink-0 mt-0.5" aria-label="Issue" />
            )}
            <span>
              {i.label}
              {i.note && <span className="block text-xs text-ink-soft">“{i.note}”</span>}
            </span>
          </li>
        ))}
      </ul>
      {check.notes && <p className="text-sm text-ink-soft border-l-2 border-line pl-3">{check.notes}</p>}
    </div>
  );
}

function RecordForm({ checkpoint, quantity, bookingId }) {
  const record = useRecordConditionCheck(bookingId);
  const [answers, setAnswers] = useState(() => Object.fromEntries(checkpoint.items.map((i) => [i.key, { ok: true, note: '' }])));
  const [count, setCount] = useState(quantity);
  const [overall, setOverall] = useState('good');
  const [notes, setNotes] = useState('');

  const setItem = (key, patch) => setAnswers((a) => ({ ...a, [key]: { ...a[key], ...patch } }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      await record.mutateAsync({
        checkpoint: checkpoint.key,
        items: checkpoint.items.map((i) => ({ key: i.key, ok: answers[i.key].ok, note: answers[i.key].note })),
        countVerified: Number(count),
        overall,
        notes,
      });
      toast.success(`${checkpoint.label} check recorded`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record the check.'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <ul className="space-y-2">
        {checkpoint.items.map((i) => {
          const a = answers[i.key];
          return (
            <li key={i.key} className="rounded-lg border border-line px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm">{i.label}</span>
                <div className="flex shrink-0 rounded-lg border border-line overflow-hidden" role="group" aria-label={i.label}>
                  <button
                    type="button"
                    onClick={() => setItem(i.key, { ok: true })}
                    aria-pressed={a.ok}
                    className={`px-2.5 h-7 text-xs ${a.ok ? 'bg-green-accent/15 text-green-accent font-medium' : 'text-ink-soft'}`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setItem(i.key, { ok: false })}
                    aria-pressed={!a.ok}
                    className={`px-2.5 h-7 text-xs border-l border-line ${!a.ok ? 'bg-red-accent/15 text-red-accent font-medium' : 'text-ink-soft'}`}
                  >
                    Issue
                  </button>
                </div>
              </div>
              {!a.ok && (
                <input
                  className="field mt-2"
                  placeholder="What is wrong?"
                  value={a.note}
                  onChange={(e) => setItem(i.key, { note: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`count-${checkpoint.key}`}>Units counted</label>
          <input
            id={`count-${checkpoint.key}`}
            type="number"
            min="0"
            className="field"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`overall-${checkpoint.key}`}>Overall condition</label>
          <select
            id={`overall-${checkpoint.key}`}
            className="field-select w-full"
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
          >
            <option value="good">Good</option>
            <option value="minor_issues">Minor issues</option>
            <option value="damaged">Damaged</option>
          </select>
        </div>
      </div>
      <textarea
        className="field min-h-[72px]"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={record.isPending}>
        {record.isPending ? 'Recording…' : `Record ${checkpoint.label.toLowerCase()} check`}
      </button>
    </form>
  );
}

export default function ConditionChecks({ booking, user }) {
  const plan = booking.deliveryPlan;
  if (!plan?.requiresDelivery) return null;

  const role =
    String(booking.provider?._id) === String(user?._id)
      ? 'lister'
      : String(booking.seeker?._id) === String(user?._id)
      ? 'seeker'
      : user?.userType === 'logistics_partner'
      ? 'logistics'
      : null;
  const active = ['accepted', 'confirmed', 'completed'].includes(booking.status);
  const recorded = Object.fromEntries((booking.conditionChecks || []).map((c) => [c.checkpoint, c]));

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-soft flex items-start gap-1.5">
        <ClipboardCheck size={13} className="mt-px shrink-0" aria-hidden />
        Condition is recorded before delivery, after delivery and on return, so any damage or shortfall can be traced
        to the leg where it happened. Both sides see every record.
      </p>
      <ol className="space-y-3">
        {plan.checkpoints.map((cp, idx) => {
          const done = recorded[cp.key];
          const previousDone = idx === 0 || recorded[plan.checkpoints[idx - 1].key];
          const canRecord = !done && active && previousDone && RECORDERS[cp.key].includes(role);
          return (
            <li key={cp.key} className="rounded-lg border border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <p className="text-sm font-semibold">
                  {idx + 1}. {cp.label}
                  <span className="font-normal text-ink-mute"> · {cp.where}</span>
                </p>
                {!done && (
                  <span className="text-[11px] text-ink-mute">
                    Recorded by the {RECORDERS[cp.key].map((r) => ROLE_LABEL[r].toLowerCase()).join(' or ')}
                  </span>
                )}
              </div>
              {done ? (
                <Recorded check={done} quantity={booking.requestedQuantity} />
              ) : canRecord ? (
                <RecordForm checkpoint={cp} quantity={booking.requestedQuantity} bookingId={booking._id} />
              ) : (
                <p className="text-sm text-ink-mute">
                  {!active
                    ? 'Starts once the booking is accepted.'
                    : !previousDone
                    ? 'Waiting for the previous check.'
                    : 'Not recorded yet.'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
