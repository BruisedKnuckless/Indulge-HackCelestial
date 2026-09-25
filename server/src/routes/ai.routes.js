/**
 * ai.routes.js
 *
 * REST endpoints for the Indulge AI / chatbot layer.
 *
 * All routes require authentication — the AI system uses the current user's
 * authorization scope to build context and retrieve data.
 *
 * Endpoints:
 *   POST /api/ai/chat               — multi-turn assistant chat
 *   POST /api/ai/parse-requirement  — NL → structured requirement fields
 *   POST /api/ai/explain-match      — explain a resource's match score
 *   POST /api/ai/recovery           — explain backend procurement options
 */

import { Router } from 'express';
import { requireAuth, requireBusinessUser } from '../middleware/auth.middleware.js';
import { buildUserContext, buildParseContext } from '../services/ai/ai-context.service.js';
import {
  searchResourcesForAI,
  retrieveFAQ,
  formatContextForPrompt,
} from '../services/ai/retrieval.service.js';
import { startChatSession, generateText } from '../services/ai/gemini.service.js';
import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import Booking from '../models/Booking.js';
import { RESOURCE_CATEGORIES } from '../models/Resource.js';

const router = Router();

// All AI routes require an authenticated business user
router.use(requireAuth, requireBusinessUser);

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Indulge AI Assistant, a helpful B2B hospitality marketplace assistant.

CRITICAL RULES — NEVER VIOLATE:
1. NEVER invent, fabricate, or guess resource availability, prices, quantities, or booking data.
2. ALL inventory facts MUST come from the REAL DATA sections provided in context.
3. You may ONLY explain and summarize options that the backend has already validated and provided.
4. You CANNOT create bookings, accept proposals, transfer money, or change any platform state.
5. You CANNOT access another company's private bookings, transactions, or confidential data.
6. When asked about live availability, always indicate you are showing results from the marketplace.
7. If you don't have data to answer a question accurately, say so rather than guessing.

YOUR CAPABILITIES:
- Answer questions about the user's requirements, bookings, and listings
- Help the user understand the platform (pricing, matching, logistics)
- Explain why a provider ranks higher using the actual match breakdown
- Summarize and compare real search results from the marketplace
- Help the user draft requirement details for review (they must confirm before submission)
- Explain procurement recovery options (backend-generated only)
- Answer FAQs about how Indulge works

TONE: Professional, clear, concise. This is a B2B platform — users are hospitality professionals.

CURRENCY: Use ₹ (Indian Rupee) for all prices.`;

// ─── POST /api/ai/chat ───────────────────────────────────────────────────────

/**
 * Multi-turn conversational assistant.
 *
 * Body:
 *   message        {string}   — the user's latest message
 *   history        {Array}    — [{role: 'user'|'model', parts: [{text}]}]
 *   requirementId  {string?}  — if context is a specific requirement
 *   bookingId      {string?}  — if context is a specific booking
 *   resourceId     {string?}  — if context is a specific resource
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], requirementId, bookingId, resourceId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required.' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters).' });
    }

    // Build grounded context from real data
    const userCtx = await buildUserContext(req.user, { requirementId, bookingId, resourceId });

    // Attempt to retrieve relevant marketplace data for semantic queries
    let searchResults = [];
    const msgLower = message.toLowerCase();
    const isSearchQuery =
      msgLower.includes('find') ||
      msgLower.includes('search') ||
      msgLower.includes('available') ||
      msgLower.includes('near') ||
      msgLower.includes('chair') ||
      msgLower.includes('table') ||
      msgLower.includes('venue') ||
      msgLower.includes('space') ||
      msgLower.includes('provider') ||
      msgLower.includes('resource');

    if (isSearchQuery && req.user.location?.coordinates?.length === 2) {
      // Try to search with user's location for relevant results
      try {
        searchResults = await searchResourcesForAI(
          { location: req.user.location, radiusKm: 25 },
          req.user
        );
      } catch {
        // Non-fatal — proceed without search results
      }
    }

    // Retrieve relevant FAQ snippets
    const faqSnippets = retrieveFAQ(message);

    // Build the grounded context string
    const groundedContext = formatContextForPrompt(userCtx, faqSnippets, { searchResults });

    // Construct the full prompt with context injected
    const contextualMessage = `${SYSTEM_PROMPT}

