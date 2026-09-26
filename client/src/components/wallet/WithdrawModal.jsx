import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, CheckCircle, ShieldCheck, Building, Smartphone, AlertCircle } from 'lucide-react';
import { useWalletActions } from '../../hooks/queries';
import { inr } from '../../lib/format';
import { errorMessage } from '../../api/client';

export default function WithdrawModal({ isOpen, onClose, maxAvailable = 0, onSuccess }) {
  const { withdraw } = useWalletActions();
  const [amount, setAmount] = useState(maxAvailable ? String(maxAvailable) : '');
  const [payoutMethod, setPayoutMethod] = useState('bank_transfer');
  const [accountNumber, setAccountNumber] = useState('•••• •••• •••• 4821');
  const [ifsc, setIfsc] = useState('HDFC0001234');
  const [upiId, setUpiId] = useState('provider@okhdfcbank');
  const [processing, setProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  if (!isOpen) return null;

  const withdrawAmount = Number(amount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || withdrawAmount <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (withdrawAmount > maxAvailable) {
      toast.error(`Amount exceeds available withdrawable balance (${inr(maxAvailable)}).`);
      return;
    }

    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));

      const res = await withdraw.mutateAsync({
        amount: withdrawAmount,
        payoutMethod,
        accountDetails: {
          accountNumber: payoutMethod === 'bank_transfer' ? accountNumber : undefined,
          ifsc: payoutMethod === 'bank_transfer' ? ifsc : undefined,
          upiId: payoutMethod === 'upi' ? upiId : undefined,
        },
      });

      setSuccessResult({
        amount: withdrawAmount,
        payoutMethod,
        txRef: res.transaction?.reference || 'WD-DEMO-991',
      });

      toast.success(`Withdrawal of ${inr(withdrawAmount)} requested.`);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to process withdrawal.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setSuccessResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-surface border border-line shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface-alt/40">
          <div>
            <h2 className="text-base font-semibold text-ink">Withdraw Lister Earnings</h2>
            <p className="text-xs text-ink-mute">Transfer eligible earnings to business account</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-ink-mute hover:text-ink hover:bg-surface-sunk transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {successResult ? (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">Demo Payout Processed</h3>
              <p className="text-sm text-ink-soft mt-1">
                <span className="font-semibold text-ink">{inr(successResult.amount)}</span> has been transferred via{' '}
                {successResult.payoutMethod === 'bank_transfer' ? 'Bank Transfer' : 'UPI'}.
              </p>
              <div className="mt-3 p-3 rounded-xl bg-surface-sunk border border-line text-xs space-y-1">
                <div className="flex justify-between text-ink-mute">
                  <span>Settlement Status:</span>
                  <span className="font-bold text-emerald-600">SETTLED</span>
                </div>
                <div className="flex justify-between text-ink-mute">
                  <span>Reference:</span>
                  <span className="font-mono text-ink">{successResult.txRef}</span>
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="btn-primary w-full justify-center">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Balance info */}
            <div className="p-3.5 rounded-xl bg-surface-sunk border border-line flex items-center justify-between">
              <div>
                <span className="text-xs text-ink-mute block">Available to Withdraw</span>
                <span className="text-lg font-bold text-ink">{inr(maxAvailable)}</span>
              </div>
              <button
                type="button"
                onClick={() => setAmount(String(maxAvailable))}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Withdraw Max
              </button>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-xs font-semibold text-ink-mute mb-1.5 uppercase tracking-wider">
                Withdrawal Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute font-medium text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  max={maxAvailable}
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field pl-8 text-sm font-semibold"
                  id="withdraw-amount-input"
                  required
                />
              </div>
            </div>

            {/* Payout Destination */}
            <div>
              <label className="block text-xs font-semibold text-ink-mute mb-2 uppercase tracking-wider">
                Payout Destination
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setPayoutMethod('bank_transfer')}
                  className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all ${
                    payoutMethod === 'bank_transfer'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-line text-ink hover:bg-surface-sunk'
                  }`}
                >
                  <Building size={16} />
                  <span>Bank Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod('upi')}
                  className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all ${
                    payoutMethod === 'upi'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-line text-ink hover:bg-surface-sunk'
                  }`}
                >
                  <Smartphone size={16} />
                  <span>UPI ID</span>
                </button>
              </div>

              {payoutMethod === 'bank_transfer' ? (
                <div className="space-y-2 p-3 rounded-xl bg-surface-sunk border border-line text-xs">
                  <div>
                    <span className="text-ink-mute block text-[10px] uppercase">Account (Masked)</span>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="field text-xs mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-ink-mute block text-[10px] uppercase">IFSC Code</span>
                    <input
                      type="text"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value)}
                      className="field text-xs mt-1 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-surface-sunk border border-line text-xs">
                  <span className="text-ink-mute block text-[10px] uppercase">UPI Virtual ID</span>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="field text-xs mt-1 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Sandbox Notice */}
            <div className="flex items-start gap-2 text-[11px] text-ink-mute bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/20">
              <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                Demo Settlement Payout: This is an internal ledger demonstration. No real bank clearing house transfer occurs.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={handleClose} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                type="submit"
                disabled={processing || !withdrawAmount || withdrawAmount > maxAvailable}
                className="btn-primary flex-1 justify-center"
                id="confirm-withdraw-btn"
              >
                {processing ? 'Processing...' : `Withdraw ${inr(withdrawAmount || 0)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
