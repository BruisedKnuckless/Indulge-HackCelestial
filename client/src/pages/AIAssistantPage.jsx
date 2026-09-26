/**
 * AIAssistantPage.jsx
 *
 * Dedicated full-page AI assistant experience.
 * Accessible at /assistant
 *
 * Includes:
 * - Full-width chat panel
 * - Natural-language requirement parser
 * - Tab navigation between features
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AIChatPanel from '../components/ai/AIChatPanel';
import AIRequirementParser from '../components/ai/AIRequirementParser';
import Logo from '../components/layout/Logo';

const TABS = [
  {
    id: 'chat',
    label: 'Ask AI',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    desc: 'Chat with AI about your marketplace activity',
  },
  {
    id: 'create',
    label: 'Create Requirement',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    ),
    desc: 'Describe what you need in plain English',
  },
];

export default function AIAssistantPage() {
  const [activeTab, setActiveTab] = useState('chat');
  const navigate = useNavigate();

  return (
    <div className="ai-page">
      <div className="ai-page-container">
        {/* Page Header */}
        <div className="ai-page-header">
          <div className="ai-page-header-inner">
            <div className="ai-page-badge">
              <span className="ai-page-badge-logo">
                <Logo size={14} showText={false} dark={false} />
              </span>
              Powered by Gemini
            </div>
            <h1 className="ai-page-title">Indulge AI Assistant</h1>
            <p className="ai-page-subtitle">
              Get instant help with resources, bookings, and requirements — grounded in your real marketplace data.
            </p>
          </div>

          {/* Capability cards */}
          <div className="ai-page-caps">
            {[
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
                label: 'Find Resources',
                desc: 'Search marketplace with natural language',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                ),
                label: 'Track Requirements',
                desc: 'Understand your open RFQs instantly',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                ),
                label: 'Explain Bookings',
                desc: 'Get clear status explanations',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
                label: 'Procurement Recovery',
                desc: 'Understand split-fulfillment options',
              },
            ].map((cap) => (
              <div key={cap.label} className="ai-cap-card">
                <span className="ai-cap-icon">{cap.icon}</span>
                <div>
                  <p className="ai-cap-label">{cap.label}</p>
                  <p className="ai-cap-desc">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="ai-page-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`ai-tab-${tab.id}`}
              className={`ai-page-tab ${activeTab === tab.id ? 'ai-page-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="ai-page-content">
          {activeTab === 'chat' && (
            <div className="ai-page-chat-wrapper">
              <AIChatPanel onClose={() => navigate(-1)} />
            </div>
          )}

          {activeTab === 'create' && (
            <div className="ai-page-parser-wrapper">
              <AIRequirementParser
                onRequirementCreated={(req) => {
                  // Navigate to the newly created requirement
                  if (req?._id) navigate(`/requirements/${req._id}`);
                }}
              />
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="ai-page-disclaimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
          <p>
            The Indulge AI Assistant only uses data you are authorized to access.
            It cannot create bookings, accept proposals, or modify transactions —
            all high-impact actions go through normal platform workflows with your explicit confirmation.
          </p>
        </div>
      </div>
    </div>
  );
}
