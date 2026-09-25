/**
 * AIChatPanel.jsx
 *
 * The Indulge AI Assistant chat interface.
 * A floating panel with a premium B2B design that stays consistent with
 * the existing Indulge marketplace aesthetic.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAIChat, QUICK_ACTIONS } from '../../hooks/useAIChat';

// ─── Markdown renderer ────────────────────────────────────────────────────────

function ChatMarkdown({ content }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="ai-chat-md-p">{children}</p>,
        strong: ({ children }) => <strong className="ai-chat-md-strong">{children}</strong>,
        ul: ({ children }) => <ul className="ai-chat-md-ul">{children}</ul>,
        ol: ({ children }) => <ol className="ai-chat-md-ol">{children}</ol>,
        li: ({ children }) => <li className="ai-chat-md-li">{children}</li>,
        code: ({ children }) => <code className="ai-chat-md-code">{children}</code>,
        h3: ({ children }) => <h3 className="ai-chat-md-h3">{children}</h3>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div className={`ai-message-row ${isUser ? 'ai-message-row--user' : 'ai-message-row--assistant'}`}>
      {!isUser && (
        <div className="ai-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
          </svg>
        </div>
      )}
      <div className={`ai-bubble ${isUser ? 'ai-bubble--user' : isError ? 'ai-bubble--error' : 'ai-bubble--assistant'}`}>
        {isUser ? (
          <p className="ai-bubble-user-text">{message.content}</p>
        ) : (
          <ChatMarkdown content={message.content} />
        )}
        <span className="ai-bubble-time">
          {message.timestamp instanceof Date
            ? message.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            : ''}
        </span>
      </div>
      {isUser && (
        <div className="ai-avatar ai-avatar--user">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="ai-message-row ai-message-row--assistant">
      <div className="ai-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
        </svg>
      </div>
      <div className="ai-bubble ai-bubble--assistant ai-bubble--typing">
        <span className="ai-typing-dot" style={{ animationDelay: '0ms' }} />
        <span className="ai-typing-dot" style={{ animationDelay: '150ms' }} />
        <span className="ai-typing-dot" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({ onAction, visible }) {
  if (!visible) return null;
  return (
    <div className="ai-quick-actions">
      <p className="ai-quick-label">Quick actions</p>
      <div className="ai-quick-grid">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            id={`ai-quick-${action.id}`}
            className="ai-quick-btn"
            onClick={() => onAction(action.prompt)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AIChatPanel({
  onClose,
  requirementId,
  bookingId,
  resourceId,
  initialMessage,
}) {
  const { messages, input, setInput, loading, sendMessage, clearChat } = useAIChat({
    requirementId,
    bookingId,
    resourceId,
  });

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Send initial context message if provided
  useEffect(() => {
    if (initialMessage) {
      sendMessage(initialMessage);
      setHasInteracted(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(() => {
    if (input.trim()) {
      setHasInteracted(true);
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleQuickAction = useCallback(
    (prompt) => {
      setHasInteracted(true);
      sendMessage(prompt);
    },
    [sendMessage]
  );

  return (
    <div className="ai-panel" role="dialog" aria-label="Indulge AI Assistant" aria-modal="true">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-panel-header-left">
          <div className="ai-panel-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
          <div>
            <h2 className="ai-panel-title">Indulge Assistant</h2>
            <p className="ai-panel-subtitle">
              <span className="ai-status-dot" />
              Grounded in real marketplace data
            </p>
          </div>
        </div>
        <div className="ai-panel-actions">
          <button
            id="ai-clear-btn"
            className="ai-icon-btn"
            onClick={clearChat}
            title="Clear conversation"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
          <button
            id="ai-close-btn"
            className="ai-icon-btn"
            onClick={onClose}
            title="Close assistant"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions — show only before first interaction */}
      <QuickActions onAction={handleQuickAction} visible={!hasInteracted} />

      {/* Input */}
      <div className="ai-input-area">
        <div className="ai-input-wrapper">
          <textarea
            id="ai-chat-input"
            ref={inputRef}
            className="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about resources, bookings, requirements..."
            rows={1}
            maxLength={2000}
            disabled={loading}
            aria-label="Chat with Indulge AI"
          />
          <button
            id="ai-send-btn"
            className={`ai-send-btn ${loading || !input.trim() ? 'ai-send-btn--disabled' : ''}`}
            onClick={handleSend}
            disabled={loading || !input.trim()}
            type="button"
            aria-label="Send message"
          >
            {loading ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ai-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            )}
          </button>
        </div>
        <p className="ai-disclaimer">
          AI responses are grounded in real platform data · Cannot create bookings or commit inventory
        </p>
      </div>
    </div>
  );
}
