/**
 * AIMatchExplainer.jsx
 *
 * Explains why a resource/provider ranked the way it did.
 * Uses real matchBreakdown data from the backend — Gemini translates it to
 * human language. No percentages are fabricated.
 */

import { useState, useCallback } from 'react';
import api from '../../api/client';

export default function AIMatchExplainer({ resourceId, requirementId, matchBreakdown, resourceTitle }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const explain = useCallback(async () => {
    if (!matchBreakdown || !resourceId) return;
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/ai/explain-match', {
        resourceId,
        requirementId,
        matchBreakdown,
      });
      setExplanation(data.explanation);
      setOpen(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not generate explanation.');
    } finally {
      setLoading(false);
    }
  }, [resourceId, requirementId, matchBreakdown]);

  return (
    <div className="ai-match-explainer">
      {!open ? (
        <button
          id={`ai-explain-${resourceId}`}
          className="ai-explain-trigger"
          onClick={explain}
          disabled={loading || !matchBreakdown}
          type="button"
        >
          {loading ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ai-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Explaining...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>
              Why this match?
            </>
          )}
        </button>
      ) : (
        <div className="ai-match-explanation">
          <div className="ai-match-explanation-header">
            <span className="ai-match-explanation-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              AI Match Explanation
            </span>
            <button
              className="ai-match-close"
              onClick={() => setOpen(false)}
              type="button"
              aria-label="Close explanation"
            >
              ×
            </button>
          </div>
          <p className="ai-match-text">{explanation}</p>
          <p className="ai-match-source">Based on real scoring data from the Indulge matching algorithm</p>
        </div>
      )}
      {error && <p className="ai-match-error">{error}</p>}
    </div>
  );
}
