import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useParseRequirement } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Alert } from '../ui';
import { toLocalInput } from '../../lib/format';

const EXAMPLE = 'Need 250 banquet chairs + PA system in Navi Mumbai, 12 Oct 6pm–11pm, budget 40k, urgent';

export const INTAKE_FIELD_LABELS = {
  title: 'title',
  category: 'category',
  description: 'details',
  quantity: 'quantity',
  unit: 'unit',
  minCapacity: 'capacity',
  maxPrice: 'budget',
  location: 'location',
  dates: 'dates',
  urgency: 'urgency',
};

function statusLine(ai) {
  if (ai.status === 'ok') {
    const who = ai.aligned ? 'Indulge-RFQ, our Nugen-aligned model' : 'the Nugen base model (alignment pending)';
    const confidence = ai.confidenceScore != null ? ` · ${Math.round(ai.confidenceScore)}% confidence` : '';
    return `Filled by ${who}${confidence} · ${ai.latencyMs} ms`;
  }
  if (ai.status === 'failed') return `Nugen could not answer (${ai.reason}), so the rule parser filled the form.`;
  return 'Filled by the rule parser: the Nugen model is not configured on this server.';
}

/**
 * "Describe what you need" box on Post Requirement. Sends the text to the
 * server's intake (Nugen-aligned model via LangChain, grounded, with a rule
 * fallback) and hands the draft to the form. The seeker reviews every field
 * before anything is posted.
 */
export default function SmartIntake({ onApply }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const parse = useParseRequirement();

  const submit = async (e) => {
    e.preventDefault();
    setResult(null);
    try {
      const data = await parse.mutateAsync({ text: text.trim(), today: toLocalInput(new Date()).slice(0, 10) });
      setResult(data);
      if (Object.keys(data.draft || {}).length) onApply(data);
    } catch {
      // shown from parse.error below
    }
  };

  const filled = result ? Object.keys(result.draft || {}).length : 0;
  const check = (result?.check || []).map((f) => INTAKE_FIELD_LABELS[f] || f);

  return (
    <section className="card p-5 mb-10 max-w-prose">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-indigo" />
        <h2 className="text-sm font-semibold text-ink">Describe what you need</h2>
        <span className="badge-indigo">Nugen · LangChain</span>
      </div>
      <p className="text-xs muted mb-3">
        Write it the way you would message a supplier. Our aligned model fills the form below; you check it before posting.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. ${EXAMPLE}`}
          className="field-area"
          aria-label="Describe what you need"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={parse.isPending || text.trim().length < 3} className="btn-primary py-2">
            {parse.isPending ? 'Reading…' : 'Fill the form'}
          </button>
          {!text && (
            <button type="button" onClick={() => setText(EXAMPLE)} className="text-xs link">
              Try an example
            </button>
          )}
        </div>
      </form>

      {parse.isError && (
        <Alert tone="error" className="mt-3">
          {errorMessage(parse.error, 'Could not read that request.')}
        </Alert>
      )}

      {result && (
        <div className="mt-3 space-y-1.5 text-xs">
          {filled ? (
            <p className="text-ink-soft">{statusLine(result.ai)}</p>
          ) : (
            <p className="text-ink-soft">
              Could not read anything from that. Try saying what, how many, where and when.
            </p>
          )}
          {check.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="badge-amber">Please check</span>
              <span className="text-ink-soft">{check.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
