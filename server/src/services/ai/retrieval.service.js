/**
 * retrieval.service.js
 *
 * Retrieval-Augmented Generation helpers for the Indulge AI assistant.
 *
 * Strategy:
 *  - Structured live facts (availability, price, qty, status) → MongoDB direct
 *  - Semantic discovery & explanations → keyword + category search + Gemini
 *  - Policies / FAQs → in-process static knowledge base
 *
 * No external vector DB is required. This keeps infrastructure simple while
 * still allowing the chatbot to answer semantic questions like
 * "which provider is best for my event?" using real match data.
 */

import Resource from '../../models/Resource.js';
import Requirement from '../../models/Requirement.js';
import User from '../../models/User.js';
import Booking from '../../models/Booking.js';
import { rankResources } from '../matching.service.js';

// ─── Static knowledge base ─────────────────────────────────────────────────
export const INDULGE_FAQ = [
  {
    topic: 'platform_overview',
    content: `Indulge is a B2B hospitality resource exchange marketplace. 
Businesses can list resources (banquet spaces, furniture, vehicles, kitchen capacity, AV equipment, staff, parking) 
and other businesses can discover and book them. Both sides of a transaction can be the same business type.`,
  },
  {
    topic: 'requirements_rfq',
    content: `A Requirement (also called RFQ — Request for Quotation) is posted by a seeker who needs resources.
Providers browse the requirement board and submit proposals/offers. The seeker reviews and accepts the best offer.
Requirements have: category, quantity needed, date/time window, location, max budget, urgency (low/medium/high).
Status progression: open → fulfilled/closed/cancelled/expired.`,
  },
  {
    topic: 'booking_lifecycle',
    content: `Booking status flow: pending → negotiating → accepted → confirmed → completed (or cancelled/rejected at any step).
"accepted" and "confirmed" are hard-reserved states — inventory is locked. 
"pending" and "negotiating" do NOT lock inventory for others.
Fulfillment sub-states: packed → loading → out_for_delivery → delivered.
Return sub-states: return_requested → return_pickup_scheduled → return_in_transit → returned_to_provider → return_completed.`,
  },
  {
    topic: 'pricing',
    content: `Resources are priced as: per_hour, per_day, per_event, or per_unit.
Prices are set by the provider. Seekers can negotiate through the negotiation flow.
A budget (maxBudget) can be set on a requirement to filter results.`,
  },
  {
    topic: 'matching_scoring',
    content: `Indulge uses a deterministic multi-factor scoring algorithm for ranking resources:
- priceFit: how well the price fits the budget
- distanceFit: proximity to the event location
- availabilityFit: whether enough quantity is available
- capacityFit: whether venue/resource capacity meets the need
- urgencyFit: accounts for how soon the event is
- preferenceBonus: bonus if the provider is in the seeker's preferred list
These scores are combined into a single matchScore. Higher is better.`,
  },
  {
    topic: 'logistics',
    content: `Resources marked "requiresLogistics" need physical delivery. 
Logistics options per booking: self_pickup or provider_transport.
Logistics partners (separate account type) manage the actual transport.`,
  },
  {
    topic: 'categories',
    content: `Available resource categories on Indulge:
- banquet_space: Halls, venues for events
- parking: Parking lots and spaces
- vehicle: Transport vehicles
- kitchen_capacity: Shared kitchen/production capacity
- furniture: Tables, chairs, décor
- av_equipment: Sound, lighting, projection
- staff: Catering, service, event staff
- other: Miscellaneous`,
  },
  {
    topic: 'procurement_recovery',
    content: `When a requirement cannot be fully fulfilled by a single provider, 
the procurement solver attempts to split the order across multiple providers.
For example: "300 chairs" might be fulfilled as Provider A (200) + Provider B (100).
AI explains these options but does NOT make the decision or commit inventory.
All feasibility is validated by the backend solver before being presented.`,
  },
];

// ─── Resource discovery ────────────────────────────────────────────────────

/**
 * Search for resources matching natural-language criteria.
 * Returns ranked results with match breakdowns.
 *
 * @param {object} criteria – parsed search parameters
 * @param {object} seeker   – current user
 */
export async function searchResourcesForAI(criteria, seeker) {
  const {
    category,
    quantity = 1,
    startDateTime,
    endDateTime,
    location,
    maxBudget,
    radiusKm = 25,
  } = criteria;

  const query = { status: 'active' };
  if (category && category !== 'other') query.category = category;

  let candidates = [];

  // Geo-aware search when location is provided
  if (location?.coordinates?.length === 2) {
    const [lng, lat] = location.coordinates;
    const geoResults = await Resource.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceMeters',
          maxDistance: (radiusKm || 25) * 1000,
          spherical: true,
          query,
        },
      },
      { $limit: 30 },
    ]);
    candidates = geoResults.map((r) => ({ ...r, distanceKm: r.distanceMeters / 1000 }));
  } else {
    candidates = await Resource.find(query).limit(20).lean();
  }

  const rankCriteria = {
    start: startDateTime ? new Date(startDateTime) : null,
    end: endDateTime ? new Date(endDateTime) : null,
    quantity,
    budget: maxBudget,
    radiusKm,
  };

  const ranked = await rankResources(candidates, rankCriteria, seeker);
  return ranked.slice(0, 8); // top 8 for AI context
}

/**
 * Find provider profile with their active listings and rating.
 */