${groundedContext}

=== USER MESSAGE ===
${message}

Respond helpfully using ONLY the real data provided above. Do not fabricate any marketplace data.`;

    // Use multi-turn chat with history for conversational continuity
    // For context injection we prepend as a user turn if history is empty
    let chatHistory = history.filter(
      (h) => h.role && ['user', 'model'].includes(h.role) && h.parts?.length > 0
    );

    // Sanitize history to prevent prompt injection — strip overly long turns
    chatHistory = chatHistory.slice(-10).map((h) => ({
      role: h.role,
      parts: [{ text: String(h.parts[0]?.text || '').slice(0, 1000) }],
    }));

    const chat = startChatSession(chatHistory);
    const result = await chat.sendMessage(contextualMessage);
    const reply = result.response.text();

    if (!reply || reply.trim().length === 0) {
      return res.status(502).json({ error: 'AI returned an empty response. Please try again.' });
    }

    return res.json({
      reply,
      contextSummary: {
        requirementsLoaded: userCtx.myOpenRequirements?.length || 0,
        bookingsLoaded: userCtx.myRecentBookings?.length || 0,
        searchResultsLoaded: searchResults.length,
      },
    });
  } catch (err) {
    console.error('[AI chat error]', err.message);
    // Graceful degradation — chatbot failure should not crash the app
    if (err.message?.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'AI service not configured. Please contact support.' });
    }
    return res.status(503).json({
      error: 'AI assistant is temporarily unavailable. Please try again in a moment.',
    });
  }
});

// ─── POST /api/ai/parse-requirement ──────────────────────────────────────────

/**
 * Natural-language → structured requirement extraction.
 * Gemini extracts fields; the client shows them for user review before
 * the existing /api/requirements endpoint validates and saves them.
 *
 * Body:
 *   text {string} — e.g. "Need 500 chairs in Thane tomorrow 5PM to 11PM, budget ₹30,000"
 */
router.post('/parse-requirement', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required.' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ error: 'Input too long (max 1000 characters).' });
    }

    const parseCtx = await buildParseContext(req.user);

    const prompt = `You are a structured data extractor for Indulge, a B2B hospitality marketplace.

Extract requirement fields from the following user input. Return ONLY valid JSON.

USER CONTEXT:
- Business: ${parseCtx.businessName} (${parseCtx.businessType})
- User Location: ${JSON.stringify(parseCtx.userLocation)}
- Current DateTime: ${parseCtx.currentDateTime}

RESOURCE CATEGORIES (use exact values): ${RESOURCE_CATEGORIES.join(', ')}
URGENCY VALUES: low, medium, high
UNIT VALUES: unit, hour, seat, sqft, slot

USER INPUT: "${text}"

Extract and return a JSON object with these fields (use null for fields that cannot be inferred):
{
  "title": "concise requirement title (max 140 chars)",
  "category": "one of the RESOURCE CATEGORIES above",
  "requiredQuantity": number or null,
  "unit": "one of the UNIT VALUES",
  "startDateTime": "ISO 8601 datetime string or null",
  "endDateTime": "ISO 8601 datetime string or null",
  "location": {
    "city": "city name or null",
    "address": "address or null"
  },
  "maxBudget": number (in INR, no symbol) or null,
  "urgency": "low | medium | high",
  "description": "additional context from the input or null",
  "confidence": "high | medium | low (how confident you are in the extraction)",
  "clarificationsNeeded": ["list of fields that are ambiguous or missing"]
}

