import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Hammer, ChevronDown,
} from 'lucide-react';
import { useAdminHealth, useAdminActions } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Spinner } from '../ui';
import { relative, dateTime } from '../../lib/format';
import { Kpi, SectionHeader, Severity, Money, ActionDialog, CopyId } from './primitives';

/**
 * The integrity audit.
 *
 * Every row here is a rule the marketplace claims to enforce, re-derived from
 * stored state rather than trusted. A clean sweep is the normal result and is
 * worth showing as such — an audit that only appears when something is wrong
 * gives you no reason to believe it ran.
 */

const ICON = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE = {
  critical: 'border-red-accent/30 bg-red-accent/[0.04]',
  warning: 'border-amber-accent/30 bg-amber-accent/[0.04]',
  info: 'border-indigo/25 bg-indigo/[0.03]',
};

export default function AdminHealth() {
  const { data, isLoading, isFetching, refetch } = useAdminHealth();
  const { repair } = useAdminActions();
  const [confirm, setConfirm] = useState(null);

  if (isLoading) return <Spinner label="Auditing the platform" />;
  if (!data) return null;

  const { summary, checks, checkedAt } = data;
  const failing = checks.filter((c) => c.count > 0);
  const clean = checks.filter((c) => c.count === 0);

  const runRepair = async (checkId) => {
    try {
      const res = await repair.mutateAsync({ checkId });
      toast.success(
        res.repaired
          ? `Repaired ${res.repaired} record${res.repaired === 1 ? '' : 's'}.`
          : 'Nothing left to repair.'
      );
      setConfirm(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <SectionHeader
        title="Integrity audit"
        subtitle={`${summary.total} invariants re-derived from stored data · last run ${relative(checkedAt)}`}
      >
        <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Re-run
        </button>
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <Kpi
          label="Checks passing"
          value={`${summary.clean}/${summary.total}`}
          icon={CheckCircle2}
          tone="green"
          sub={summary.failing ? `${summary.failing} need attention` : 'Everything reconciles'}
        />
        <Kpi label="Critical" value={summary.critical} icon={XCircle} tone="amber" sub="Money or inventory is wrong" />
        <Kpi label="Warnings" value={summary.warning} icon={AlertTriangle} tone="amber" sub="Inconsistent, not yet harmful" />
        <Kpi label="Affected records" value={summary.findings.toLocaleString('en-IN')} icon={Info} tone="indigo" sub="Total rows across all findings" />
      </div>

      {!failing.length && (
        <div className="card flex items-start gap-3 mb-7 border-green-accent/30 bg-green-accent/[0.04]">
          <span className="icon-box icon-box-green w-9 h-9 shrink-0">
            <CheckCircle2 size={17} />
          </span>
          <div>
            <p className="h-card">Every invariant holds</p>
            <p className="text-sm muted mt-0.5">
              No oversubscribed listings, no booking missing its transaction, no rating out of step with
              its reviews, and nothing stranded in the delivery pipeline.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {failing.map((check) => (
          <CheckCard
            key={check.id}
            check={check}
            onRepair={check.fix ? () => setConfirm(check) : null}
            repairing={repair.isPending && confirm?.id === check.id}
          />
        ))}
      </div>

      {clean.length > 0 && (
        <>
          <h3 className="h-card mt-8 mb-3 text-ink-soft">Passing ({clean.length})</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {clean.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-line bg-surface-alt"
              >
                <CheckCircle2 size={15} className="text-green-accent shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.label}</p>
                  <p className="text-[11px] text-ink-mute mt-0.5 line-clamp-2">{c.rule}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ActionDialog
        open={Boolean(confirm)}
        title={`Repair: ${confirm?.label || ''}`}
        description={confirm?.fix}
        confirmLabel="Run repair"
        busy={repair.isPending}
        onConfirm={() => runRepair(confirm.id)}
        onClose={() => setConfirm(null)}
      >
        <p className="text-sm muted">
          This writes to {confirm?.count} record{confirm?.count === 1 ? '' : 's'} and notifies anyone
          affected. The audit re-runs immediately afterwards so you can see the result.
        </p>
      </ActionDialog>
    </div>
  );
}

function CheckCard({ check, onRepair, repairing }) {
  const [open, setOpen] = useState(check.severity === 'critical');
  const Icon = ICON[check.severity] || Info;

  return (
    <div className={`border rounded-xl bg-surface-alt overflow-hidden ${TONE[check.severity] || ''}`}>
      <div className="flex items-start gap-3 p-4">
        <Icon
          size={18}
          className={`shrink-0 mt-0.5 ${
            check.severity === 'critical'
              ? 'text-red-accent'
              : check.severity === 'warning'
              ? 'text-amber-accent'
              : 'text-indigo'
          }`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="h-card">{check.label}</p>
            <Severity level={check.severity} />
            <span className="badge-muted tabular-nums">
              {check.count} record{check.count === 1 ? '' : 's'}
            </span>
          </div>

          <p className="text-sm muted mt-1.5">{check.rule}</p>

          {check.fix && (
            <p className="text-xs text-ink-mute mt-2">
              <span className="font-medium text-ink-soft">Fix:</span> {check.fix}
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
              <ChevronDown
                size={13}
                className={`transition-transform ${open ? 'rotate-180' : ''}`}
              />
              {open ? 'Hide' : 'Show'} affected records
            </button>
            {onRepair && (
              <button type="button" className="btn-secondary btn-sm" onClick={onRepair} disabled={repairing}>
                <Hammer size={13} />
                {repairing ? 'Repairing…' : 'Repair'}
              </button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-line/70 bg-surface-sunk/40 divide-y divide-line/50">
          {check.rows.map((row) => (
            <div key={String(row.id)} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{row.title}</p>
                <p className="text-[11px] text-ink-mute truncate">{row.detail}</p>
              </div>
              {row.amount != null && (
                <Money amount={row.amount} className="text-xs text-ink-soft shrink-0" />
              )}
              {row.at && (
                <span className="text-[11px] text-ink-mute shrink-0 hidden sm:inline">
                  {dateTime(row.at)}
                </span>
              )}
              <CopyId value={row.id} />
              {row.link && (
                <Link to={row.link} className="btn-secondary btn-sm shrink-0">
                  Open
                </Link>
              )}
            </div>
          ))}
          {check.truncated && (
            <p className="px-4 py-2.5 text-[11px] text-ink-mute">
              Showing the first 50 of {check.count}. Repairing handles all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