export async function getProviderContext(providerId) {
  const provider = await User.findById(providerId).lean();
  if (!provider) return null;
  const resources = await Resource.find({ owner: providerId, status: 'active' }).limit(10).lean();
  return {
    provider: {
      id: provider._id,
      businessName: provider.businessName,
      businessType: provider.businessType,
      location: provider.location,
      ratingAvg: provider.ratingAvg,
      ratingCount: provider.ratingCount,
    },
    activeListings: resources.map((r) => ({
      id: r._id,
      title: r.title,
      category: r.category,
      totalQuantity: r.totalQuantity,
      basePrice: r.pricing?.basePrice,
      priceUnit: r.pricing?.priceUnit,
    })),
  };
}

/**
 * Retrieve relevant FAQ / policy snippets for a query.
 * Simple keyword matching — no embeddings needed for a small knowledge base.
 */
export function retrieveFAQ(query = '') {
  const q = query.toLowerCase();
  const keywords = {
    platform_overview: ['indulge', 'platform', 'marketplace', 'how does', 'what is'],
    requirements_rfq: ['requirement', 'rfq', 'post', 'quote', 'request', 'open'],
    booking_lifecycle: ['booking', 'status', 'confirmed', 'pending', 'accepted', 'cancelled', 'fulfilled'],
    pricing: ['price', 'cost', 'budget', 'rate', 'per hour', 'per day', 'per unit'],
    matching_scoring: ['rank', 'score', 'match', 'why', 'better', 'higher', 'best'],
    logistics: ['logistics', 'delivery', 'transport', 'pickup', 'partner'],
    categories: ['category', 'chair', 'furniture', 'banquet', 'kitchen', 'vehicle', 'staff', 'parking', 'av'],
    procurement_recovery: ['procurement', 'recovery', 'failed', 'partial', 'split', 'alternative'],
  };

  const relevant = [];
  for (const faq of INDULGE_FAQ) {
    const kws = keywords[faq.topic] || [];
    if (kws.some((kw) => q.includes(kw))) {
      relevant.push(faq);
    }
  }

  // Always include platform overview as base context
  if (!relevant.find((f) => f.topic === 'platform_overview')) {
    relevant.unshift(INDULGE_FAQ.find((f) => f.topic === 'platform_overview'));
  }

  return relevant;
}

/**
 * Build a formatted context string for Gemini prompts.
 */
export function formatContextForPrompt(userCtx, faqSnippets = [], extraData = {}) {
  const lines = [];

  lines.push('=== INDULGE PLATFORM KNOWLEDGE ===');
  for (const faq of faqSnippets) {
    lines.push(`[${faq.topic.toUpperCase()}]\n${faq.content}`);
  }

  lines.push('\n=== CURRENT USER ===');
  lines.push(`Business: ${userCtx.user.businessName} (${userCtx.user.businessType})`);
  if (userCtx.user.location?.city) {
    lines.push(`Location: ${userCtx.user.location.city}`);
  }

  if (userCtx.myOpenRequirements?.length > 0) {
    lines.push('\n=== MY OPEN REQUIREMENTS ===');
    for (const req of userCtx.myOpenRequirements) {
      lines.push(
        `- [${req.id}] ${req.title} | ${req.category} | qty:${req.requiredQuantity} | ` +
        `${req.startDateTime ? new Date(req.startDateTime).toLocaleDateString('en-IN') : '?'} | ` +
        `budget:₹${req.maxBudget || 'N/A'} | status:${req.status}`
      );
    }
  }

  if (userCtx.myRecentBookings?.length > 0) {
    lines.push('\n=== MY RECENT BOOKINGS ===');
    for (const b of userCtx.myRecentBookings.slice(0, 6)) {
      const role = b.isAsSeeker ? 'SEEKER' : 'PROVIDER';
      lines.push(
        `- [${b.id}] ${b.resourceTitle || 'resource'} | ${role} | ` +
        `status:${b.status} | ₹${b.agreedPrice || b.quotedPrice || '?'}`
      );
    }
  }

  if (userCtx.focusRequirement) {
    lines.push('\n=== FOCUSED REQUIREMENT ===');
    lines.push(JSON.stringify(userCtx.focusRequirement, null, 2));
  }

  if (userCtx.focusBooking) {
    lines.push('\n=== FOCUSED BOOKING ===');
    lines.push(JSON.stringify(userCtx.focusBooking, null, 2));
  }

  if (userCtx.focusResource) {
    lines.push('\n=== FOCUSED RESOURCE ===');
    lines.push(JSON.stringify(userCtx.focusResource, null, 2));
  }

  if (extraData.searchResults?.length > 0) {
    lines.push('\n=== SEARCH RESULTS (REAL DATA FROM MARKETPLACE) ===');
    for (const r of extraData.searchResults) {
      lines.push(
        `- [${r._id}] ${r.title} | ${r.category} | qty:${r.availableQuantity}/${r.totalQuantity} | ` +
        `₹${r.pricing?.basePrice}/${r.pricing?.priceUnit} | ` +
        `${r.distanceKm ? r.distanceKm.toFixed(1) + 'km' : 'location N/A'} | ` +
        `score:${r.matchScore?.toFixed(2) || 'N/A'} | ` +
        `${r.matchReasons?.join(', ') || ''}`
      );
    }
  }

  if (extraData.procurementOptions?.length > 0) {
    lines.push('\n=== PROCUREMENT RECOVERY OPTIONS (BACKEND-VALIDATED) ===');
    lines.push(JSON.stringify(extraData.procurementOptions, null, 2));
  }

  return lines.join('\n');
}
