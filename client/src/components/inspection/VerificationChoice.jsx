import { ShieldCheck, UserCheck, CircleHelp, AlertTriangle } from 'lucide-react';
import { useVerificationFee } from '../../hooks/queries';

const OPTIONS = [
  {
    value: 'indulge_technician',
    icon: ShieldCheck,
    title: 'Indulge Technician',
    desc: 'Physical inspection by an Indulge technician. Additional verification fee applies.',
  },
  {
    value: 'external_technician',
    icon: UserCheck,
    title: 'My Own Technician',
    desc: 'I will arrange my own technician/inspection. Indulge does not perform or guarantee this inspection.',
  },
  {
    value: 'none',
    icon: CircleHelp,
    title: 'No Verification',
    desc: 'Continue without a physical inspection. This listing will not receive an Indulge Verified badge.',
  },
];

/**
 * The three-way choice from a new listing: an Indulge technician, the
 * lister's own external technician, or no physical verification at all.
 * Purely a choice here — nothing is requested or charged until the listing
 * is actually created.
 */
export default function VerificationChoice({ value, onChange }) {
  const { data: fee } = useVerificationFee();

  return (
    <div className="border border-line rounded p-4 mb-4">
      <p className="h-card">Physical Verification</p>
      <p className="text-xs text-ink-soft mt-0.5 mb-4">Choose how this item will be verified.</p>

      <div className="space-y-2" role="radiogroup" aria-label="Physical verification">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                selected ? 'border-indigo bg-indigo/5' : 'border-line hover:bg-surface-sunk'
              }`}
            >
              <input
                type="radio"
                name="verificationMethod"
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="mt-1"
              />
              <Icon size={17} className={`mt-0.5 shrink-0 ${selected ? 'text-indigo' : 'text-ink-soft'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="block text-xs text-ink-soft mt-0.5">{o.desc}</span>
              </span>
            </label>
          );
        })}
      </div>

      {value === 'indulge_technician' && (
        <div className="mt-3 rounded-lg bg-surface-sunk px-3 py-2.5 text-sm font-medium">
          An additional verification fee of ₹{(fee?.amount ?? 1500).toLocaleString('en-IN')} will be charged once this listing is created.
        </div>
      )}
      {value === 'external_technician' && (
        <div className="mt-3 rounded-lg bg-warn/10 border border-warn/30 px-3 py-2.5 text-sm flex items-start gap-2">
          <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
          <span>
            You're choosing to arrange verification independently. Indulge will not conduct or guarantee this inspection —
            responsibility stays with you. You can submit the technician's report after creating the listing.
          </span>
        </div>
      )}
    </div>
  );
}
