/**
 * AIAssistantButton.jsx
 *
 * Floating assistant button that opens/closes the AI chat panel.
 * Appears as a premium floating action button in the bottom-right corner.
 */

import { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
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
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Close chatbot when clicking outside panel
  useEffect(() => {
    if (!open || inline) return;

    const handlePointerDown = (event) => {
      // If clicking inside the panel, keep it open
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      // If clicking the launcher button itself, let button's onClick handle it
      if (buttonRef.current && buttonRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    // Register listener on next tick so the opening click does not immediately trigger outside-click
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, inline]);

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
        <div className="ai-panel-overlay" ref={panelRef}>
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
          ref={buttonRef}
          className="ai-fab"
          onClick={handleOpen}
          aria-label="Open Indulge AI Assistant"
          title="Indulge Assistant"
          type="button"
        >
          <div className="ai-fab-logo">
            <Logo size={16} showText={false} dark={false} />
          </div>
          <span className="ai-fab-label">Indulge Assistant</span>
          <span className="ai-fab-pulse" />
        </button>
      )}
    </>
  );
}
