/**
 * AIRequirementParser.jsx
 *
 * Natural-language requirement creation with AI extraction.
 *
 * Flow:
 * 1. User types a natural-language description
 * 2. AI extracts structured fields (server-side Gemini)
 * 3. User REVIEWS and edits the extracted fields
 * 4. User clicks "Create Requirement" → existing /api/requirements endpoint handles validation + save
 *
 * Gemini only SUGGESTS. The user confirms. The backend validates.
 */

import { useState, useCallback } from 'react';
import api from '../../api/client';
import { CATEGORIES, CATEGORY_LABELS } from '../../lib/constants';

const EXAMPLE_PROMPTS = [
  'Need 500 banquet chairs in Thane tomorrow from 5 PM to 11 PM, budget around ₹30,000',
  'Looking for a banquet hall for 200 guests in Andheri next Saturday morning',
  '2 delivery vans needed in Pune on 15th October for full day, urgent',
  'Kitchen capacity for 1000 pax event in Bandra this weekend, budget ₹50,000',
];

function ConfidenceBadge({ confidence }) {
  const config = {
    high: { label: 'High confidence', className: 'ai-confidence--high' },
    medium: { label: 'Medium confidence', className: 'ai-confidence--medium' },
    low: { label: 'Low confidence — please review', className: 'ai-confidence--low' },
  };
  const { label, className } = config[confidence] || config.low;
  return <span className={`ai-confidence ${className}`}>{label}</span>;
}

function FieldGroup({ label, children, required }) {
  return (
    <div className="ai-field-group">
      <label className="ai-field-label">
        {label}
        {required && <span className="ai-field-required"> *</span>}
      </label>
      {children}
    </div>
  );
}

