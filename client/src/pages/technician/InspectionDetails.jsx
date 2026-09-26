import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Play, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTechInspection, useTechInspectionActions } from '../../hooks/queries';
import { errorMessage, mediaUrl } from '../../api/client';
import { Spinner, EmptyState } from '../../components/ui';
import { STATUS_LABEL, statusBadge, fmtDateTime, FINAL_STATUSES, humanise } from '../../lib/inspection';

/** Pre-visit brief: what the item is, what the provider claims, and what will be checked. */
export default function InspectionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useTechInspection(id);
  const { start } = useTechInspectionActions(id);

  if (isLoading) return <Spinner label="Loading inspection" />;
  if (error || !data) {
    return <EmptyState title="Inspection not found" message="It may not be assigned to you." action={<Link to="/technician" className="btn-primary">Back to queue</Link>} />;
  }

  const { inspection: vr, resource, protocol, progress } = data;
  const final = FINAL_STATUSES.includes(vr.status);
  const claims = vr.parameters.filter((p) => p.claimedValue);
  const byCategory = vr.parameters.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] || 0) + 1 }), {});
  const qualified = vr.parameters.filter((p) => p.requiresQualifiedInspector);
  const image = resource?.media?.[0]?.url || resource?.images?.[0];
  const aiStatus = protocol?.generation?.ai?.status;

  const begin = async () => {
    try {
      if (vr.status !== 'in_progress') await start.mutateAsync();
      navigate(`/technician/inspections/${vr._id}/start`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
      <Link to="/technician" className="link-quiet text-sm inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Queue
      </Link>

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-mono text-sm text-ink-soft">{vr.inspectionId}</span>
        <span className={`badge ${statusBadge(vr.status)}`}>{STATUS_LABEL[vr.status]}</span>
        {vr.kind === 'return' && (
          <span className="badge badge-indigo inline-flex items-center gap-1">
            <RotateCcw size={11} /> Return inspection
          </span>
        )}
      </div>
      <h1 className="h-page">{vr.resourceName}</h1>
      <p className="text-sm text-ink-soft flex items-center gap-1 mt-1">
        <MapPin size={14} />
        {[vr.location?.address, vr.location?.city].filter(Boolean).join(', ') || 'At the provider'}
        {vr.scheduledAt ? ` · ${fmtDateTime(vr.scheduledAt)}` : ''}
      </p>

      {vr.kind === 'return' && (
        <div className="card p-4 mt-4 text-sm">
          Re-run the same checklist as the baseline inspection
          {data.baseline ? (
            <>
              {' '}
              <span className="font-mono">{data.baseline.inspectionId}</span> ({data.baseline.finalScore}/100, {fmtDateTime(data.baseline.completedAt)})
            </>
          ) : null}
          . Each check shows the baseline result so you can record what changed.
        </div>
      )}

      <section className="card p-4 mt-4 flex gap-4">
        {image && <img src={mediaUrl(image)} alt="" className="w-24 h-24 rounded object-cover shrink-0 bg-surface-sunk" />}
        <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 min-w-0">
          {resource?.brand && (<><dt className="text-ink-soft">Brand</dt><dd>{resource.brand}</dd></>)}
          {resource?.model && (<><dt className="text-ink-soft">Model</dt><dd>{resource.model}</dd></>)}
          {resource?.declaredCondition && (<><dt className="text-ink-soft">Declared</dt><dd>{resource.declaredCondition}</dd></>)}
          <dt className="text-ink-soft">Quantity</dt>
          <dd>{vr.quantity}</dd>
          {resource?.accessories?.length > 0 && (<><dt className="text-ink-soft">Accessories</dt><dd>{resource.accessories.join(', ')}</dd></>)}
        </dl>
      </section>

      {claims.length > 0 && (
        <section className="mt-5">
          <h2 className="h-card mb-2">Provider claims to verify</h2>
          <ul className="card divide-y divide-line">
            {claims.map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex justify-between gap-3 text-sm">
                <span className="text-ink-soft">{c.name}</span>
                <span className="font-medium text-right">{c.claimedValue}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-mute mt-1.5">Claims are what the provider stated. Record what you actually observe.</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="h-card mb-2">Checklist</h2>
        <div className="card p-4 text-sm space-y-2">
          <p>
            <span className="font-semibold">{progress.total}</span> checks, <span className="font-semibold">{progress.requiredTotal}</span> required ·{' '}
            {progress.done} recorded so far
          </p>
          <p className="text-ink-soft">
            {Object.entries(byCategory).map(([k, n]) => `${humanise(k)} ${n}`).join(' · ')}
          </p>
          {protocol?.inspectionScope?.rule && <p className="text-ink-soft">{protocol.inspectionScope.rule}</p>}
          {qualified.length > 0 && (
            <p className="flex items-start gap-1.5 text-warn">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              {qualified.length} check{qualified.length === 1 ? '' : 's'} need a qualified inspector: {qualified.map((q) => q.name).join(', ')}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-ink-mute text-xs">
            <Sparkles size={13} className="mt-0.5 shrink-0" />
            Protocol {protocol?.protocolId} v{protocol?.version} ·{' '}
            {protocol?.generator === 'category_template'
              ? 'category template (generator unavailable)'
              : aiStatus === 'ok'
                ? 'category baseline + AI suggestions, validated'
                : 'category baseline (AI not used)'}
          </p>
        </div>
      </section>

      <div className="fixed bottom-0 inset-x-0 bg-surface-alt border-t border-line p-3">
        <div className="max-w-3xl mx-auto">
          {final ? (
            <Link to={`/technician/inspections/${vr._id}/report`} className="btn-primary w-full h-14 text-base">
              View report
            </Link>
          ) : (
            <button onClick={begin} disabled={start.isPending} className="btn-primary w-full h-14 text-base inline-flex items-center justify-center gap-2">
              <Play size={18} />
              {vr.status === 'in_progress' ? 'Continue inspection' : 'Start inspection'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
