/**
 * Inspection scoring, submission rules and before/after comparison.
 *
 * Pure functions over an inspection's parameter list, so the same maths runs
 * on submit, in the admin console and in verify.js. Everything returned here is
 * shown to people, so every number carries the reason it came out that way.
 *
 * Score = Σ(weight × points) / Σ(weight) × 100 over the checks that apply:
 *   pass 1 · minor_issue 0.5 · fail 0 · not_applicable excluded
 * Optional checks the technician skipped are excluded too (and listed).
 */

export const RESULT_POINTS = { pass: 1, minor_issue: 0.5, fail: 0 };
export const PASS_MARK = 60;

const RANK = { pass: 0, minor_issue: 1, fail: 2 };
const plain = (p) => (typeof p?.toObject === 'function' ? p.toObject() : p);

export function conditionFor(score) {
  if (score == null) return 'Poor';
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Attention';
  return 'Poor';
}

/** Evidence items attached to one parameter. */
export function evidenceFor(inspection, parameterId) {
  return (inspection.evidence || []).filter((e) => e.parameterId === parameterId);
}

/**
 * Everything that stops an inspection being submitted. An empty list means it
 * may be submitted.
 */
export function submissionProblems(inspection) {
  const params = (inspection.parameters || []).map(plain);
  const problems = [];

  const remaining = params.filter((p) => p.required && !p.result);
  if (remaining.length) {
    problems.push({
      code: 'REQUIRED_REMAINING',
      message: `Cannot submit inspection. ${remaining.length} required check${remaining.length === 1 ? '' : 's'} remain${remaining.length === 1 ? 's' : ''}.`,
      parameterIds: remaining.map((p) => p.id),
    });
  }

  for (const p of params) {
    const ev = evidenceFor(inspection, p.id);
    const media = ev.filter((e) => e.type === 'photo' || e.type === 'video');
    if (p.result === 'fail' && (p.required || p.requiresEvidenceOnFail) && media.length === 0) {
      problems.push({
        code: 'FAIL_NEEDS_EVIDENCE',
        message: `"${p.name}" failed — attach a photo or video as evidence.`,
        parameterIds: [p.id],
      });
    }
    if (p.result === 'minor_issue' && p.requiresEvidenceOnFail && ev.length === 0 && !p.note?.trim()) {
      problems.push({
        code: 'MINOR_NEEDS_EVIDENCE',
        message: `"${p.name}" has a minor issue — add evidence or a note describing it.`,
        parameterIds: [p.id],
      });
    }
    if (p.result === 'not_applicable' && p.required && !p.note?.trim()) {
      problems.push({
        code: 'NA_NEEDS_REASON',
        message: `"${p.name}" is required — say why it does not apply.`,
        parameterIds: [p.id],
      });
    }
  }
  return problems;
}

/**
 * Score and decision.
 *   FAILED (rejected)                       — a critical required check failed, or score < 60,
 *                                             or nothing applicable was checked
 *   VERIFIED_WITH_ISSUES (conditionally_…)  — any minor issue or failure remains
 *   VERIFIED (verified)                     — everything applicable passed
 */
