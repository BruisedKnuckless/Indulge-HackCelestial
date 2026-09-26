import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MapPin,
  Trash2,
  Check,
  Plus,
  MessageSquare,
  Upload,
  Info,
} from 'lucide-react';
import api, { errorMessage } from '../api/client';
import InspectorHeader from '../components/inspector/InspectorHeader';
import CameraCaptureModal from '../components/inspector/CameraCaptureModal';
import { Spinner } from '../components/ui';

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['verification-detail', id],
    queryFn: async () => (await api.get(`/verifications/${id}`)).data,
  });

  const verification = data?.verification;

  // Active step: index of current parameter (0 to N-1), or 'review' for final screen
  const [currentStep, setCurrentStep] = useState(0);
  const [paramsState, setParamsState] = useState([]);
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Sync server parameters into local state
  useEffect(() => {
    if (verification?.parameters) {
      setParamsState(
        verification.parameters.map((p) => ({
          ...p,
          rating: p.rating || null,
          notes: p.notes || '',
          photos: p.photos || [],
          issueFlag: p.issueFlag || 'none',
          issueDescription: p.issueDescription || '',
        }))
      );
      setInspectorNotes(verification.inspectorNotes || '');
    }
  }, [verification]);

  const totalChecks = paramsState.length;
  const currentParam = paramsState[currentStep] || null;
  const completedChecks = paramsState.filter((p) => p.rating != null).length;
  const progressPct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;
  const isCompleted = ['verified', 'conditionally_verified', 'rejected', 'submitted'].includes(
    verification?.status
  );

  // Update current parameter
  const handleCurrentParamUpdate = (updates) => {
    if (!currentParam) return;
    setParamsState((prev) =>
      prev.map((p, idx) => (idx === currentStep ? { ...p, ...updates } : p))
    );
  };

  // Upload photo file for current parameter (from live camera or file input)
  const uploadPhotoFile = async (file) => {
    if (!file || !currentParam) return;

    const formData = new FormData();
    formData.append('image', file);
    formData.append('parameterId', currentParam.id);

    setUploading(true);
    try {
      const res = await api.post(`/verifications/${id}/evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = res.data.evidence.url;
      toast.success('Photo added');

      handleCurrentParamUpdate({
        photos: [...(currentParam.photos || []), uploadedUrl],
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload photo.'));
    } finally {
      setUploading(false);
    }
  };

  // Remove photo
  const handleRemovePhoto = (photoUrl) => {
    if (!currentParam) return;
    handleCurrentParamUpdate({
      photos: (currentParam.photos || []).filter((u) => u !== photoUrl),
    });
  };

  // Gallery file picker change
  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPhotoFile(file);
      e.target.value = '';
    }
  };

  // Real-time condition score calculation
  const liveScore = useMemo(() => {
    if (!paramsState || paramsState.length === 0) return { score: 0, status: 'Poor', minorCount: 0, majorCount: 0 };

    let totalWeight = 0;
    let weightedSum = 0;
    let majorCount = 0;
    let minorCount = 0;

    for (const p of paramsState) {
      const w = Number(p.weight) || 0.1;
      totalWeight += w;
      if (p.rating != null) {
        weightedSum += (p.rating / (p.ratingScale || 5)) * w;
      }
      if (p.issueFlag === 'major') majorCount++;
      if (p.issueFlag === 'minor') minorCount++;
    }

    const raw = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    let status = 'Poor';
    if (score >= 90) status = 'Excellent';
    else if (score >= 75) status = 'Good';
    else if (score >= 60) status = 'Fair';
    else if (score >= 40) status = 'Needs Attention';

    return { score, status, majorCount, minorCount };
  }, [paramsState]);

  // Save & Next Step
  const handleSaveAndNext = async () => {
    if (!currentParam) return;

    if (currentParam.rating == null) {
      toast.error('Please select a condition rating (1–5) before proceeding.');
      return;
    }

    if (currentParam.issueFlag !== 'none' && !currentParam.issueDescription?.trim()) {
      toast.error('Please write a brief description of the issue.');
      return;
    }

    // Persist parameter to backend
    try {
      await api.patch(`/verifications/${id}/parameters/${currentParam.id}`, {
        rating: currentParam.rating,
        notes: currentParam.notes,
        photos: currentParam.photos,
        issueFlag: currentParam.issueFlag,
        issueDescription: currentParam.issueDescription,
      });
    } catch (err) {
      // Non-blocking save failure
      console.warn('Background parameter sync warning:', err);
    }

    // Advance to next step or review
    setShowNoteInput(false);
    if (currentStep < totalChecks - 1) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setCurrentStep('review');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Submit Final Verification
  const handleSubmitVerification = async () => {
    setSubmitting(true);
    try {
      await api.post(`/verifications/${id}/submit`, {
        parameters: paramsState,
        inspectorNotes,
      });
      toast.success('Verification submitted successfully!');
      qc.invalidateQueries({ queryKey: ['inspector-tasks'] });
      qc.invalidateQueries({ queryKey: ['verification-detail', id] });
      qc.invalidateQueries({ queryKey: ['listings'] });
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit verification.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface">
        <InspectorHeader />
        <div className="py-24 flex justify-center">
          <Spinner label="Loading inspection task..." />
        </div>
      </div>
    );
  }

  if (!verification) {
    return (
      <div className="min-h-screen bg-surface">
        <InspectorHeader />
        <div className="max-w-md mx-auto py-16 text-center px-4">
          <h2 className="text-lg font-bold">Inspection Task Not Found</h2>
          <Link to="/inspector" className="btn-primary mt-4 inline-flex">
            Back to Tasks
          </Link>
        </div>
      </div>
    );
  }

  const provider = verification.provider || {};

  // ── 1. POST-SUBMISSION FINAL STATE ──────────────────────────────────────────
  if (isCompleted) {
    return (
      <div className="min-h-screen flex flex-col bg-surface">
        <InspectorHeader />

        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
          <div className="bg-surface-alt border border-line rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 size={36} strokeWidth={2.4} />
            </div>

            <div>
              <span className="font-mono text-xs font-bold text-ink-mute uppercase tracking-widest block">
                {verification.inspectionId}
              </span>
              <h1 className="text-2xl font-black text-ink tracking-tight mt-1">
                Verification Submitted
              </h1>
              <p className="text-xs text-ink-soft mt-1">
                {verification.resourceName} · {provider.businessName}
              </p>
            </div>

            <div className="bg-surface-sunk/60 rounded-2xl p-4 border border-line/60 space-y-3 text-left">
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-mute font-medium">Status</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  {verification.verificationLevel || 'Indulge Verified'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-mute font-medium">Condition</span>
                <span className="font-extrabold text-ink">
                  {verification.conditionStatus || 'Good'} — {verification.finalScore || liveScore.score}/100
                </span>
              </div>
            </div>

            <Link
              to="/inspector"
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-xs bg-ink text-surface hover:opacity-90 transition-all block shadow-xs"
            >
              Back to Today's Tasks
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── 2. FINAL REVIEW SCREEN (Before Submission) ──────────────────────────────
  if (currentStep === 'review') {
    const totalPhotos = paramsState.reduce((sum, p) => sum + (p.photos?.length || 0), 0);

    return (
      <div className="min-h-screen flex flex-col bg-surface pb-12">
        <InspectorHeader />

        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(totalChecks - 1)}
              className="inline-flex items-center gap-1 text-xs font-bold text-ink-soft hover:text-ink transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back to Checks</span>
            </button>
            <span className="font-mono text-xs font-bold text-ink-mute bg-surface-sunk px-2 py-0.5 rounded border border-line">
              {verification.inspectionId}
            </span>
          </div>

          {/* Inspection Complete Review Card */}
          <div className="bg-surface-alt border border-line rounded-3xl p-6 shadow-xs space-y-5">
            <div className="border-b border-line pb-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                All Checks Completed
              </span>
              <h1 className="text-2xl font-black text-ink tracking-tight mt-0.5">
                Inspection Summary
              </h1>
              <p className="text-xs text-ink-soft mt-1">
                {verification.resourceName} · {provider.businessName}
              </p>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-surface-sunk/60 rounded-2xl p-3 border border-line/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-mute block">Checks</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {completedChecks} / {totalChecks} ✓
                </span>
              </div>

              <div className="bg-surface-sunk/60 rounded-2xl p-3 border border-line/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-mute block">Photos Attached</span>
                <span className="text-lg font-black text-ink mt-0.5 block">
                  {totalPhotos} ✓
                </span>
              </div>

              <div className="bg-surface-sunk/60 rounded-2xl p-3 border border-line/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-mute block">Issues Flagged</span>
                <span className={`text-lg font-black mt-0.5 block ${liveScore.minorCount + liveScore.majorCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {liveScore.minorCount + liveScore.majorCount === 0 ? 'None ✓' : `${liveScore.majorCount} Major · ${liveScore.minorCount} Minor`}
                </span>
              </div>

              <div className="bg-surface-sunk/60 rounded-2xl p-3 border border-line/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-mute block">Condition Score</span>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                  {liveScore.score} / 100
                </span>
                <span className="text-[10px] text-ink-soft font-semibold">{liveScore.status}</span>
              </div>
            </div>

            {/* Optional Inspector Notes */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Inspector Note (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Write any overall notes for this inspection..."
                value={inspectorNotes}
                onChange={(e) => setInspectorNotes(e.target.value)}
                className="w-full text-xs p-3 bg-surface-sunk/60 border border-line rounded-xl text-ink focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Primary Submit Button */}
            <button
              onClick={handleSubmitVerification}
              disabled={submitting}
              className="w-full py-4 px-6 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Spinner size="xs" />
                  <span>Submitting Verification...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Submit Verification</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── 3. ONE-CHECK-AT-A-TIME STEPPER (Mobile-First Operational Mode) ───────────
  const ratingColors = {
    1: 'bg-rose-500 text-white border-rose-600 shadow-sm ring-2 ring-rose-500/30',
    2: 'bg-orange-500 text-white border-orange-600 shadow-sm ring-2 ring-orange-500/30',
    3: 'bg-amber-500 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/30',
    4: 'bg-teal-500 text-white border-teal-600 shadow-sm ring-2 ring-teal-500/30',
    5: 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-500/30',
  };

  const ratingLabels = {
    1: 'Poor',
    2: 'Needs Attn',
    3: 'Fair',
    4: 'Good',
    5: 'Excellent',
  };

  const hasIssue = currentParam?.issueFlag && currentParam.issueFlag !== 'none';

  return (
    <div className="min-h-screen flex flex-col bg-surface pb-28">
      <InspectorHeader />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-4 space-y-4">
        {/* Sticky Task Header */}
        <section className="bg-surface-alt border border-line rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <Link
              to="/inspector"
              className="inline-flex items-center gap-1 text-xs font-bold text-ink-soft hover:text-ink transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </Link>
            <span className="font-mono text-xs font-bold text-ink-mute bg-surface-sunk px-2 py-0.5 rounded border border-line">
              {verification.inspectionId}
            </span>
          </div>

          <div>
            <h1 className="text-lg font-black text-ink leading-tight">
              {verification.resourceName}
            </h1>
            <p className="text-xs text-ink-soft mt-0.5">
              {provider.businessName} · {verification.location?.city || 'Mumbai'}
            </p>
          </div>

          {/* Clean Stepper Progress */}
          <div className="space-y-1.5 pt-1 border-t border-line/60">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-ink">
                Check {currentStep + 1} of {totalChecks}
              </span>
              <span className="text-ink-soft font-semibold text-[11px]">
                {completedChecks} / {totalChecks} completed ({progressPct}%)
              </span>
            </div>

            <div className="w-full h-1.5 bg-surface-sunk rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Quick check step pills (1 ✓, 2 ✓, 3 ●, 4, 5...) */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none">
              {paramsState.map((p, idx) => {
                const isActive = idx === currentStep;
                const isRated = p.rating != null;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setCurrentStep(idx);
                      setShowNoteInput(false);
                    }}
                    className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs scale-105'
                        : isRated
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-surface-sunk text-ink-soft hover:bg-surface-sunk/80 border border-line'
                    }`}
                  >
                    {isRated ? <Check size={12} strokeWidth={2.5} /> : idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Current Check Card (Only one parameter active) */}
        {currentParam && (
          <div className="bg-surface-alt border border-line rounded-3xl p-5 shadow-xs space-y-5">
            {/* Title & Guidelines */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {currentParam.category || 'Physical'}
                </span>
                {currentParam.required && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    Required
                  </span>
                )}
              </div>

              <h2 className="text-xl font-black text-ink uppercase tracking-tight">
                {currentParam.name}
              </h2>

              <div className="bg-surface-sunk/50 rounded-2xl p-3 border border-line/60">
                <p className="text-xs text-ink-soft leading-relaxed">
                  <strong className="text-ink font-semibold">Check that:</strong> {currentParam.description}
                </p>
              </div>
            </div>

            {/* Condition Rating (Large Touch-Friendly Buttons) */}
            <div className="space-y-2.5 pt-2 border-t border-line/60">
              <label className="text-xs font-black uppercase tracking-wider text-ink block">
                How is the condition?
              </label>

              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((score) => {
                  const selected = currentParam.rating === score;
                  return (
                    <button
                      key={score}
                      type="button"
                      onClick={() => handleCurrentParamUpdate({ rating: score })}
                      className={`py-3.5 rounded-2xl font-black text-base border transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
                        selected
                          ? ratingColors[score]
                          : 'bg-surface-sunk hover:bg-surface-sunk/80 text-ink border-line'
                      }`}
                    >
                      <span>{score}</span>
                      <span className="text-[9px] font-semibold opacity-90 block leading-none">
                        {ratingLabels[score]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Issue Selection */}
            <div className="space-y-2.5 pt-2 border-t border-line/60">
              <label className="text-xs font-black uppercase tracking-wider text-ink block">
                Issue found?
              </label>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'none', label: 'No Issue' },
                  { id: 'minor', label: 'Minor Issue' },
                  { id: 'major', label: 'Major Defect' },
                ].map((flag) => {
                  const selected = currentParam.issueFlag === flag.id;
                  return (
                    <button
                      key={flag.id}
                      type="button"
                      onClick={() => handleCurrentParamUpdate({ issueFlag: flag.id })}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        selected
                          ? flag.id === 'major'
                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                            : flag.id === 'minor'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-ink text-surface border-ink shadow-xs'
                          : 'bg-surface-sunk text-ink-soft hover:text-ink border-line'
                      }`}
                    >
                      {flag.label}
                    </button>
                  );
                })}
              </div>

              {/* Only show defect input when Minor or Major is selected */}
              {hasIssue && (
                <div className="mt-3 space-y-2 bg-amber-50/60 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 animate-fadeIn">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                    Describe the issue:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Broken crossbar, cracked surface, uneven foot..."
                    value={currentParam.issueDescription || ''}
                    onChange={(e) =>
                      handleCurrentParamUpdate({ issueDescription: e.target.value })
                    }
                    className="w-full text-xs p-2.5 bg-surface-alt border border-line rounded-xl text-ink focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      📸 You can attach a photo of the defect (optional).
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-900 dark:text-amber-200 underline hover:opacity-80 cursor-pointer"
                    >
                      <Camera size={12} />
                      <span>Open Camera</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Photo Capture (Touch-Friendly Direct Camera Button) */}
            <div className="space-y-2.5 pt-2 border-t border-line/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-ink block">
                  Evidence Photos ({currentParam.photos?.length || 0})
                </label>
                <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wider">
                  Optional
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Thumbnails of taken photos */}
                {(currentParam.photos || []).map((url, idx) => (
                  <div key={url + idx} className="relative group w-18 h-18 rounded-2xl overflow-hidden border border-line shadow-2xs">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(url)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
                      title="Remove photo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {/* Big Direct Camera Button */}
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  disabled={uploading}
                  className="flex-1 min-w-[150px] py-3.5 px-4 rounded-2xl border-2 border-dashed border-indigo-400/70 hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/50 transition-colors flex items-center justify-center gap-3 cursor-pointer text-ink font-bold text-xs active:scale-98"
                >
                  {uploading ? (
                    <Spinner size="xs" label="Uploading..." />
                  ) : (
                    <>
                      <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Camera size={18} />
                      </div>
                      <div className="text-left">
                        <span className="block font-black text-indigo-600 dark:text-indigo-400">Open Camera</span>
                        <span className="text-[10px] text-ink-mute font-medium">Click to take photo</span>
                      </div>
                    </>
                  )}
                </button>

                {/* Optional Gallery Fallback */}
                <label className="py-3 px-3.5 rounded-2xl border border-line hover:border-ink/30 bg-surface-sunk/50 hover:bg-surface-sunk/80 transition-colors flex flex-col items-center justify-center cursor-pointer text-ink-soft hover:text-ink text-[10px] font-bold">
                  <Upload size={16} />
                  <span className="mt-1">Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </label>
              </div>
            </div>

            {/* Optional Collapsible Note */}
            <div className="pt-2 border-t border-line/60">
              {!showNoteInput && !currentParam.notes ? (
                <button
                  type="button"
                  onClick={() => setShowNoteInput(true)}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Add Note</span>
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-ink">Observation Note</label>
                    <button
                      type="button"
                      onClick={() => {
                        handleCurrentParamUpdate({ notes: '' });
                        setShowNoteInput(false);
                      }}
                      className="text-ink-mute hover:text-ink text-[11px]"
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Write an observation..."
                    value={currentParam.notes || ''}
                    onChange={(e) => handleCurrentParamUpdate({ notes: e.target.value })}
                    className="w-full text-xs p-3 bg-surface-sunk/60 border border-line rounded-xl text-ink focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sticky Bottom Action Bar (Swiggy/Zomato style Next button) */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface-alt/95 backdrop-blur-md border-t border-line p-3 sm:p-4">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((prev) => prev - 1);
                  setShowNoteInput(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="py-3 px-4 rounded-2xl font-bold text-xs bg-surface-sunk text-ink hover:bg-surface-sunk/80 border border-line transition-all flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                <span>Prev</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveAndNext}
              className="flex-1 py-3.5 px-6 rounded-2xl font-black text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span>{currentStep === totalChecks - 1 ? 'Review Inspection' : 'Save & Next'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Full-Screen Live Camera Viewfinder Modal */}
        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={uploadPhotoFile}
          parameterName={currentParam?.name}
        />
      </main>
    </div>
  );
}
