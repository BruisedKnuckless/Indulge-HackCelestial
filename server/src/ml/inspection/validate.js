import { unsafeReason } from './knowledge.js';
import { productText } from './normalize.js';
import { tokens, normName, jaccard } from './text.js';

/**
 * Validation — generation rules 5–10.
 *   5  duplicate / overlapping checks are merged (aliases + title similarity);
 *   6  every parameter has a verification method;
 *   7  every parameter has an expected result;
 *   8  physical/cosmetic/safety/identity checks require evidence on failure;
 *   9  AI checks that mention terms irrelevant to the category are rejected;
 *  10  nothing is marked verified — every parameter is pending_inspection.
 * Plus safety: unsafe instructions are removed wherever they come from, and
 * specialist checks are flagged for a qualified technician.
 */

const norm = normName;

function conceptKeys(c) {
  const keys = new Set([norm(c.id.replace(/^(spec|ai)_/, '').replace(/_/g, ' ')), norm(c.title), ...(c.aliases || []).map(norm)]);
  keys.delete('');
  return keys;
}

/** The existing candidate a new check duplicates, or null. */
export function findDuplicate(candidate, pool) {
  const keys = conceptKeys(candidate);
  const titleTokens = tokens(candidate.title);
  let best = null;
  let bestScore = 0;
  for (const other of pool.values()) {
    if (other === candidate) continue;
    // 1. Same name or a known alias of it — the strongest signal.
    const otherKeys = conceptKeys(other);
    if ([...keys].some((k) => otherKeys.has(k))) return other;
    // 2. One title contains the other ("Automatic Transmission Shift Test" ⊇
    //    "Automatic Transmission"), or 3. the titles mostly overlap.
    const otherTokens = tokens(other.title);
    const small = titleTokens.length <= otherTokens.length ? titleTokens : otherTokens;
    const large = new Set(small === titleTokens ? otherTokens : titleTokens);
    const contained = small.length >= 2 && small.every((t) => large.has(t));
    const score = contained ? 0.9 : jaccard(titleTokens, otherTokens);
    if (score >= 0.75 && score > bestScore) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}

function mergeInto(target, source, log) {
  const seen = new Set(target.instructions.map((i) => i.toLowerCase()));
  for (const ins of source.instructions) {
    if (!seen.has(ins.toLowerCase())) {
      target.instructions.push(ins);
      seen.add(ins.toLowerCase());
    }
  }
  target.weight = Math.max(target.weight, source.weight);
  target.aliases = [...new Set([...(target.aliases || []), source.title.toLowerCase(), ...(source.aliases || [])])];
  for (const b of source.basis) if (!target.basis.includes(b)) target.basis.push(b);
  target.reasons.push(...source.reasons);
  if (source.fromAi) target.mergedAi = true;
  if (!target.claimedValue && source.claimedValue) {
    target.claimedValue = source.claimedValue;
    target.verificationInstruction = source.verificationInstruction;
  }
  log.push({ kept: target.id, merged: source.title, source: source.fromAi ? 'ai' : source.basis[0] });
}

/** Rule 5 across the deterministic layers (e.g. a profile check that a template already covers). */
/**
 * Rule 5 for the deterministic layers. Library parameters are curated to be
 * distinct, and a claim check is deliberately separate from the functional
 * test of the same feature, so only checks defined outside the library
 * (brand-profile additions) are matched — against everything else, keeping
 * the library entry when they overlap.
 */
export function dedupeCandidates(candidates, log) {
  for (const c of [...candidates.values()]) {
    if (!c.inline || !candidates.has(c.id)) continue;
    const others = new Map([...candidates].filter(([id, o]) => id !== c.id && !o.inline));
    const dup = findDuplicate(c, others);
    if (dup) {
      mergeInto(dup, c, log);
      candidates.delete(c.id);
    }
  }
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);

/**
 * Fold AI suggestions into the candidate set. The AI can only add or refine;
 * it can never remove a baseline check. Each suggestion is filtered for
 * safety, relevance and unsupported claims, then merged or added.
 */
export function mergeAiParameters({ aiParams, candidates, template, knowledge, input, log }) {
  const rejected = [];
  const removedInstructions = [];
  const text = productText(input).toLowerCase().replace(/\s+/g, '');
  const maxWeight = knowledge.priorities.rules.aiMaxWeight;
  const forbidden = [...template.forbiddenTerms];

  for (const p of aiParams) {
    const scope = `${p.title} ${p.description}`.toLowerCase();
    const irrelevant = forbidden.find((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(scope));
    if (irrelevant) {
      rejected.push({ title: p.title, reason: `irrelevant to ${template.category}: mentions "${irrelevant}"` });
      continue;
    }

    const instructions = [];
    for (const ins of p.instructions) {
      const why = unsafeReason(ins, knowledge.compiled.forbidden);
      if (why) removedInstructions.push({ parameter: p.title, instruction: ins, reason: why, source: 'ai' });
      else instructions.push(ins.trim());
    }
    if (!instructions.length) {
      rejected.push({ title: p.title, reason: 'every instruction failed the safety rules' });
      continue;
    }

    // A claimed value must come from the provider, not the model.
    let claimedValue = p.claimedValue?.trim() || null;
    if (claimedValue && !text.includes(claimedValue.toLowerCase().replace(/\s+/g, ''))) {
      log.push({ note: `dropped unsupported claimedValue "${claimedValue}" on AI check "${p.title}"` });
      claimedValue = null;
    }

    const candidate = {
      id: `ai_${slug(p.title)}`,
      category: p.category,
      title: p.title.trim(),
      description: p.description.trim(),
      instructions,
      expectedResult: p.expectedResult.trim(),
      verificationType: p.verificationType,
      weight: Math.min(maxWeight, Math.max(1, Math.round(p.weight || knowledge.priorities.rules.aiDefaultWeight))),
      requiresEvidenceOnFail: p.requiresEvidenceOnFail,
      claimedValue: claimedValue || undefined,
      verificationInstruction: claimedValue ? instructions[0] : undefined,
      qualified: false,
      aliases: [],
      basis: ['ai'],
      reasons: [`AI (${p.basedOnImage ? 'from listing images' : 'from listing details'}): ${p.reason.trim()}`],
      fromAi: true,
      basedOnImage: p.basedOnImage,
    };

    const dup = findDuplicate(candidate, candidates);
    if (dup) {
      mergeInto(dup, candidate, log);
      continue;
    }
    let id = candidate.id;
    for (let n = 2; candidates.has(id); n++) id = `${candidate.id}_${n}`;
    candidate.id = id;
    candidates.set(id, candidate);
  }
  return { rejected, removedInstructions };
}

const PRIORITY_BY_WEIGHT = { 5: 'critical', 4: 'high', 3: 'medium', 2: 'low', 1: 'minimal' };
const SECTION_ORDER = ['identity', 'safety', 'physical', 'functional', 'performance', 'specification', 'accessories', 'documentation', 'cosmetic', 'other'];

/** Rules 6–10 and final shaping of every parameter. */
export function finalizeParameters({ candidates, knowledge, template, attributes, removedInstructions }) {
  const { rules } = knowledge.priorities;
  const qty = attributes.quantity || 1;
  const lot = template.lotPolicy;
  const sampling = lot && qty > lot.sampleAbove;

  const out = [];
  for (const c of candidates.values()) {
    const instructions = [];
    const seen = new Set();
    for (const ins of c.instructions) {
      const why = unsafeReason(ins, knowledge.compiled.forbidden);
      if (why) {
        removedInstructions.push({ parameter: c.title, instruction: ins, reason: why, source: c.basis[0] });
        continue;
      }
      if (!seen.has(ins.toLowerCase())) {
        instructions.push(ins);
        seen.add(ins.toLowerCase());
      }
    }
    if (!instructions.length) continue;

    const scope = `${c.title} ${c.description} ${instructions.join(' ')}`;
    const qualified = c.qualified || knowledge.compiled.qualified.some(({ re }) => re.test(scope));
    if (qualified && !instructions.some((i) => /qualified/i.test(i))) {
      instructions.push('This check must be carried out or signed off by a qualified technician.');
    }

    const weight = Math.min(5, Math.max(1, Math.round(c.weight)));
    const param = {
      id: c.id,
      category: c.category,
      title: c.title,
      description: c.description,
      instructions,
      expectedResult: c.expectedResult,
      verificationType: c.verificationType,
      required: c.required ?? weight >= rules.requiredAtOrAbove,
      requiresEvidenceOnFail: c.requiresEvidenceOnFail ?? rules.evidenceOnFailCategories.includes(c.category),
      weight,
      priority: PRIORITY_BY_WEIGHT[weight],
      requiresQualifiedInspector: qualified,
      appliesTo: c.id === 'unit_count' ? 'lot' : sampling && lot.sampledCategories.includes(c.category) ? 'sample' : 'every_unit',
      generationSource: c.fromAi ? 'ai_generated' : c.mergedAi ? 'baseline_plus_ai' : 'baseline',
      basis: [...new Set(c.basis)],
      reason: c.reasons.join(' '),
      status: 'pending_inspection',
    };
    if (c.claimedValue !== undefined) param.claimedValue = String(c.claimedValue);
    if (c.verificationInstruction) param.verificationInstruction = c.verificationInstruction;
    out.push(param);
  }

  out.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.category) - SECTION_ORDER.indexOf(b.category) ||
      b.weight - a.weight ||
      a.title.localeCompare(b.title)
  );
  return { parameters: out, sampling: sampling ? samplingPlan(qty, lot) : null };
}

function samplingPlan(qty, lot) {
  const sampleSize = Math.min(qty, Math.max(lot.minimumSample, Math.ceil(qty * lot.sampleFraction)));
  return {
    quantity: qty,
    countAllUnits: lot.countAll,
    sampleSize,
    rule: `Count all ${qty} units. Checks marked "sample" are done in full on ${sampleSize} randomly chosen units (max of ${lot.minimumSample} or ${Math.round(lot.sampleFraction * 100)}%), with every other unit given a quick visual screen; any failure in the sample widens the check to the whole lot.`,
  };
}