RULES:
- Use the current date/time to resolve relative dates like "tomorrow", "next Saturday"
- If the user is in ${parseCtx.userLocation?.city || 'their city'}, default location to that city
- Return ONLY the JSON object, no markdown, no explanation`;

    const raw = await generateText(prompt, { structured: true });

    // Validate the JSON output
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[parse-requirement] Gemini returned invalid JSON:', raw.slice(0, 200));
      return res.status(502).json({
        error: 'AI could not parse that input. Please try rephrasing your requirement.',
      });
    }

    // Server-side validation of extracted fields
    const VALID_CATEGORIES = RESOURCE_CATEGORIES;
    const VALID_URGENCY = ['low', 'medium', 'high'];
    const VALID_UNITS = ['unit', 'hour', 'seat', 'sqft', 'slot'];

    const validated = {
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 140) : null,
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : null,
      requiredQuantity:
        typeof parsed.requiredQuantity === 'number' && parsed.requiredQuantity > 0
          ? Math.round(parsed.requiredQuantity)
          : null,
      unit: VALID_UNITS.includes(parsed.unit) ? parsed.unit : 'unit',
      startDateTime:
        parsed.startDateTime && !isNaN(new Date(parsed.startDateTime))
          ? new Date(parsed.startDateTime).toISOString()
          : null,
      endDateTime:
        parsed.endDateTime && !isNaN(new Date(parsed.endDateTime))
          ? new Date(parsed.endDateTime).toISOString()
          : null,
      location: {
        city: typeof parsed.location?.city === 'string' ? parsed.location.city : null,
        address: typeof parsed.location?.address === 'string' ? parsed.location.address : null,
      },
      maxBudget:
        typeof parsed.maxBudget === 'number' && parsed.maxBudget > 0
          ? Math.round(parsed.maxBudget)
          : null,
      urgency: VALID_URGENCY.includes(parsed.urgency) ? parsed.urgency : 'medium',
      description: typeof parsed.description === 'string' ? parsed.description : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      clarificationsNeeded: Array.isArray(parsed.clarificationsNeeded)
        ? parsed.clarificationsNeeded.filter((c) => typeof c === 'string').slice(0, 10)
        : [],
    };

    return res.json({
      extracted: validated,
      rawInput: text,
      notice:
        'These fields were extracted by AI and must be reviewed and confirmed by you before submission. The final requirement will be validated by the platform.',
    });
  } catch (err) {
    console.error('[parse-requirement error]', err.message);
    return res.status(503).json({
      error: 'AI parsing service is temporarily unavailable.',
    });
  }
});

// ─── POST /api/ai/explain-match ───────────────────────────────────────────────

/**
 * Translate a deterministic match breakdown into human-readable explanation.
 *
 * Body:
 *   resourceId   {string}  — the resource being explained
 *   requirementId {string} — the requirement context (must belong to user)
 *   matchBreakdown {object} — the actual scoring breakdown from the backend
 */
router.post('/explain-match', async (req, res) => {
  try {
    const { resourceId, requirementId, matchBreakdown } = req.body;

    if (!resourceId || !matchBreakdown || typeof matchBreakdown !== 'object') {
      return res.status(400).json({ error: 'resourceId and matchBreakdown are required.' });
    }

    // Fetch real resource data
    const resource = await Resource.findById(resourceId).populate('owner', 'businessName ratingAvg').lean();
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    // If requirementId provided, verify it belongs to this user
    let requirement = null;
    if (requirementId) {
      requirement = await Requirement.findOne({
        _id: requirementId,
        seeker: req.user._id,
      }).lean();
    }

    // Build explanation using REAL match data only — no fabrication
    const prompt = `You are the Indulge AI Assistant explaining why a resource ranked a certain way.

