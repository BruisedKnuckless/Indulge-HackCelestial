import { useState } from 'react';
import { Truck, Users, Package, ShieldAlert, ClipboardCheck, Info } from 'lucide-react';
import { inr } from '../lib/format';

/**
 * How a listing has to be moved: crew, vehicle, packaging, fragility, the
 * condition checks the handlers do, and what each side needs to do.
 *
 * The plan comes from the delivery model on the API (server/src/ml/delivery),
 * so both seeker and lister read exactly the same thing. The cost is an
 * indicative range only — handling is agreed between the parties and never
 * added to the price.
 */

const TIER_BADGE = {
  self_handled: 'badge-muted',
  standard_movers: 'badge-teal',
  professional_handlers: 'badge-indigo',
};
const FRAGILITY_BADGE = { low: 'badge-muted', medium: 'badge-amber', high: 'badge-red' };

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-mute">
        <Icon size={12} aria-hidden /> {label}
      </dt>
      <dd className="text-sm font-medium text-ink mt-0.5">{value}</dd>
    </div>
  );
}

export default function DeliveryConditions({ assessment, loading, title = 'Delivery & handling', note, wide = false }) {
  const [why, setWhy] = useState(false);

  if (loading && !assessment) {
    return (
      <section className="card">
        <p className="text-sm text-ink-mute">Working out delivery conditions…</p>
      </section>
    );
  }
  if (!assessment) return null;

  const { labels, quantity } = assessment;

  if (!assessment.requiresDelivery) {
    return (
      <section className="card">
        <h2 className="h-card mb-1 flex items-center gap-2">
          <Truck size={16} aria-hidden /> {title}
        </h2>
        <p className="text-sm text-ink-soft">{assessment.summary}</p>
      </section>
    );
  }

  const { plan, cost, confidence, drivers, instructions, checkpoints } = assessment;
  const checklist = checkpoints?.[0]?.items || [];

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="h-card flex items-center gap-2">
            <Truck size={16} aria-hidden /> {title}
          </h2>
          <p className="text-xs text-ink-mute mt-0.5">
            For {quantity} unit{quantity === 1 ? '' : 's'}
            {note ? ` · ${note}` : ''}
          </p>
        </div>
        <span className={TIER_BADGE[plan.tier] || 'badge-muted'}>
          {labels.tier[plan.tier]}
          {!assessment.selfPropelled && plan.tier !== 'self_handled' ? ` · ${plan.crew}-person crew` : ''}
        </span>
      </div>

      <dl className={`grid grid-cols-2 ${wide ? 'sm:grid-cols-4' : ''} gap-x-4 gap-y-3 rounded-lg bg-surface-sunk/50 px-3.5 py-3`}>
        <Stat
          icon={Users}
          label="Handlers"
          value={assessment.selfPropelled ? 'Driver included' : plan.tier === 'self_handled' ? 'Self-collect' : `${plan.crew} people`}
        />
        <Stat icon={Truck} label="Vehicle" value={labels.vehicle[plan.vehicle]} />
        <Stat icon={Package} label="Packaging" value={labels.packaging[plan.packaging]} />
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-[11px] text-ink-mute">
            <ShieldAlert size={12} aria-hidden /> Fragility
          </dt>
          <dd className="mt-1">
            <span className={FRAGILITY_BADGE[plan.fragility]}>{labels.fragility[plan.fragility]}</span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mt-3">
        <p className="text-sm">
          <span className="text-ink-soft">Indicative handling cost </span>
          <span className="font-semibold tabular-nums">
            {cost.max > 0 ? `${inr(cost.min)} – ${inr(cost.max)}` : 'None'}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          className="text-xs link-quiet inline-flex items-center gap-1 hover:text-ink"
        >
          Why this plan? <span className={`text-[10px] transition-transform ${why ? 'rotate-180' : ''}`}>▾</span>
        </button>
      </div>
      <p className="text-[11px] text-ink-mute mt-0.5">
        Advisory only — handling and transport are agreed between the lister and the seeker and are not added to
        the price.
      </p>

      {why && (
        <div className="mt-3 rounded-lg border border-line px-3.5 py-3">
          <ul className="space-y-1 text-sm">
            {drivers.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="text-indigo" aria-hidden>•</span>
                {d}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-mute mt-2 flex items-start gap-1.5">
            <Info size={12} className="mt-px shrink-0" aria-hidden />
            Predicted by Indulge’s delivery model from this listing’s category, quantity, price and description
            {confidence?.overall != null ? ` · confidence ${Math.round(confidence.overall * 100)}%` : ''}.
          </p>
        </div>
      )}

      <div className={`grid gap-4 mt-4 ${wide ? 'sm:grid-cols-2' : ''}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute mb-1.5">For the lister</p>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {instructions.lister.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-ink-mute" aria-hidden>–</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute mb-1.5">For the seeker</p>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {instructions.seeker.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-ink-mute" aria-hidden>–</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute mb-1.5 flex items-center gap-1.5">
          <ClipboardCheck size={12} aria-hidden /> Condition check · {labels.checkLevel[plan.checkLevel]}
        </p>
        <p className="text-xs text-ink-soft mb-2">
          Recorded {checkpoints.map((c) => c.label.toLowerCase()).join(', ')} — both sides see each record.
        </p>
        <ul className={`grid gap-x-4 gap-y-1 text-sm ${wide ? 'sm:grid-cols-2' : ''}`}>
          {checklist.map((i) => (
            <li key={i.key} className="flex gap-2">
              <span className="text-green-accent" aria-hidden>✓</span>
              {i.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
