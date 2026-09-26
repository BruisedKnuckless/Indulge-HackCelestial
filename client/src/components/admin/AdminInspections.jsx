import { useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardCheck, UserPlus, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useAdminInspections, useAdminInspection, useAdminTechnicians, useAdminInspectionActions } from '../../hooks/queries';
import { errorMessage } from '../../api/client';
import { Spinner } from '../ui';
import { SectionHeader, Kpi, Toolbar, SearchBox, Segmented, DataTable, Drawer, Select } from './primitives';
import InspectionReportView from '../inspection/InspectionReportView';
import { STATUS_LABEL, statusBadge, fmtDateTime, FINAL_STATUSES } from '../../lib/inspection';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'open', label: 'Open' },
  { value: 'verified', label: 'Verified' },
  { value: 'conditionally_verified', label: 'With issues' },
  { value: 'rejected', label: 'Failed' },
];

function AssignControl({ inspection, technicians, actions }) {
  const [tech, setTech] = useState(inspection.technician?.id || inspection.assignedTechnician?.id || '');
  if (FINAL_STATUSES.includes(inspection.status)) return null;
  const assign = async () => {
    try {
      await actions.assign.mutateAsync({ id: inspection._id, technicianId: tech });
      toast.success('Technician assigned');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Select
        value={tech}
        onChange={setTech}
        placeholder="Choose technician"
        options={(technicians || []).filter((t) => !t.suspended).map((t) => ({ value: t._id, label: `${t.name} · ${t.open} open` }))}
      />
      <button className="btn-primary btn-sm" disabled={!tech || actions.assign.isPending} onClick={assign}>
        {inspection.technician || inspection.assignedTechnician?.id ? 'Reassign' : 'Assign'}
      </button>
    </div>
  );
}

function ResolveDispute({ inspection, actions }) {
  const [decision, setDecision] = useState('seeker_liable');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await actions.resolve.mutateAsync({ id: inspection._id, decision, amount: amount === '' ? null : Number(amount), note });
      toast.success('Dispute resolved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <section className="card p-4 border-warn/40">
      <h3 className="h-card mb-1 flex items-center gap-2">
        <AlertTriangle size={16} className="text-warn" /> Damage review
      </h3>
      <p className="text-sm text-ink-soft mb-3">
        Decide from the before/after comparison and the evidence below. Any charge is recorded as simulated, like every payment on Indulge.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Decision</label>
          <Select
            value={decision}
            onChange={setDecision}
            className="w-full"
            options={[
              { value: 'seeker_liable', label: 'Seeker liable' },
              { value: 'shared', label: 'Shared liability' },
              { value: 'no_liability', label: 'No liability' },
              { value: 'waived', label: 'Waived' },
            ]}
          />
        </div>
        <div>
          <label className="label">Amount (₹, optional)</label>
          <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <label className="label mt-3">Reason (recorded and sent to both parties)</label>
      <textarea className="field-area" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary mt-3" disabled={!note.trim() || actions.resolve.isPending} onClick={submit}>
        Resolve dispute
      </button>
    </section>
  );
}

function InspectionDrawer({ id, onClose, technicians, actions }) {
  const { data, isLoading } = useAdminInspection(id);
  const vr = data?.inspection;
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={vr ? `${vr.inspectionId} · ${vr.resourceName}` : 'Inspection'} subtitle={data?.provider?.businessName}>
      {isLoading || !data ? (
        <Spinner label="Loading inspection" />
      ) : (
        <>
          {!FINAL_STATUSES.includes(vr.status) && (
            <section className="card p-4">
              <h3 className="h-card mb-2">Technician</h3>
              <p className="text-sm text-ink-soft mb-3">
                {vr.assignedTechnician?.name
                  ? `${vr.assignedTechnician.name}, assigned ${fmtDateTime(vr.assignedTechnician.assignedAt)}`
                  : 'Not assigned yet.'}{' '}
                Only the assigned technician can record results.
              </p>
              <AssignControl inspection={vr} technicians={technicians} actions={actions} />
            </section>
          )}
          {data.booking && (
            <p className="text-sm text-ink-soft">
              Booking: {data.booking.seeker?.businessName} from {data.booking.provider?.businessName} · {data.booking.requestedQuantity} unit(s) ·{' '}
              {fmtDateTime(data.booking.startDateTime)} – {fmtDateTime(data.booking.endDateTime)}
            </p>
          )}
          {vr.disputeStatus === 'open' && <ResolveDispute inspection={vr} actions={actions} />}
          <InspectionReportView report={data} />
        </>
      )}
    </Drawer>
  );
}

