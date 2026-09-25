/**
 * AIAssistantButton.jsx
 *
 * Floating assistant button that opens/closes the AI chat panel.
 * Appears as a premium floating action button in the bottom-right corner.
 */

import { useState, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';

const AIChatPanel = lazy(() => import('./AIChatPanel'));

export default function AIAssistantButton({
  requirementId,
  bookingId,
  resourceId,
  initialMessage,
  // If true, renders inline instead of floating
  inline = false,
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(!!inline);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Only show for authenticated business users
  if (!user || user.userType === 'logistics_partner') return null;

  if (inline) {
    return (
      <div className="ai-inline-wrapper">
        <Suspense fallback={<div className="ai-loading-placeholder">Loading assistant...</div>}>
          <AIChatPanel
            onClose={handleClose}
            requirementId={requirementId}
            bookingId={bookingId}
            resourceId={resourceId}
            initialMessage={initialMessage}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <>
      {/* Floating chat panel */}
      {open && (
        <div className="ai-panel-overlay">
          <Suspense fallback={null}>
            <AIChatPanel
              onClose={handleClose}
              requirementId={requirementId}
              bookingId={bookingId}
              resourceId={resourceId}
              initialMessage={initialMessage}
            />
          </Suspense>
        </div>
      )}

      {/* Floating button — hidden when panel is open */}
      {!open && (
        <button
          id="ai-assistant-fab"
          className="ai-fab"
          onClick={handleOpen}
          aria-label="Open Indulge AI Assistant"
          title="Ask Indulge AI"
          type="button"
        >
          <div className="ai-fab-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
          <span className="ai-fab-label">Ask AI</span>
          <span className="ai-fab-pulse" />
        </button>
      )}
    </>
  );
}
