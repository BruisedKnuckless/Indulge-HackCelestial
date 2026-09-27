import { useState } from 'react';
import { AlertTriangle, ShieldCheck, UserCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVerificationFee, useRequestIndulgeVerification, useSubmitExternalVerification } from '../../hooks/queries';
import { errorMessage } from '../../api/client';

/** Centred overlay dialog, matching the pattern used elsewhere in the marketplace client. */
function Dialog({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/65 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="h-card">{title}</h3>
          <button className="btn-ghost p-1.5 -mt-1 -mr-1" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Owner-only actions on an unverified or externally-verified listing:
 * request an Indulge technician (with the fee shown up front), or submit an
 * external technician's report. Rendered by VerificationBadge when isOwner.
 */
export default function VerificationActions({ resource, verification }) {
  const [dialog, setDialog] = useState(null); // 'indulge' | 'external' | null
  const { data: feeData } = useVerificationFee();
  const requestIndulge = useRequestIndulgeVerification();
  const submitExternal = useSubmitExternalVerification();

  const method = resource.verificationMethod || 'none';
  const alreadyIndulge = method === 'indulge_technician';
  const alreadyExternallyVerified = method === 'external_technician' && verification?.status === 'externally_verified';
  if (alreadyIndulge) return null; // already running or decided — the badge above says which

  const confirmIndulge = async () => {
    try {
      await requestIndulge.mutateAsync(resource._id);
      toast.success('Indulge technician requested — an inspector will be assigned shortly.');
      setDialog(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not request verification'));
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => setDialog('indulge')}>
        <ShieldCheck size={14} /> Request Indulge Verification
      </button>
      {!alreadyExternallyVerified && (
        <button className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => setDialog('external')}>
          <UserCheck size={14} /> {method === 'external_technician' ? 'Submit External Verification' : 'Use My Own Technician'}
        </button>
      )}

      {dialog === 'indulge' && (
        <Dialog title="Request Indulge Technician" onClose={() => setDialog(null)}>
          <p className="text-sm text-ink-soft mb-3">
            Indulge will arrange a technician to physically inspect this listing against an AI-generated checklist for its category.
            The listing shows the result once the inspection is complete.
          </p>
          <div className="rounded-lg bg-surface-sunk px-3 py-2.5 text-sm font-medium mb-4">
            An additional verification fee of ₹{(feeData?.amount ?? 1500).toLocaleString('en-IN')} will be charged.
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary btn-sm" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" disabled={requestIndulge.isPending} onClick={confirmIndulge}>
              {requestIndulge.isPending ? 'Requesting…' : 'Confirm Verification'}
            </button>
          </div>
        </Dialog>
      )}

      {dialog === 'external' && (
        <ExternalVerificationForm
          resource={resource}
          submitExternal={submitExternal}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function ExternalVerificationForm({ resource, submitExternal, onClose }) {
  const [form, setForm] = useState({ technicianName: '', company: '', contact: '', note: '', reportUrl: '' });
  const [file, setFile] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!acknowledged) return;
    try {
      await submitExternal.mutateAsync({ resourceId: resource._id, ...form, file });
      toast.success('External verification recorded.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not submit verification'));
    }
  };

  return (
    <Dialog title="Submit External Verification" onClose={onClose}>
      <p className="text-sm rounded-lg bg-warn/10 border border-warn/30 text-ink px-3 py-2.5 mb-4 flex items-start gap-2">
        <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
        You're choosing to arrange verification independently. Indulge will not conduct or guarantee this inspection —
        responsibility for its accuracy stays with you.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Technician / inspector name*</label>
          <input className="field" value={form.technicianName} onChange={set('technicianName')} required maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Company</label>
            <input className="field" value={form.company} onChange={set('company')} maxLength={120} />
          </div>
          <div>
            <label className="label">Contact</label>
            <input className="field" value={form.contact} onChange={set('contact')} maxLength={80} />
          </div>
        </div>
        <div>
          <label className="label">What did the inspection find?*</label>
          <textarea className="field-area" rows={3} value={form.note} onChange={set('note')} required maxLength={4000} />
        </div>
        <div>
          <label className="label">Report link (optional)</label>
          <input className="field" type="url" placeholder="https://…" value={form.reportUrl} onChange={set('reportUrl')} />
        </div>
        <div>
          <label className="label">Photo or video evidence (optional)</label>
          <input
            className="field"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          I understand Indulge did not perform this inspection and is only recording what I submit.
        </label>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={!acknowledged || submitExternal.isPending}>
            {submitExternal.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