export function scoreInspection(parameters = []) {
  const params = parameters.map(plain);
  const counted = params.filter((p) => p.result && p.result !== 'not_applicable');

  const lines = params.map((p) => {
    const weight = Number(p.weight) || 1;
    const excluded = !p.result ? 'not_inspected' : p.result === 'not_applicable' ? 'not_applicable' : null;
    const points = excluded ? null : RESULT_POINTS[p.result];
    return {
      parameterId: p.id,
      name: p.name,
      result: p.result || null,
      weight,
      points,
      earned: excluded ? 0 : weight * points,
      excluded,
      priority: p.priority,
      required: p.required,
    };
  });

  const possible = lines.filter((l) => !l.excluded).reduce((s, l) => s + l.weight, 0);
  const earned = lines.reduce((s, l) => s + l.earned, 0);
  const score = possible > 0 ? Math.round((earned / possible) * 100) : null;

  const counts = {
    pass: counted.filter((p) => p.result === 'pass').length,
    minor_issue: counted.filter((p) => p.result === 'minor_issue').length,
    fail: counted.filter((p) => p.result === 'fail').length,
    not_applicable: params.filter((p) => p.result === 'not_applicable').length,
    not_inspected: params.filter((p) => !p.result).length,
  };

  const criticalFailures = counted.filter((p) => p.result === 'fail' && p.required && p.priority === 'critical');
  const reasons = [];
  let status;

  if (score == null) {
    status = 'rejected';
    reasons.push('No applicable check was completed, so nothing could be verified.');
  } else if (criticalFailures.length) {
    status = 'rejected';
    reasons.push(`Critical check failed: ${criticalFailures.map((p) => p.name).join(', ')}.`);
    if (score < PASS_MARK) reasons.push(`Score ${score} is below the pass mark of ${PASS_MARK}.`);
  } else if (score < PASS_MARK) {
    status = 'rejected';
    reasons.push(`Score ${score} is below the pass mark of ${PASS_MARK}.`);
  } else if (counts.fail || counts.minor_issue) {
    status = 'conditionally_verified';
    if (counts.fail) reasons.push(`${counts.fail} non-critical check${counts.fail === 1 ? '' : 's'} failed.`);
    if (counts.minor_issue) reasons.push(`${counts.minor_issue} minor issue${counts.minor_issue === 1 ? '' : 's'} recorded.`);
  } else {
    status = 'verified';
    reasons.push('Every applicable check passed.');
  }

  const level = { verified: 'Indulge Verified', conditionally_verified: 'Conditionally Verified', rejected: 'Rejected' }[status];

  return {
    score,
    status,
    decision: { verified: 'VERIFIED', conditionally_verified: 'VERIFIED_WITH_ISSUES', rejected: 'FAILED' }[status],
    verificationLevel: level,
    conditionStatus: conditionFor(score),
    reasons,
    breakdown: {
      formula: 'score = Σ(weight × points) ÷ Σ(weight) × 100; pass 1, minor issue 0.5, fail 0; not applicable and skipped optional checks excluded',
      points: RESULT_POINTS,
      passMark: PASS_MARK,
      earned: Math.round(earned * 100) / 100,
      possible,
      counts,
      criticalFailures: criticalFailures.map((p) => p.id),
      failedParameters: counted.filter((p) => p.result === 'fail').map((p) => p.id),
      minorParameters: counted.filter((p) => p.result === 'minor_issue').map((p) => p.id),
      lines,
    },
  };
}

const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
};
const isCountCheck = (p) => /(^|_)(unit_count|count|quantity)($|_)/.test(p.id);

/**
 * Compare a return inspection with the baseline inspection it re-runs,
 * parameter by parameter.
 *   new_damage   — worse than at baseline, or units missing
 *   pre_existing — the same issue was already recorded at baseline
 *   no_change    — passed both times
 *   improved     — better than at baseline
 *   not_compared — N/A or not checked on either side
 */
export function compareInspections(baseline, current) {
  const before = new Map((baseline?.parameters || []).map((p) => [p.id, plain(p)]));
  const comparison = [];
  let unitsLost = 0;

  for (const raw of current.parameters || []) {
    const p = plain(raw);
    const b = before.get(p.id);
    const row = {
      parameterId: p.id,
      name: p.name,
      before: b?.result || null,
      after: p.result || null,
      beforeValue: b?.observedValue || b?.claimedValue || null,
      afterValue: p.observedValue || null,
      loss: 0,
      note: '',
    };

    if (isCountCheck(p)) {
      const had = toNumber(b?.observedValue) ?? toNumber(b?.claimedValue);
      const has = toNumber(p.observedValue);
      if (had != null && has != null && has < had) {
        row.loss = had - has;
        unitsLost += row.loss;
      }
    }

    const rb = RANK[row.before];
    const ra = RANK[row.after];
    if (row.loss > 0) {
      row.outcome = 'new_damage';
      row.note = `${row.loss} unit${row.loss === 1 ? '' : 's'} missing (${row.beforeValue} → ${row.afterValue}).`;
    } else if (rb === undefined || ra === undefined) {
      row.outcome = 'not_compared';
      row.note = !b ? 'Not part of the baseline inspection.' : 'Not applicable or not checked on one side.';
    } else if (ra > rb) {
      row.outcome = 'new_damage';
      row.note = `Was ${row.before.replace('_', ' ')} at baseline, now ${row.after.replace('_', ' ')}.`;
    } else if (ra < rb) {
      row.outcome = 'improved';
    } else if (ra === 0) {
      row.outcome = 'no_change';
    } else {
      row.outcome = 'pre_existing';
      row.note = 'Already recorded at the baseline inspection.';
    }
    comparison.push(row);
  }

  const count = (o) => comparison.filter((c) => c.outcome === o).length;
  const damageSummary = {
    newDamage: count('new_damage'),
    preExisting: count('pre_existing'),
    noChange: count('no_change'),
    improved: count('improved'),
    notCompared: count('not_compared'),
    unitsLost,
  };
  damageSummary.damageDetected = damageSummary.newDamage > 0 || unitsLost > 0;
  return { comparison, damageSummary };
}
