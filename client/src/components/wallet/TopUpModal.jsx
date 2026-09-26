import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, CheckCircle, ShieldCheck, CreditCard, Smartphone, Building2 } from 'lucide-react';
import { useWalletActions } from '../../hooks/queries';
import { inr } from '../../lib/format';
import { errorMessage } from '../../api/client';

const SUGGESTED_AMOUNTS = [5000, 10000, 25000, 50000];

export default function TopUpModal({ isOpen, onClose, initialAmount = null, onSuccess }) {
  const { topUp } = useWalletActions();
  const [selectedAmount, setSelectedAmount] = useState(initialAmount ? Number(initialAmount) : 10000);
  const [customAmount, setCustomAmount] = useState(
    initialAmount && !SUGGESTED_AMOUNTS.includes(Number(initialAmount)) ? String(initialAmount) : ''
  );
  const [method, setMethod] = useState('upi');
  const [processing, setProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  if (!isOpen) return null;

  const currentAmount = customAmount ? Number(customAmount) : selectedAmount;

  const handleSelectSuggested = (val) => {
    setSelectedAmount(val);
    setCustomAmount('');
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    setCustomAmount(val);
    if (val) setSelectedAmount(Number(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentAmount || currentAmount < 1) {
      toast.error('Please enter a valid top-up amount.');
      return;
    }

    setProcessing(true);
    try {
      // Simulate realistic gateway authentication delay
      await new Promise((r) => setTimeout(r, 900));

      const res = await topUp.mutateAsync({
        amount: currentAmount,
        paymentMethod: method,
      });

      setSuccessResult({
        amount: currentAmount,
        wallet: res.wallet,
        transaction: res.transaction,
      });

      toast.success(`₹${currentAmount.toLocaleString('en-IN')} added to your wallet`);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add money. Please try again.'));
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
            <h2 className="text-base font-semibold text-ink">Add Money to Your Wallet</h2>
            <p className="text-xs text-ink-mute">Demo Wallet • Sandbox Environment</p>
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
              <h3 className="text-lg font-bold text-ink">Money Added Successfully</h3>
              <p className="text-sm text-ink-soft mt-1">
                <span className="font-semibold text-ink">{inr(successResult.amount)}</span> added to your wallet balance
              </p>
              <div className="mt-3 p-3 rounded-xl bg-surface-sunk border border-line text-xs space-y-1">
                <div className="flex justify-between text-ink-mute">
                  <span>Available Balance:</span>
                  <span className="font-bold text-ink">
                    {inr(
                      successResult.wallet?.availableBalanceRupees ??
                      successResult.wallet?.availableBalance ??
                      successResult.wallet?.availableRupees ??
                      0
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-ink-mute">
                  <span>Ledger Reference:</span>
                  <span className="font-mono text-ink">{successResult.transaction?.reference || 'TOPUP-SIM'}</span>
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="btn-primary w-full justify-center">
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {initialAmount && (
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300">
                <span className="font-semibold">Booking Shortfall:</span> We pre-filled the exact shortfall needed for your reservation.
              </div>
            )}

            {/* Suggested Amounts */}
            <div>
              <label className="block text-xs font-semibold text-ink-mute mb-2 uppercase tracking-wider">
                Select Amount
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {SUGGESTED_AMOUNTS.map((amt) => {
                  const active = !customAmount && selectedAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSelectSuggested(amt)}
                      className={`py-2 px-1 text-xs font-semibold rounded-lg border transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'border-line hover:border-ink/30 text-ink'
                      }`}
                    >
                      {inr(amt)}
                    </button>
                  );
                })}
              </div>

              {/* Custom Input */}
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute font-medium text-sm">
                  ₹
                </span>
                <input
                  type="text"
                  placeholder="Or enter custom amount..."
                  value={customAmount}
                  onChange={handleCustomChange}
                  className="field pl-8 text-sm font-semibold"
                  id="topup-custom-amount"
                />
              </div>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="block text-xs font-semibold text-ink-mute mb-2 uppercase tracking-wider">
                Select Demo Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('upi')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                    method === 'upi'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-line text-ink hover:bg-surface-sunk'
                  }`}
                >
                  <Smartphone size={18} />
                  <span>UPI</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                    method === 'card'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-line text-ink hover:bg-surface-sunk'
                  }`}
                >
                  <CreditCard size={18} />
                  <span>Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('netbanking')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                    method === 'netbanking'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'border-line text-ink hover:bg-surface-sunk'
                  }`}
                >
                  <Building2 size={18} />
                  <span>Net Banking</span>
                </button>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="flex items-center gap-2 text-[11px] text-ink-mute bg-surface-sunk p-2.5 rounded-lg border border-line">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>Simulated demo top-up • No real credit card or bank debit will occur.</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={handleClose} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                type="submit"
                disabled={processing || !currentAmount || currentAmount < 1}
                className="btn-primary flex-1 justify-center"
                id="confirm-topup-btn"
              >
                {processing ? 'Processing...' : `Add ${inr(currentAmount || 0)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
