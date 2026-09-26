import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PARAMETER_CATEGORIES, VERIFICATION_TYPES } from './schema.js';
import { normName } from './text.js';

/**
 * Loads the inspection knowledge base — taxonomy, parameter library, category
 * templates, claim rules, attribute rules, brand/model profiles, safety rules
 * and priorities — once, and checks that it is internally consistent. A broken
 * reference (a template naming a parameter that doesn't exist, an unsafe
 * baseline instruction) throws at load time rather than quietly producing a
 * thinner protocol.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (...p) => JSON.parse(readFileSync(path.join(HERE, ...p), 'utf8'));

let cache = null;

export function loadKnowledge() {
  if (cache) return cache;

  const taxonomy = readJson('config', 'taxonomy.json');
  const library = readJson('config', 'parameters.json');
  const specRules = readJson('config', 'spec-rules.json');
  const attributeRules = readJson('config', 'attribute-rules.json');
  const profiles = readJson('config', 'brand-profiles.json');
  const safety = readJson('config', 'safety.json');
  const priorities = readJson('config', 'priorities.json');

  const templates = {};
  for (const file of readdirSync(path.join(HERE, 'templates')).filter((f) => f.endsWith('.json'))) {
    const t = readJson('templates', file);
    templates[t.category] = t;
  }

  const compiled = {
    forbidden: compileForbidden(safety.forbiddenInstructions),
    qualified: safety.qualifiedTriggers.map((r) => ({ re: new RegExp(r.pattern, 'i'), reason: r.reason })),
    attributes: Object.fromEntries(
      Object.entries(attributeRules.attributes).map(([k, v]) => [
        k,
        { positive: v.positive.map((p) => new RegExp(p, 'i')), negative: v.negative.map((p) => new RegExp(p, 'i')) },
      ])
    ),
  };

  const knowledge = { taxonomy, library, specRules, attributeRules, profiles, safety, priorities, templates, compiled };
  checkIntegrity(knowledge);

  // One version string covering every template, so a protocol records exactly
  // which set of templates it came from.
  const templateSig = Object.keys(templates)
    .sort()
    .map((k) => `${k}@${templates[k].templateVersion}`)
    .join(',');
  knowledge.templateVersion = `templates-${createHash('sha1').update(templateSig).digest('hex').slice(0, 10)}`;
  knowledge.versions = {
    taxonomy: taxonomy.version,
    parameters: library.version,
    specRules: specRules.version,
    attributeRules: attributeRules.version,
    brandProfiles: profiles.version,
    safety: safety.version,
    priorities: priorities.version,
  };

  cache = knowledge;
  return knowledge;
}

/** Throws with every problem found, not just the first. */
function checkIntegrity(k) {
  const problems = [];
  const params = k.library.parameters;
  const has = (id) => Object.prototype.hasOwnProperty.call(params, id);

  for (const [id, p] of Object.entries(params)) {
    if (!/^[a-z0-9_]+$/.test(id)) problems.push(`parameter id "${id}" must be snake_case`);
    if (!PARAMETER_CATEGORIES.includes(p.category)) problems.push(`${id}: unknown category "${p.category}"`);
    if (!VERIFICATION_TYPES.includes(p.verificationType)) problems.push(`${id}: unknown verificationType "${p.verificationType}"`);
    if (!p.instructions?.length) problems.push(`${id}: no instructions`);
    if (!p.expectedResult) problems.push(`${id}: no expectedResult`);
    if (!(p.weight >= 1 && p.weight <= 5)) problems.push(`${id}: weight must be 1–5`);
    for (const ins of p.instructions || []) {
      const hit = unsafeReason(ins, compileForbidden(k.safety.forbiddenInstructions));
      if (hit) problems.push(`${id}: baseline instruction fails safety rule (${hit}): "${ins}"`);
    }
  }

  // An alias that names two different checks would make AI merges ambiguous.
  const aliasOwner = new Map();
  for (const [id, p] of Object.entries(params)) {
    for (const a of [id.replace(/_/g, ' '), p.title, ...(p.aliases || [])].map(normName).filter(Boolean)) {
      const owner = aliasOwner.get(a);
      if (owner && owner !== id) problems.push(`alias "${a}" is used by both ${owner} and ${id}`);
      else aliasOwner.set(a, id);
    }
  }

  const categoryIds = new Set(k.taxonomy.categories.map((c) => c.id));
  for (const [cid, t] of Object.entries(k.templates)) {
    if (!categoryIds.has(cid)) problems.push(`template "${cid}" has no taxonomy entry`);
    if (t.extends && !k.templates[t.extends]) problems.push(`template "${cid}" extends missing "${t.extends}"`);
    for (const id of t.mandatoryParameters) if (!has(id)) problems.push(`template ${cid}: unknown parameter "${id}"`);
    for (const c of t.conditionalParameters) {
      const id = typeof c === 'string' ? c : c.param;
      if (!has(id)) problems.push(`template ${cid}: unknown conditional parameter "${id}"`);
    }
    for (const [id, o] of Object.entries(t.parameterOverrides || {})) {
      if (!has(id)) problems.push(`template ${cid}: override of unknown parameter "${id}"`);
      for (const ins of [...(o.instructions || []), ...(o.appendInstructions || [])]) {
        const hit = unsafeReason(ins, compileForbidden(k.safety.forbiddenInstructions));
        if (hit) problems.push(`template ${cid}/override ${id}: instruction fails safety rule (${hit})`);
      }
    }
  }
  for (const c of k.taxonomy.categories) {
    if (!k.templates[c.id] && !(c.parent && k.templates[c.parent])) {
      problems.push(`category "${c.id}" has no template and no parent template`);
    }
  }
  for (const [key, rule] of Object.entries(k.specRules.specs)) {
    if (rule.mergeInto && !has(rule.mergeInto)) problems.push(`spec "${key}": mergeInto unknown parameter "${rule.mergeInto}"`);
    for (const p of rule.patterns || []) {
      try { new RegExp(p, 'i'); } catch (e) { problems.push(`spec "${key}": bad pattern ${p}: ${e.message}`); }
    }
  }
  for (const pr of k.profiles.profiles) {
    for (const id of pr.include || []) if (!has(id)) problems.push(`profile ${pr.id}: include unknown "${id}"`);
    for (const id of Object.keys(pr.override || {})) if (!has(id)) problems.push(`profile ${pr.id}: override unknown "${id}"`);
    for (const [id, o] of Object.entries(pr.override || {})) {
      for (const ins of [...(o.instructions || []), ...(o.appendInstructions || [])]) {
        const hit = unsafeReason(ins, compileForbidden(k.safety.forbiddenInstructions));
        if (hit) problems.push(`profile ${pr.id}/override ${id}: instruction fails safety rule (${hit}): "${ins}"`);
      }
    }
    for (const p of pr.parameters || []) {
      if (has(p.id)) problems.push(`profile ${pr.id}: inline parameter "${p.id}" collides with the library`);
      for (const ins of p.instructions) {
        const hit = unsafeReason(ins, compileForbidden(k.safety.forbiddenInstructions));
        if (hit) problems.push(`profile ${pr.id}/${p.id}: instruction fails safety rule (${hit})`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`Inspection knowledge base is inconsistent:\n  - ${problems.join('\n  - ')}`);
  }
}

export function compileForbidden(rules) {
  return rules.map((r) => ({
    re: new RegExp(r.pattern, 'i'),
    unless: r.unless ? new RegExp(r.unless, 'i') : null,
    reason: r.reason,
  }));
}

const NEGATION = /\b(do not|don't|never|without|no need to|avoid|must not|not to)\b/i;

/**
 * Reason an instruction is unsafe, or null. A match that is itself negated
 * ("Do not open the casing", "never a flame") is a warning, not an
 * instruction, and is allowed.
 */
export function unsafeReason(instruction, forbidden) {
  for (const { re, unless, reason } of forbidden) {
    const m = re.exec(instruction);
    if (!m) continue;
    const window = instruction.slice(Math.max(0, m.index - 40), m.index + m[0].length);
    if (NEGATION.test(window)) continue;
    // e.g. "Open Settings > Battery" is navigation on a screen, not disassembly.
    if (unless && unless.test(instruction)) continue;
    return reason;
  }
  return null;
}
