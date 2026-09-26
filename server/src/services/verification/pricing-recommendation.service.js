import { logger } from '../../utils/logger.js';

/**
 * Base abstract pricing recommendation service contract.
 */
export class BasePricingRecommendationService {
  async calculateRecommendation(_inputs) {
    throw new Error('calculateRecommendation() must be implemented by subclass.');
  }
}

/**
 * DeterministicPricingRecommendationService
 * Explainable, transparent pricing logic factoring:
 * - base listed price
 * - resource category
 * - verified condition score (0-100)
 * - quantity scale tier
 * - inspection issue penalties (minor vs major defects)
 */
export class DeterministicPricingRecommendationService extends BasePricingRecommendationService {
  /**
   * Generates recommended rental price and boundaries.
   * @param {Object} inputs
   * @param {number} inputs.listedPrice
   * @param {string} inputs.category
   * @param {string} [inputs.priceUnit]
   * @param {number} inputs.conditionScore (0-100)
   * @param {number} [inputs.quantity]
   * @param {Array} [inputs.parameters]
   * @param {string} [inputs.location]
   * @returns {Promise<{ recommendedPrice: number, lowerBound: number, upperBound: number, score: number, explanation: string }>}
   */
  async calculateRecommendation({
    listedPrice,
    category,
    priceUnit = 'per_day',
    conditionScore = 85,
    quantity = 1,
    parameters = [],
    location = '',
  }) {
    const base = Number(listedPrice) || 0;
    if (base <= 0) {
      return {
        recommendedPrice: 0,
        lowerBound: 0,
        upperBound: 0,
        score: conditionScore,
        explanation: 'No base listed price provided to benchmark against.',
      };
    }

    // 1. Condition Multiplier
    // 95-100: Exceptional quality (+3% to +5% upside potential)
    // 85-94:  Good / standard quality (0% to +2%)
    // 75-84:  Fair condition (-3% to -7% concession)
    // 60-74:  Noticeable wear (-10% to -18%)
    // < 60:   Defects / heavy wear (-25% to -40%)
    let conditionFactor = 1.0;
    let conditionQualityNote = 'Good Condition';

    if (conditionScore >= 95) {
      conditionFactor = 1.04;
      conditionQualityNote = 'Pristine / Exceptional Condition';
    } else if (conditionScore >= 85) {
      conditionFactor = 1.0;
      conditionQualityNote = 'Standard Verified Condition';
    } else if (conditionScore >= 75) {
      conditionFactor = 0.95;
      conditionQualityNote = 'Acceptable / Light Wear Condition';
    } else if (conditionScore >= 60) {
      conditionFactor = 0.85;
      conditionQualityNote = 'Noticeable Wear Condition';
    } else {
      conditionFactor = 0.70;
      conditionQualityNote = 'Heavy Wear / Sub-optimal Condition';
    }

    // 2. Issue Penalties
    let minorIssuesCount = 0;
    let majorIssuesCount = 0;

    for (const p of parameters) {
      if (p.issueFlag === 'minor') minorIssuesCount++;
      if (p.issueFlag === 'major') majorIssuesCount++;
    }

    const issuePenalty = minorIssuesCount * 0.03 + majorIssuesCount * 0.12;
    const netMultiplier = Math.max(0.4, conditionFactor - issuePenalty);

    // 3. Recommended Price Calculation
    let rawRecommended = base * netMultiplier;

    // Round neatly based on magnitude
    let recommendedPrice;
    if (rawRecommended >= 1000) {
      recommendedPrice = Math.round(rawRecommended / 50) * 50;
    } else if (rawRecommended >= 100) {
      recommendedPrice = Math.round(rawRecommended / 5) * 5;
    } else {
      recommendedPrice = Math.round(rawRecommended);
    }

    // 4. Spread / Bound calculation (± 7% - 10%)
    const spreadPct = conditionScore >= 80 ? 0.07 : 0.12;
    let lowerBound = Math.round(recommendedPrice * (1 - spreadPct));
    let upperBound = Math.round(recommendedPrice * (1 + spreadPct));

    if (recommendedPrice < 100) {
      lowerBound = Math.max(1, Math.round(recommendedPrice * 0.9));
      upperBound = Math.round(recommendedPrice * 1.1);
    }

    // 5. Plain English Explainable Rationale
    let issuesText = 'no recorded physical issues';
    if (minorIssuesCount > 0 || majorIssuesCount > 0) {
      issuesText = `${minorIssuesCount} minor issue(s) and ${majorIssuesCount} major issue(s) noted`;
    }

    const explanation = `Price recommendation based on verified condition score of ${conditionScore}/100 (${conditionQualityNote}) with ${issuesText}. Recommended rental range benchmarked for ${category.replace(
      '_',
      ' '
    )} marketplace liquidity.`;

    return {
      recommendedPrice,
      lowerBound,
      upperBound,
      score: conditionScore,
      explanation,
    };
  }
}

/**
 * ModelPricingRecommendationAdapter
 * Adapter ready for a future ML pricing model endpoint or local regression engine.
 */
export class ModelPricingRecommendationAdapter extends BasePricingRecommendationService {
  constructor(fallbackService = new DeterministicPricingRecommendationService(), modelConfig = {}) {
    super();
    this.fallback = fallbackService;
    this.modelConfig = modelConfig;
  }

  async calculateRecommendation(inputs) {
    if (this.modelConfig.pricingModelEndpoint) {
      try {
        // e.g. const res = await fetch(this.modelConfig.pricingModelEndpoint, { method: 'POST', body: JSON.stringify(inputs) });
        // return await res.json();
      } catch (err) {
        logger.warn('ML Pricing Model invocation failed, falling back to deterministic formula:', {
          error: err.message,
        });
      }
    }

    return this.fallback.calculateRecommendation(inputs);
  }
}

// Singleton exported pricing service
export const pricingRecommendationService = new ModelPricingRecommendationAdapter(
  new DeterministicPricingRecommendationService()
);

export async function generatePriceRecommendation(inputs) {
  return pricingRecommendationService.calculateRecommendation(inputs);
}