export default function AIRequirementParser({ onRequirementCreated }) {
  const [step, setStep] = useState('input'); // 'input' | 'review' | 'submitting' | 'done'
  const [nlText, setNlText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  // Extracted fields for review
  const [fields, setFields] = useState(null);
  const [clarifications, setClarifications] = useState([]);

  const handleParse = useCallback(async () => {
    if (!nlText.trim()) return;
    setParsing(true);
    setParseError(null);

    try {
      const { data } = await api.post('/ai/parse-requirement', { text: nlText });
      setFields(data.extracted);
      setClarifications(data.extracted.clarificationsNeeded || []);
      setStep('review');
    } catch (err) {
      setParseError(err?.response?.data?.error || 'AI parsing failed. Please try again.');
    } finally {
      setParsing(false);
    }
  }, [nlText]);

  const handleFieldChange = useCallback((key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!fields) return;
    setStep('submitting');
    setSubmitError(null);

    try {
      // Validate required fields before hitting the API
      if (!fields.category) throw new Error('Category is required.');
      if (!fields.requiredQuantity || fields.requiredQuantity < 1)
        throw new Error('Quantity must be at least 1.');
      if (!fields.startDateTime) throw new Error('Start date/time is required.');
      if (!fields.endDateTime) throw new Error('End date/time is required.');

      // Submit to EXISTING requirement endpoint — AI cannot bypass validation
      const payload = {
        title: fields.title || `${CATEGORY_LABELS[fields.category]} Requirement`,
        category: fields.category,
        requiredQuantity: fields.requiredQuantity,
        unit: fields.unit || 'unit',
        startDateTime: fields.startDateTime,
        endDateTime: fields.endDateTime,
        maxBudget: fields.maxBudget || undefined,
        urgency: fields.urgency || 'medium',
        description: fields.description || undefined,
        // Location coordinates will be filled by the user's profile in the backend
        // or must come from the actual PostRequirement form for geo-awareness
        location: {
          city: fields.location?.city || undefined,
          address: fields.location?.address || undefined,
          coordinates: [0, 0], // Placeholder — real coordinates require geo lookup
        },
      };

      const { data } = await api.post('/requirements', payload);
      setStep('done');
      onRequirementCreated?.(data.requirement);
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err.message || 'Failed to create requirement.');
      setStep('review');
    }
  }, [fields, onRequirementCreated]);

  if (step === 'done') {
    return (
      <div className="ai-req-success">
        <div className="ai-req-success-icon">✓</div>
        <h3>Requirement Created!</h3>
        <p>Your requirement has been posted to the marketplace. Providers will start submitting proposals soon.</p>
        <button
          id="ai-req-create-another"
          className="ai-btn ai-btn--primary"
          onClick={() => { setStep('input'); setNlText(''); setFields(null); }}
          type="button"
        >
          Create Another
        </button>
      </div>
    );
  }

  return (
    <div className="ai-req-parser">
      {/* Step 1: Natural language input */}
      {step === 'input' && (
        <div className="ai-req-input-step">
          <div className="ai-req-header">
            <div className="ai-req-header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <div>
              <h3 className="ai-req-title">Create Requirement with AI</h3>
              <p className="ai-req-subtitle">Describe what you need in plain language</p>
            </div>
          </div>

          <textarea
            id="ai-req-nl-input"
            className="ai-req-textarea"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder="e.g. Need 500 banquet chairs in Thane tomorrow from 5 PM to 11 PM, budget around ₹30,000"
            rows={4}
            maxLength={1000}
          />

          {parseError && <p className="ai-req-error">{parseError}</p>}

          <div className="ai-req-examples">
            <p className="ai-req-examples-label">Try an example:</p>
            <div className="ai-req-examples-list">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button
                  key={i}
                  id={`ai-req-example-${i}`}
                  className="ai-req-example-btn"
                  onClick={() => setNlText(ex)}
                  type="button"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <button
            id="ai-req-parse-btn"
            className={`ai-btn ai-btn--primary ai-btn--full ${parsing ? 'ai-btn--loading' : ''}`}
            onClick={handleParse}
            disabled={!nlText.trim() || parsing}
            type="button"
          >
            {parsing ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ai-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Analysing with AI...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                </svg>
                Extract with AI
              </>
            )}
          </button>

          <p className="ai-req-notice">
            AI extracts structured fields for your review. You confirm before anything is saved.
          </p>
        </div>
      )}

      {/* Step 2: Review extracted fields */}
      {(step === 'review' || step === 'submitting') && fields && (
        <div className="ai-req-review-step">
          <div className="ai-req-review-header">
            <button
              id="ai-req-back-btn"
              className="ai-back-btn"
              onClick={() => setStep('input')}
              type="button"
            >
              ← Back
            </button>
            <div>
              <h3 className="ai-req-title">Review Extracted Fields</h3>
              <ConfidenceBadge confidence={fields.confidence} />
            </div>
          </div>

          {clarifications.length > 0 && (
            <div className="ai-req-clarifications">
              <p className="ai-req-clarifications-title">⚠️ Please clarify:</p>
              <ul>
                {clarifications.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          <div className="ai-req-fields">
            <FieldGroup label="Title" required>
              <input
                id="ai-req-field-title"
                type="text"
                className="ai-field-input"
                value={fields.title || ''}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                maxLength={140}
              />
            </FieldGroup>

            <div className="ai-req-fields-row">
              <FieldGroup label="Category" required>
                <select
                  id="ai-req-field-category"
                  className="ai-field-select"
                  value={fields.category || ''}
                  onChange={(e) => handleFieldChange('category', e.target.value)}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup label="Quantity" required>
                <input
                  id="ai-req-field-qty"
                  type="number"
                  className="ai-field-input"
                  value={fields.requiredQuantity || ''}
                  onChange={(e) => handleFieldChange('requiredQuantity', parseInt(e.target.value, 10))}
                  min={1}
                />
              </FieldGroup>
            </div>

            <div className="ai-req-fields-row">
              <FieldGroup label="Start Date & Time" required>
                <input
                  id="ai-req-field-start"
                  type="datetime-local"
                  className="ai-field-input"
                  value={fields.startDateTime ? fields.startDateTime.slice(0, 16) : ''}
                  onChange={(e) => handleFieldChange('startDateTime', new Date(e.target.value).toISOString())}
                />
              </FieldGroup>

              <FieldGroup label="End Date & Time" required>
                <input
                  id="ai-req-field-end"
                  type="datetime-local"
                  className="ai-field-input"
                  value={fields.endDateTime ? fields.endDateTime.slice(0, 16) : ''}
                  onChange={(e) => handleFieldChange('endDateTime', new Date(e.target.value).toISOString())}
                />
              </FieldGroup>
            </div>

            <div className="ai-req-fields-row">
              <FieldGroup label="Max Budget (₹)">
                <input
                  id="ai-req-field-budget"
                  type="number"
                  className="ai-field-input"
                  value={fields.maxBudget || ''}
                  onChange={(e) => handleFieldChange('maxBudget', parseInt(e.target.value, 10))}
                  min={0}
                  placeholder="Optional"
                />
              </FieldGroup>

              <FieldGroup label="Urgency">
                <select
                  id="ai-req-field-urgency"
                  className="ai-field-select"
                  value={fields.urgency || 'medium'}
                  onChange={(e) => handleFieldChange('urgency', e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </FieldGroup>
            </div>

            <FieldGroup label="City">
              <input
                id="ai-req-field-city"
                type="text"
                className="ai-field-input"
                value={fields.location?.city || ''}
                onChange={(e) => handleFieldChange('location', { ...fields.location, city: e.target.value })}
                placeholder="e.g. Mumbai"
              />
            </FieldGroup>

            <FieldGroup label="Additional Notes">
              <textarea
                id="ai-req-field-desc"
                className="ai-field-input"
                value={fields.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                rows={2}
                placeholder="Any special requirements or constraints"
              />
            </FieldGroup>
          </div>

          {submitError && <p className="ai-req-error">{submitError}</p>}

          <div className="ai-req-actions">
            <button
              id="ai-req-submit-btn"
              className={`ai-btn ai-btn--primary ${step === 'submitting' ? 'ai-btn--loading' : ''}`}
              onClick={handleSubmit}
              disabled={step === 'submitting'}
              type="button"
            >
              {step === 'submitting' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ai-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Creating...
                </>
              ) : (
                'Post Requirement'
              )}
            </button>
            <button
              id="ai-req-edit-btn"
              className="ai-btn ai-btn--secondary"
              onClick={() => setStep('input')}
              disabled={step === 'submitting'}
              type="button"
            >
              Edit Input
            </button>
          </div>

          <p className="ai-req-notice">
            ✓ These fields were extracted by AI and reviewed by you.<br />
            The platform will validate the final submission.
          </p>
        </div>
      )}
    </div>
  );
}