REAL MATCH DATA (from the platform's deterministic scoring algorithm):
Resource: "${resource.title}" (${resource.category})
Provider: ${resource.owner?.businessName || 'Unknown'}
Price: ₹${resource.pricing?.basePrice} ${resource.pricing?.priceUnit}
Total Quantity: ${resource.totalQuantity} ${resource.unit}
Rating: ${resource.ratingAvg}/5 (${resource.ratingCount} reviews)

ACTUAL SCORE BREAKDOWN (values are 0.0 to 1.0):
${JSON.stringify(matchBreakdown, null, 2)}

${requirement ? `REQUIREMENT CONTEXT:
Title: ${requirement.title}
Category: ${requirement.category}
Quantity Needed: ${requirement.requiredQuantity}
Budget: ₹${requirement.maxBudget || 'not set'}
Urgency: ${requirement.urgency}` : ''}

Write a clear, factual 2-4 sentence explanation of why this resource ranked as it did.
Use the ACTUAL score values above. DO NOT invent percentages or facts not in the data.
Be specific: mention the actual price, distance, quantity if they influenced the score.
Use professional B2B tone. Do not use bullet points — write in natural sentences.`;

    const explanation = await generateText(prompt);

    return res.json({
      explanation,
      matchBreakdown, // echo back for transparency
      resourceTitle: resource.title,
      providerName: resource.owner?.businessName,
    });
  } catch (err) {
    console.error('[explain-match error]', err.message);
    return res.status(503).json({ error: 'AI explanation service is temporarily unavailable.' });
  }
});

// ─── POST /api/ai/recovery ────────────────────────────────────────────────────

/**
 * AI explains backend-generated procurement recovery options.
 *
 * IMPORTANT: Gemini receives ONLY options that the backend solver has already
 * validated. Gemini explains, compares, and summarises — it does NOT generate
 * new options or claim inventory is available.
 *
 * Body:
 *   requirementId  {string}  — must belong to current user
 *   options        {Array}   — backend-validated procurement options (from solver)
 *   context        {object?} — additional context from the solver
 */
router.post('/recovery', async (req, res) => {
  try {
    const { requirementId, options, context: solverContext } = req.body;

    if (!requirementId || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: 'requirementId and options[] are required.' });
    }

    // Verify requirement belongs to current user
    const requirement = await Requirement.findOne({
      _id: requirementId,
      seeker: req.user._id,
    }).lean();

    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found or not owned by you.' });
    }

    // Hard limit on options count to prevent prompt stuffing
    const safeOptions = options.slice(0, 10);

    const prompt = `You are the Indulge AI Assistant helping a hospitality business recover a failed procurement.

REQUIREMENT:
Title: ${requirement.title}
Category: ${requirement.category}  
Quantity Needed: ${requirement.requiredQuantity}
Budget: ₹${requirement.maxBudget || 'not set'}
Date: ${requirement.startDateTime ? new Date(requirement.startDateTime).toLocaleDateString('en-IN') : 'N/A'}
Urgency: ${requirement.urgency}

BACKEND-VALIDATED RECOVERY OPTIONS (these have been checked for real availability):
${JSON.stringify(safeOptions, null, 2)}

${solverContext ? `ADDITIONAL SOLVER CONTEXT:\n${JSON.stringify(solverContext)}` : ''}

CRITICAL: These options come from the platform's backend solver and represent REAL available inventory.
DO NOT suggest options not listed above. DO NOT claim inventory is available beyond what is shown.

Write a helpful response that:
1. Briefly acknowledges that the full requirement could not be met by a single provider
2. Explains each option in plain language (what it means practically for the business)
3. Highlights the trade-offs (cost, logistics, timeline, reliability)
4. Makes a clear recommendation based on the data, explaining why

Format as a natural, professional response. Use ₹ for currency.
Keep it concise — the user needs to make a decision, not read an essay.`;

    const explanation = await generateText(prompt);

    return res.json({
      explanation,
      requirementId,
      optionCount: safeOptions.length,
      notice:
        'All options above were validated by the platform backend. AI provides explanation only — no inventory has been committed.',
    });
  } catch (err) {
    console.error('[recovery error]', err.message);
    return res.status(503).json({ error: 'AI recovery service is temporarily unavailable.' });
  }
});

export default router;
