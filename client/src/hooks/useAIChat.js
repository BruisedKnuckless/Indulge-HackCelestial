/**
 * useAIChat.js
 * 
 * Custom hook for the Indulge AI assistant.
 * Manages conversation state, history, and API calls.
 */

import { useState, useCallback, useRef } from 'react';
import api from '../api/client';

export const QUICK_ACTIONS = [
  { id: 'requirements', label: '📋 My Requirements', prompt: 'Show me my current open requirements.' },
  { id: 'find', label: '🔍 Find Resources', prompt: 'Help me find resources available near me.' },
  { id: 'bookings', label: '📦 My Bookings', prompt: 'What is the status of my recent bookings?' },
  { id: 'how', label: '❓ How It Works', prompt: 'How does the Indulge marketplace work?' },
  { id: 'create', label: '✏️ Create Requirement', prompt: 'Help me create a new requirement.' },
  { id: 'pricing', label: '💰 Pricing Help', prompt: 'Explain how pricing and budgets work on Indulge.' },
];

export function useAIChat({ requirementId, bookingId, resourceId } = {}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm the **Indulge AI Assistant**. I can help you find resources, understand your bookings, explain requirement statuses, and much more.\n\nAll my responses are grounded in real marketplace data — I won't make things up. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const historyRef = useRef([]);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || input).trim();
      if (!trimmed || loading) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setError(null);

      // Build history for multi-turn context (last 10 exchanges)
      const apiHistory = historyRef.current.slice(-10);

      try {
        const { data } = await api.post('/ai/chat', {
          message: trimmed,
          history: apiHistory,
          requirementId,
          bookingId,
          resourceId,
        });

        const assistantMsg = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          contextSummary: data.contextSummary,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Update history for next turn
        historyRef.current = [
          ...historyRef.current,
          { role: 'user', parts: [{ text: trimmed }] },
          { role: 'model', parts: [{ text: data.reply }] },
        ];
      } catch (err) {
        const errMsg =
          err?.response?.data?.error ||
          'AI assistant is temporarily unavailable. Please try again.';
        setError(errMsg);

        const errorMsg = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errMsg}`,
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, requirementId, bookingId, resourceId]
  );

  const clearChat = useCallback(() => {
    historyRef.current = [];
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hello! I'm the **Indulge AI Assistant**. How can I help you today?",
        timestamp: new Date(),
      },
    ]);
    setError(null);
  }, []);

  return {
    messages,
    input,
    setInput,
    loading,
    error,
    sendMessage,
    clearChat,
  };
}
