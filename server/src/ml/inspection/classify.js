/**
 * Product classification: which inspection category (taxonomy.json) an item
 * belongs to.
 *
 * Transparent keyword scoring rather than a learnt classifier — there is no
 * labelled data to learn from yet, and every decision here can be explained
 * by the terms that produced it. Signals, strongest first:
 *   - the category the provider declared (e.g. "Laptop"),   +8
 *   - keywords in the product name, brand or model,           +2 each
 *   - keywords in the description, features or specs,         +1 each
 *   - the Indulge listing category (e.g. av_equipment),       +1
 * The score is a rule score, not a probability; `margin` over the runner-up
 * says how clear-cut the decision was.
 */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (kw) => new RegExp(`(^|[^a-z0-9])${escape(kw.toLowerCase())}([^a-z0-9]|$)`, 'i');

export function classify(input, taxonomy) {
  const strong = [input.productName, input.brand, input.model].filter(Boolean).join(' ').toLowerCase();
  const weak = [input.description, input.intendedUse, ...input.features, ...Object.values(input.specifications).map(String)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const declared = (input.category || '').toLowerCase().trim();

  const scores = taxonomy.categories.map((c) => {
    let score = 0;
    const matched = [];
    let declaredMatch = false;

    if (declared) {
      const names = [c.id, c.id.replace(/_/g, ' '), c.label.toLowerCase(), ...c.keywords];
      if (names.some((n) => n === declared || wordRe(n).test(declared))) {
        score += 8;
        declaredMatch = true;
        matched.push(`declared "${input.category}"`);
      }
    }
    for (const kw of c.keywords) {
      const re = wordRe(kw);
      if (re.test(strong)) {
        score += 2;
        matched.push(kw);
      } else if (re.test(weak)) {
        score += 1;
        matched.push(kw);
      }
    }
    if (input.listingCategory && c.indulgeCategories.includes(input.listingCategory)) score += 1;
    return { id: c.id, label: c.label, score, matched, declaredMatch };
  });

  scores.sort((a, b) => b.score - a.score);
  const [top, second] = scores;
  // A lone listing-category point is not enough to leave "other".
  const chosen = top.score >= 2 ? top : scores.find((s) => s.id === 'other');

  return {
    category: chosen.id,
    label: chosen.label,
    method: chosen.declaredMatch ? 'declared_category_plus_keywords' : chosen.id === 'other' ? 'fallback' : 'keywords',
    score: chosen.score,
    margin: chosen === top ? top.score - (second?.score || 0) : 0,
    matchedTerms: chosen.matched,
    declaredCategory: input.category || null,
    runnerUp: second && second.score > 0 && second.id !== chosen.id ? { category: second.id, score: second.score } : null,
  };
}
