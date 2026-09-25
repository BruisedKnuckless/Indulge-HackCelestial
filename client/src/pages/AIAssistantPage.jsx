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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
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
              { icon: '🔍', label: 'Find Resources', desc: 'Search marketplace with natural language' },
              { icon: '📋', label: 'Track Requirements', desc: 'Understand your open RFQs instantly' },
              { icon: '📦', label: 'Explain Bookings', desc: 'Get clear status explanations' },
              { icon: '⚡', label: 'Procurement Recovery', desc: 'Understand split-fulfillment options' },
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
