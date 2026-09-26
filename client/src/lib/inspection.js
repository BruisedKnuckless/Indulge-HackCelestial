/**
 * Shared vocabulary for listing inspections. The server decides every
 * outcome; these only label and colour what it returns.
 */

export const RESULTS = [
  { key: 'pass', label: 'Pass', short: 'Pass', tone: 'border-success/40 bg-success/10 text-success' },
  { key: 'minor_issue', label: 'Minor issue', short: 'Minor', tone: 'border-warn/40 bg-warn/10 text-warn' },
  { key: 'fail', label: 'Fail', short: 'Fail', tone: 'border-danger/40 bg-danger/10 text-danger' },
  { key: 'not_applicable', label: 'Not applicable', short: 'N/A', tone: 'border-line-strong bg-surface-sunk text-ink-soft' },
];
export const RESULT_BY_KEY = Object.fromEntries(RESULTS.map((r) => [r.key, r]));

export const DECISIONS = {
  verified: { label: 'Verified', code: 'VERIFIED', tone: 'badge-green' },
  conditionally_verified: { label: 'Verified with issues', code: 'VERIFIED_WITH_ISSUES', tone: 'badge-amber' },
  rejected: { label: 'Failed', code: 'FAILED', tone: 'badge-red' },
};

export const STATUS_LABEL = {
  pending: 'Awaiting assignment',
  assigned: 'Assigned',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  verified: 'Verified',
  conditionally_verified: 'Verified with issues',
  rejected: 'Failed',
};

export const COMPARISON = {
  new_damage: { label: 'New damage', tone: 'badge-red' },
  pre_existing: { label: 'Pre-existing', tone: 'badge-amber' },
  no_change: { label: 'No change', tone: 'badge-green' },
  improved: { label: 'Improved', tone: 'badge-teal' },
  not_compared: { label: 'Not compared', tone: 'badge-muted' },
};

export const FINAL_STATUSES = ['verified', 'conditionally_verified', 'rejected'];

export function statusBadge(status) {
  if (DECISIONS[status]) return DECISIONS[status].tone;
  if (status === 'in_progress') return 'badge-indigo';
  if (status === 'assigned' || status === 'scheduled') return 'badge-teal';
  return 'badge-muted';
}

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const humanise = (s) => String(s || '').replace(/_/g, ' ');
