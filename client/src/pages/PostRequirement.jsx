import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSearch, useRequirementActions } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import ResourceCard from '../components/ResourceCard';
import { Alert, Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { toLocalInput, defaultWindow } from '../lib/format';

/**
 * Dual-Mode Post Requirement:
 * 1. Broadcast open RFQ to suppliers nearby (creates Requirement in MongoDB and alerts providers).
 * 2. Or preview instant catalog matches from current active listings.
 */
export default function PostRequirement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { create } = useRequirementActions();
  const initial = useMemo(() => defaultWindow(10, 9, 12), []);

  const [form, setForm] = useState({
    title: '',
    category: 'banquet_space',
    description: '',
    quantity: 1,
    unit: 'unit',
    minCapacity: '',
    maxPrice: '',
    radiusKm: 25,
    urgency: 'medium',
    start: toLocalInput(initial.start),
    end: toLocalInput(initial.end),
  });

  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [showInstantMatches, setShowInstantMatches] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Query for instant matches preview
  const searchQuery = useMemo(
    () => ({
      category: form.category,
      quantity: form.quantity,
      minCapacity: form.minCapacity || undefined,
      maxPrice: form.maxPrice || undefined,
      radiusKm: form.radiusKm,
      urgency: form.urgency,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      limit: 10,
    }),
    [form]
  );

  const { data: searchData, isLoading: searchLoading } = useSearch(searchQuery, showInstantMatches);
  const instantResults = searchData?.results || [];

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to broadcast requirements.');
      navigate('/login', { state: { from: '/requirements/new' } });
      return;
    }

    const titleToUse = form.title.trim() || `Need ${form.quantity} × ${form.category.replace('_', ' ')}`;

    setBroadcastBusy(true);
    try {
      await create.mutateAsync({
        title: titleToUse,
        category: form.category,
        description: form.description,
        requiredQuantity: Number(form.quantity) || 1,
        unit: form.unit,
        minCapacity: form.minCapacity ? Number(form.minCapacity) : undefined,
        maxBudget: form.maxPrice ? Number(form.maxPrice) : undefined,
        startDateTime: new Date(form.start).toISOString(),
        endDateTime: new Date(form.end).toISOString(),
        radiusKm: Number(form.radiusKm) || 25,
        urgency: form.urgency,
      });

      toast.success('Requirement broadcasted to suppliers nearby!');
      navigate('/requirements/mine');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to post requirement.'));
    } finally {
      setBroadcastBusy(false);
    }
  };

  return (
    <div className="page-shell py-4 max-w-[1100px]">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h1 className="text-page font-normal">Post a Requirement (RFQ)</h1>
        <Link to="/requirements/mine" className="a-link text-base">
          View My Posted RFQs →
        </Link>
      </div>

      <p className="text-base text-ink-soft mb-4">
        Broadcast your need to hospitality suppliers nearby. Providers receive your RFQ in real time and submit competitive proposals.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
        {/* RFQ Form */}
        <div className="bg-white p-5 rounded border border-bd h-fit shadow-sm">
          <form onSubmit={handleBroadcast} className="space-y-4">
            <div>
              <label className="a-label">Requirement Title</label>
              <input
                type="text"
                placeholder="e.g. 200 pax Banquet Space for Dealer Awards"
                value={form.title}
                onChange={set('title')}
                className="a-input"
                required
              />
            </div>

            <div>
              <label className="a-label">Resource Category</label>
              <select value={form.category} onChange={set('category')} className="a-select w-full">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="a-label">Quantity Needed</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={set('quantity')}
                  className="a-input"
                  required
                />
              </div>
              <div>
                <label className="a-label">Min. Capacity</label>
                <input
                  type="number"
                  min="0"
                  value={form.minCapacity}
                  onChange={set('minCapacity')}
                  placeholder="e.g. 200 guests"
                  className="a-input"
                />
              </div>
            </div>

            <div>
              <label className="a-label">From</label>
              <input
                type="datetime-local"
                value={form.start}
                onChange={set('start')}
                className="a-input"
                required
              />
            </div>

            <div>
              <label className="a-label">To</label>
              <input
                type="datetime-local"
                value={form.end}
                onChange={set('end')}
                className="a-input"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="a-label">Budget Cap (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={form.maxPrice}
                  onChange={set('maxPrice')}
                  placeholder="e.g. 75000"
                  className="a-input"
                />
              </div>
              <div>
                <label className="a-label">Within (km)</label>
                <input
                  type="number"
                  min="1"
                  value={form.radiusKm}
                  onChange={set('radiusKm')}
                  className="a-input"
                  required
                />
              </div>
            </div>

            <div>
              <label className="a-label">Urgency Level</label>
              <select value={form.urgency} onChange={set('urgency')} className="a-select w-full">
                <option value="low">Planning ahead</option>
                <option value="medium">Normal urgency</option>
                <option value="high">Urgent — within 24-48 hours</option>
              </select>
            </div>

            <div>
              <label className="a-label">Special Notes / Specifications</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={set('description')}
                placeholder="Mention stage, valet, AC, catering license, or delivery details…"
                className="a-textarea"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-bd">
              <button
                type="submit"
                disabled={broadcastBusy}
                className="btn-yellow btn-pill w-full font-bold py-2 shadow-sm"
              >
                {broadcastBusy ? 'Broadcasting…' : '🚀 Broadcast RFQ to Suppliers'}
              </button>

              <button
                type="button"
                onClick={() => setShowInstantMatches(true)}
                className="btn-secondary btn-pill w-full text-base py-1.5"
              >
                🔍 Preview Catalog Matches Below
              </button>
            </div>
          </form>
        </div>

        {/* Right side explanation or preview */}
        <div>
          {!showInstantMatches ? (
            <div className="bg-white p-8 rounded border border-bd">
              <h2 className="text-section font-bold mb-2">How the Reverse Marketplace Works</h2>
              <p className="text-base text-ink-soft mb-4">
                Instead of making dozens of phone calls or checking listings one by one, Indulge lets you broadcast your specific event requirements to qualified suppliers nearby.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  ['1. Post Your Need', 'Define your exact dates, quantities, capacity, and budget cap.'],
                  ['2. Instant Notification', 'Suppliers with idle capacity in your category receive real-time alerts.'],
                  ['3. Competitive Quotations', 'Suppliers propose their best rates and reserve available stock.'],
                  ['4. 1-Click Confirmation', 'Compare quotes side-by-side and accept the best offer to create an immediate confirmed booking.'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-3">
                    <span className="text-success font-bold shrink-0">✓</span>
                    <div>
                      <p className="font-bold text-ink text-base">{title}</p>
                      <p className="text-mini text-ink-soft">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-[#FEF8E7] border border-[#E7C65C] rounded text-base">
                💡 <strong>Pro Tip:</strong> Click <em>"Preview Catalog Matches Below"</em> if you want to inspect existing listings before broadcasting an open request.
              </div>
            </div>
          ) : searchLoading ? (
            <div className="bg-white p-8 rounded border border-bd">
              <Spinner label="Searching available catalog listings" />
            </div>
          ) : instantResults.length === 0 ? (
            <div className="bg-white p-8 rounded border border-bd">
              <Alert tone="warn">
                No off-the-shelf listings match those exact dates and constraints. Click <strong>"Broadcast RFQ to Suppliers"</strong> so local businesses can review and make you a custom offer!
              </Alert>
            </div>
          ) : (
            <div className="bg-white rounded border border-bd overflow-hidden">
              <div className="px-4 py-2.5 border-b border-bd bg-[#F7F8F8] flex justify-between items-center">
                <p className="text-body font-bold">
                  {instantResults.length} catalog options matching your dates
                </p>
                <button onClick={() => setShowInstantMatches(false)} className="a-link text-mini">
                  Hide preview
                </button>
              </div>
              <div className="divide-y divide-bd">
                {instantResults.map((r) => (
                  <ResourceCard key={r._id} resource={r} criteria={searchData?.criteria} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
