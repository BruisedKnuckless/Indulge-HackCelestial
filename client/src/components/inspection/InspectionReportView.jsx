import { useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { mediaUrl } from '../../api/client';
import { COMPARISON, DECISIONS, RESULT_BY_KEY, STATUS_LABEL, statusBadge, fmtDate, fmtDateTime, humanise, FINAL_STATUSES } from '../../lib/inspection';

const CUSTODY_LABEL = {
  listing_created: 'Listing created',
  protocol_generated: 'Inspection protocol generated',
  inspection_created: 'Inspection opened',
  technician_assigned: 'Technician assigned',
  inspection_started: 'Inspection started',
  evidence_captured: 'Evidence captured',
  inspection_submitted: 'Inspection submitted',
  dispatch_checked: 'Dispatch condition check',
  handover: 'Handed over to the seeker',
  return_received: 'Return received',
  return_inspection_created: 'Return inspection opened',
  return_inspection_submitted: 'Return inspection submitted',
  damage_detected: 'Damage detected',
  dispute_resolved: 'Damage review resolved',
};

/**
 * The inspection report, shared by the technician, the listing owner, the
 * booking parties and the admin console. Everything shown is what the server
 * stored; nothing is recomputed here.
 */
export default function InspectionReportView({ report, showCustody = true }) {
  const { inspection: vr, resource, protocol, custody = [] } = report;
  const [showAll, setShowAll] = useState(false);
  const final = FINAL_STATUSES.includes(vr.status);
  const decision = DECISIONS[vr.status];
  const evidenceBy = {};
  for (const e of vr.evidence || []) (evidenceBy[e.parameterId] ||= []).push(e);
  const flagged = vr.parameters.filter((p) => p.result && p.result !== 'pass');
  const lines = showAll ? vr.parameters : flagged;
  const cmpBy = new Map((vr.comparison || []).map((c) => [c.parameterId, c]));

  return (
    <div className="space-y-5">
      {/* Headline */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink-soft">{vr.inspectionId}</span>
          <span className={`badge ${statusBadge(vr.status)}`}>{STATUS_LABEL[vr.status]}</span>
          {vr.kind === 'return' && (
            <span className="badge badge-indigo inline-flex items-center gap-1">
              <RotateCcw size={11} /> Return inspection
            </span>
          )}
        </div>
        <h1 className="h-page mt-1">{vr.resourceName}</h1>
        {final ? (
          <div className="flex flex-wrap items-end gap-6 mt-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">
                {vr.finalScore}
                <span className="text-lg text-ink-mute">/100</span>
              </p>
              <p className="text-sm text-ink-soft">Condition: {vr.conditionStatus}</p>
            </div>
            <div className="text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                <BadgeCheck size={16} className={vr.status === 'rejected' ? 'text-danger' : 'text-success'} />
                {decision?.code}
              </p>
              <p className="text-ink-soft">Inspected {fmtDate(vr.completedAt)} by {vr.assignedTechnician?.name || 'Indulge Inspection Team'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-soft mt-2">Not submitted yet — no result to report.</p>
        )}
        {vr.decisionReasons?.length > 0 && (
          <ul className="mt-3 text-sm list-disc pl-5 text-ink-soft">
            {vr.decisionReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {vr.inspectorNotes && <p className="mt-3 text-sm border-l-2 border-line-strong pl-3">{vr.inspectorNotes}</p>}
      </section>

      {/* Return comparison */}
      {vr.kind === 'return' && final && (
        <section className="card p-5">
          <h2 className="h-card mb-3">Before vs after</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            {[
              ['New damage', vr.damageSummary?.newDamage, 'text-danger'],
              ['Units missing', vr.damageSummary?.unitsLost, 'text-danger'],
              ['Pre-existing', vr.damageSummary?.preExisting, 'text-warn'],
              ['No change', vr.damageSummary?.noChange, 'text-success'],
            ].map(([label, n, tone]) => (
              <div key={label} className="card-quiet py-2">
                <p className={`text-xl font-semibold tabular-nums ${n ? tone : ''}`}>{n || 0}</p>
                <p className="text-xs text-ink-soft">{label}</p>
              </div>
            ))}
          </div>
          {(vr.comparison || []).filter((c) => ['new_damage', 'pre_existing', 'improved'].includes(c.outcome)).length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {vr.comparison
                .filter((c) => ['new_damage', 'pre_existing', 'improved'].includes(c.outcome))
                .map((c) => (
                  <li key={c.parameterId} className="py-2 flex flex-wrap items-center gap-2">
                    <span className={`badge ${COMPARISON[c.outcome].tone}`}>{COMPARISON[c.outcome].label}</span>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-ink-soft">
                      {RESULT_BY_KEY[c.before]?.short || '—'} → {RESULT_BY_KEY[c.after]?.short || '—'}
                    </span>
                    {c.note && <span className="text-ink-mute w-full">{c.note}</span>}
                  </li>
                ))}
            </ul>
          )}
          {vr.disputeStatus !== 'none' && (
            <div className={`mt-4 rounded border p-3 text-sm ${vr.disputeStatus === 'open' ? 'border-warn/40 bg-warn/5' : 'border-line'}`}>
              {vr.disputeStatus === 'open' ? (
                <p>Damage review is open with Indulge. Both parties will be notified of the decision.</p>
              ) : (
                <p>
                  Damage review resolved {fmtDate(vr.resolution?.resolvedAt)}: <strong>{humanise(vr.resolution?.decision)}</strong>
                  {vr.resolution?.amount != null ? ` · ₹${Number(vr.resolution.amount).toLocaleString('en-IN')} (simulated)` : ''}. {vr.resolution?.note}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Results */}
      <section className="card p-5">
        <div className="flex items-center mb-3">
          <h2 className="h-card">{showAll ? 'All checks' : 'Issues found'}</h2>
          <button className="btn-ghost btn-sm ml-auto inline-flex items-center gap-1" onClick={() => setShowAll((s) => !s)}>
            {showAll ? (
              <>
                Issues only <ChevronUp size={14} />
              </>
            ) : (
              <>
                All {vr.parameters.length} checks <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-ink-soft">{final ? 'Every applicable check passed.' : 'No issues recorded yet.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((p) => {
              const r = RESULT_BY_KEY[p.result];
              const ev = evidenceBy[p.id] || [];
              const cmp = cmpBy.get(p.id);
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {r ? <span className={`badge border ${r.tone}`}>{r.short}</span> : <span className="badge badge-muted">Not checked</span>}
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.required && <span className="text-xs text-ink-mute">required</span>}
                    {cmp && cmp.outcome !== 'no_change' && cmp.outcome !== 'not_compared' && (
                      <span className={`badge ${COMPARISON[cmp.outcome].tone}`}>{COMPARISON[cmp.outcome].label}</span>
                    )}
                    <span className="text-xs text-ink-mute ml-auto">weight {p.weight}</span>
                  </div>
                  {(p.claimedValue || p.observedValue) && (
                    <p className="text-xs text-ink-soft mt-1">
                      {p.claimedValue && <>Claimed {p.claimedValue}</>}
                      {p.claimedValue && p.observedValue && ' · '}
                      {p.observedValue && <>Observed {p.observedValue}</>}
                    </p>
                  )}
                  {p.note && <p className="text-sm mt-1">{p.note}</p>}
                  {ev.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ev.map((e) =>
                        e.type === 'photo' ? (
                          <a key={e.evidenceId} href={mediaUrl(e.url)} target="_blank" rel="noreferrer" title={`${e.evidenceId} · ${fmtDateTime(e.capturedAt)}`}>
                            <img src={mediaUrl(e.url)} alt={e.text || e.evidenceId} className="w-20 h-20 rounded object-cover border border-line" />
                          </a>
                        ) : e.type === 'video' ? (
                          <video key={e.evidenceId} src={mediaUrl(e.url)} controls className="w-40 h-24 rounded border border-line bg-surface-sunk" />
                        ) : (
                          <span key={e.evidenceId} className="tag text-xs">
                            {e.type === 'measurement' ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : e.text}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {final && vr.scoreBreakdown && (
          <p className="text-xs text-ink-mute mt-3">
            {vr.scoreBreakdown.formula}. Earned {vr.scoreBreakdown.earned} of {vr.scoreBreakdown.possible} weighted points.
          </p>
        )}
      </section>

      {/* Provenance */}
      <section className="card p-5 text-sm">
        <h2 className="h-card mb-2">How this inspection was set up</h2>
        <p className="text-ink-soft">
          Checklist from protocol <span className="font-mono">{protocol?.protocolId}</span> v{protocol?.version} ({protocol?.categoryLabel}),{' '}
          {protocol?.generator === 'category_template'
            ? 'built from the category template because the generator was unavailable'
            : protocol?.generation?.ai?.status === 'ok'
              ? 'generated from the category baseline plus AI-suggested checks, each validated'
              : 'generated from the category baseline (no AI suggestions used)'}
          . {vr.parameters.length} checks. The protocol only lists what to check — every result above comes from the technician's physical inspection.
        </p>
        {resource && (
          <p className="text-ink-soft mt-2">
            Listing: {resource.title}
            {resource.brand ? ` · ${resource.brand}` : ''}
            {resource.model ? ` ${resource.model}` : ''}
          </p>
        )}
      </section>

      {showCustody && custody.length > 0 && (
        <section className="card p-5">
          <h2 className="h-card mb-3">Chain of custody</h2>
          <ol className="relative border-l border-line ml-2 space-y-3">
            {custody.map((c) => (
              <li key={c._id} className="relative pl-4 text-sm">
                <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-surface border-2 border-line-strong" />
                <p className="font-medium">{CUSTODY_LABEL[c.event] || humanise(c.event)}</p>
                <p className="text-xs text-ink-soft">
                  {fmtDateTime(c.at)} · {c.actorName || humanise(c.actorType)}
                  {c.details?.inspectionId ? ` · ${c.details.inspectionId}` : ''}
                  {c.details?.score != null ? ` · ${c.details.score}/100` : ''}
                  {c.evidence?.length ? ` · ${c.evidence.length} evidence` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs text-ink-mute">
        {report.disclaimer ||
          'This report records what an Indulge technician physically checked at the time of inspection. It is not a guarantee of future condition.'}
      </p>
    </div>
  );
}
