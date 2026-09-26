/**
 * AIAssistantButton.jsx
 *
 * Floating assistant button that opens/closes the AI chat panel.
 * Appears as a premium floating action button in the bottom-right corner.
 */

import { useState, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import Logo from '../layout/Logo';

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
          <div className="ai-fab-logo">
            <Logo size={16} showText={false} dark={false} />
          </div>
          <span className="ai-fab-label">Ask AI</span>
          <span className="ai-fab-pulse" />
        </button>
      )}
    </>
  );
}