function AddTechnician({ actions, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', title: 'Field Technician' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await actions.createTechnician.mutateAsync(form);
      toast.success('Technician account created');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="card p-4 grid sm:grid-cols-2 gap-3 mb-4">
      {[
        ['name', 'Full name', 'text'],
        ['email', 'Work email', 'email'],
        ['password', 'Initial password (min 8)', 'password'],
        ['phone', 'Phone', 'tel'],
        ['title', 'Title', 'text'],
      ].map(([k, label, type]) => (
        <div key={k}>
          <label className="label">{label}</label>
          <input className="field" type={type} value={form[k]} onChange={set(k)} required={['name', 'email', 'password'].includes(k)} />
        </div>
      ))}
      <div className="flex items-end gap-2">
        <button className="btn-primary" disabled={actions.createTechnician.isPending}>
          Create technician
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Admin console — listing inspections. Admins assign technicians and resolve
 * damage disputes; results come only from the technicians.
 */
export default function AdminInspections() {
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const params = { status: status || undefined, kind: kind || undefined, q: q || undefined };
  const { data, isLoading } = useAdminInspections(params);
  const { data: techData } = useAdminTechnicians();
  const actions = useAdminInspectionActions();
  const technicians = techData?.technicians || [];
  const counts = data?.counts || {};
  const open = ['assigned', 'scheduled', 'in_progress'].reduce((s, k) => s + (counts[k] || 0), 0);
  const done = FINAL_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0);

  const columns = [
    { key: 'inspectionId', header: 'Inspection', render: (r) => <span className="font-mono text-xs">{r.inspectionId}</span> },
    {
      key: 'item',
      header: 'Item',
      nowrap: false,
      render: (r) => (
        <div className="min-w-[160px]">
          <p className="font-medium">{r.resourceName}</p>
          <p className="text-xs text-ink-mute">
            {r.provider?.businessName}
            {r.kind === 'return' ? ' · return' : ''}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${statusBadge(r.status)}`}>{STATUS_LABEL[r.status]}</span> },
    {
      key: 'technician',
      header: 'Technician',
      render: (r) =>
        r.technician ? (
          r.technician.name
        ) : (
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpenId(r._id);
            }}
          >
            Assign
          </button>
        ),
    },
    { key: 'score', header: 'Score', align: 'right', render: (r) => (r.finalScore != null ? `${r.finalScore}/100` : `${r.completed}/${r.checks}`) },
    {
      key: 'issues',
      header: 'Failed · minor',
      align: 'center',
      render: (r) => (
        <span className={r.failed ? 'text-danger font-semibold' : 'text-ink-soft'}>
          {r.failed} · {r.minor}
        </span>
      ),
    },
    { key: 'evidence', header: 'Evidence', align: 'right' },
    {
      key: 'dispute',
      header: 'Dispute',
      render: (r) =>
        r.disputeStatus === 'open' ? <span className="badge badge-red">Open</span> : r.disputeStatus === 'resolved' ? <span className="badge badge-muted">Resolved</span> : '—',
    },
  ];

  return (
    <div>
      <SectionHeader title="Inspections" subtitle="Physical verification of listings: AI-generated checklists, executed by Indulge technicians.">
        <button className="btn-secondary btn-sm inline-flex items-center gap-1" onClick={() => setAdding((a) => !a)}>
          <UserPlus size={14} /> Add technician
        </button>
      </SectionHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Unassigned" value={counts.pending || 0} icon={Clock} tone="amber" onClick={() => setStatus('unassigned')} />
        <Kpi label="Open" value={open} icon={ClipboardCheck} tone="indigo" onClick={() => setStatus('open')} />
        <Kpi label="Completed" value={done} icon={CheckCircle2} tone="green" />
        <Kpi label="Open disputes" value={data?.openDisputes || 0} icon={AlertTriangle} tone="violet" />
      </div>

      {adding && <AddTechnician actions={actions} onDone={() => setAdding(false)} />}

      {technicians.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {technicians.map((t) => (
            <span key={t._id} className="tag">
              {t.name} · {t.open} open · {t.completed} done
            </span>
          ))}
        </div>
      )}

      <Toolbar>
        <Segmented value={status} onChange={setStatus} options={STATUS_FILTERS} />
        <Select value={kind} onChange={setKind} placeholder="Initial + return" options={[{ value: 'initial', label: 'Initial' }, { value: 'return', label: 'Return' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Item or INS id" />
      </Toolbar>

      {isLoading ? <Spinner label="Loading inspections" /> : <DataTable columns={columns} rows={data?.inspections} onRowClick={(r) => setOpenId(r._id)} empty="No inspections match." />}

      <InspectionDrawer id={openId} onClose={() => setOpenId(null)} technicians={technicians} actions={actions} />
    </div>
  );
}
