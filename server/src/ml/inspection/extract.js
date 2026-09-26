import { productText } from './normalize.js';

/**
 * Attribute and claim extraction.
 *
 * Claims are what the provider asserts (RAM 16GB, 7 seats, battery health
 * 90%). They come from explicit `specifications` first and, only where a key
 * was not given, from patterns over the listing text (spec-rules.json). Every
 * claim becomes something the technician checks — the claimed value is never
 * treated as verified.
 *
 * Attributes (hasBattery, hasTouchscreen, transmission, material, …) decide
 * which conditional parameters apply. Precedence, lowest to highest:
 *   template default < text rule < brand/model profile < explicit claim
 * and each attribute records the source that set it, for explainability.
 */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function formatValue(rule, match) {
  if (!rule.valueFormat) return match[1] ?? match[0];
  return rule.valueFormat.replace(/\{(\d)\}/g, (_, i) => (match[Number(i)] ?? '').toString().toUpperCase().replace(/^(\d+)(GB|TB)$/, '$1$2'));
}

function normaliseValue(rule, value) {
  const v = String(value).trim();
  const lower = v.toLowerCase();
  return rule.normalise?.[lower] ?? v;
}

/** Find which canonical spec a provider-supplied key refers to. */
function canonicalKey(rawKey, specs) {
  const k = rawKey.toLowerCase().replace(/[_-]+/g, ' ').trim();
  for (const [key, rule] of Object.entries(specs)) {
    if (key === k.replace(/ /g, '_') || rule.aliases.includes(k)) return key;
  }
  return null;
}

export function extractClaims(input, category, specRules) {
  const specs = specRules.specs;
  const claims = [];
  const seen = new Set();

  // 1. Explicit specifications — the provider's own words, taken as given.
  for (const [rawKey, rawValue] of Object.entries(input.specifications)) {
    const key = canonicalKey(rawKey, specs);
    if (key) {
      const rule = specs[key];
      claims.push({ key, title: rule.title, value: String(rawValue).trim(), normalized: normaliseValue(rule, rawValue), rawKey, source: 'declared_specification' });
      seen.add(key);
    } else {
      claims.push({ key: `custom_${slug(rawKey)}`, title: rawKey.trim(), value: String(rawValue), rawKey, source: 'declared_specification', custom: true });
    }
  }

  // An explicit quantity outranks one parsed from the name.
  if (input.quantity && !seen.has('quantity')) {
    claims.push({ key: 'quantity', title: 'Quantity', value: String(input.quantity), source: 'declared_quantity' });
    seen.add('quantity');
  }

  // 2. The same claims written only in the listing text.
  const fullText = productText(input);
  for (const [key, rule] of Object.entries(specs)) {
    if (seen.has(key)) continue;
    if (rule.onlyCategories && !rule.onlyCategories.includes(category)) continue;
    const text = rule.patternFields ? rule.patternFields.map((f) => input[f] || '').join(' ') : fullText;

    let found = null;
    for (const p of rule.patterns || []) {
      const m = new RegExp(p, 'i').exec(text);
      if (m) {
        const value = formatValue(rule, m);
        found = { value, normalized: normaliseValue(rule, value), matched: m[0].trim() };
        break;
      }
    }
    if (!found && rule.barePattern && rule.barePatternCategories?.includes(category)) {
      const m = new RegExp(rule.barePattern, 'i').exec(text);
      if (m) {
        const num = m[1] || m[3];
        const unit = (m[2] || m[4]).toUpperCase();
        found = { value: `${num}${unit}`, matched: m[0].trim() };
      }
    }
    if (found) {
      claims.push({ key, title: rule.title, value: found.value, normalized: found.normalized, source: 'listing_text', matchedText: found.matched });
      seen.add(key);
    }
  }

  return claims;
}

export function extractAttributes({ input, claims, defaults, compiledRules, specRules }) {
  const attributes = {};
  const sources = {};
  const set = (k, v, source) => {
    attributes[k] = v;
    sources[k] = source;
  };

  for (const [k, v] of Object.entries(defaults || {})) set(k, v, 'template default');

  const text = productText(input);
  for (const [attr, { positive, negative }] of Object.entries(compiledRules)) {
    const neg = negative.find((re) => re.test(text));
    if (neg) {
      set(attr, false, `text: "${text.match(neg)[0]}"`);
      continue;
    }
    const pos = positive.find((re) => re.test(text));
    if (pos) set(attr, true, `text: "${text.match(pos)[0]}"`);
  }

  applyClaimAttributes(attributes, sources, claims, specRules);
  return { attributes, sources };
}

/** Claims outrank everything else; also applied again after profiles. */
export function applyClaimAttributes(attributes, sources, claims, specRules) {
  for (const c of claims) {
    const rule = specRules.specs[c.key];
    if (!rule) continue;
    for (const [k, v] of Object.entries(rule.attribute || {})) {
      attributes[k] = v;
      sources[k] = `claim: ${c.title}`;
    }
    if (rule.attributeFromValue) {
      const k = rule.attributeFromValue;
      const raw = String(c.normalized ?? c.value).toLowerCase();
      let v = c.value;
      if (/^(yes|true|y)$/.test(raw)) v = true;
      else if (/^(no|false|n|none)$/.test(raw)) v = false;
      else if (k === 'quantity') v = Number(String(c.value).replace(/[^\d]/g, '')) || 1;
      else v = raw;
      attributes[k] = v;
      sources[k] = `claim: ${c.title} = ${c.value}`;
    }
  }
  const qty = Number(attributes.quantity) || 1;
  attributes.quantity = qty;
  attributes.isLot = qty > 1;
  sources.isLot = sources.quantity ? `from quantity (${qty})` : 'single item';
}
