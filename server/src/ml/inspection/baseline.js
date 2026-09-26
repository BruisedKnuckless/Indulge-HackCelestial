/**
 * Category baseline (generation rule 1) and conditional checks (rule 4).
 *
 * A category's template may extend another (laptop → electronics); the chain
 * is merged parent-first. A category without its own template uses its
 * taxonomy parent's. Mandatory parameters are always included unless their
 * own `when` condition is false (e.g. unit_count on a single item);
 * conditional ones only when their condition holds.
 */

export function resolveTemplate(categoryId, knowledge) {
  const { templates, taxonomy } = knowledge;
  let id = categoryId;
  if (!templates[id]) {
    const node = taxonomy.categories.find((c) => c.id === id);
    id = node?.parent && templates[node.parent] ? node.parent : 'other';
  }

  const chain = [];
  for (let cur = id; cur; cur = templates[cur]?.extends) {
    if (chain.includes(cur)) throw new Error(`Template inheritance loop at ${cur}`);
    chain.unshift(cur);
  }

  const merged = {
    category: categoryId,
    templateId: id,
    chain,
    versions: {},
    mandatory: [],
    conditional: [],
    exclude: new Set(),
    attributeDefaults: {},
    forbiddenTerms: new Set(),
    lotPolicy: null,
    overrides: {},
  };
  for (const tid of chain) {
    const t = templates[tid];
    merged.versions[tid] = t.templateVersion;
    for (const p of t.mandatoryParameters) if (!merged.mandatory.includes(p)) merged.mandatory.push(p);
    merged.conditional.push(...t.conditionalParameters);
    for (const p of t.excludeParameters || []) merged.exclude.add(p);
    Object.assign(merged.attributeDefaults, t.attributeDefaults);
    for (const w of t.forbiddenTerms) merged.forbiddenTerms.add(w.toLowerCase());
    if (t.lotPolicy) merged.lotPolicy = t.lotPolicy;
    for (const [id, o] of Object.entries(t.parameterOverrides || {})) {
      const cur = (merged.overrides[id] ||= { appendInstructions: [] });
      if (o.instructions) cur.instructions = o.instructions;
      cur.appendInstructions.push(...(o.appendInstructions || []));
    }
  }
  return merged;
}

/** Does an attribute condition hold? `{ transmission: 'automatic', hasAC: true }` */
export function conditionHolds(when, attributes) {
  if (!when) return true;
  return Object.entries(when).every(([k, v]) => {
    const actual = attributes[k];
    if (v === true) return Boolean(actual);
    if (v === false) return actual === false;
    return String(actual ?? '').toLowerCase() === String(v).toLowerCase();
  });
}

const describeWhen = (when, sources) =>
  Object.entries(when)
    .map(([k, v]) => `${k} = ${v}${sources[k] ? ` (${sources[k]})` : ''}`)
    .join(', ');

/** The template's parameters that apply, as candidate objects. */
export function selectBaseline(template, attributes, sources, library) {
  const out = new Map();
  const skipped = [];

  for (const id of template.mandatory) {
    if (template.exclude.has(id)) continue;
    const def = library[id];
    if (def.when && !conditionHolds(def.when, attributes)) {
      skipped.push({ id, reason: `not applicable: needs ${describeWhen(def.when, sources)}` });
      continue;
    }
    out.set(id, candidateFromLibrary(id, def, 'template', `Category baseline for ${template.category} (${template.chain.join(' → ')} template).`));
  }

  for (const entry of template.conditional) {
    const id = typeof entry === 'string' ? entry : entry.param;
    if (template.exclude.has(id) || out.has(id)) continue;
    const def = library[id];
    const when = (typeof entry === 'object' && entry.when) || def.when;
    if (!when) continue; // conditional without a condition would be mandatory — ignore
    if (conditionHolds(when, attributes)) {
      out.set(id, candidateFromLibrary(id, def, 'conditional', `Conditional check: ${describeWhen(when, sources)}.`));
    } else {
      skipped.push({ id, reason: `condition not met: ${describeWhen(when, sources)}` });
    }
  }
  // Category-specific wording for shared library checks.
  for (const [id, o] of Object.entries(template.overrides)) {
    const c = out.get(id);
    if (!c) continue;
    if (o.instructions) c.instructions = [...o.instructions];
    c.instructions.push(...o.appendInstructions);
  }
  return { candidates: out, skipped };
}

export function candidateFromLibrary(id, def, basis, reason) {
  return {
    id,
    category: def.category,
    title: def.title,
    description: def.description,
    instructions: [...def.instructions],
    expectedResult: def.expectedResult,
    verificationType: def.verificationType,
    weight: def.weight,
    required: def.required,
    requiresEvidenceOnFail: def.requiresEvidenceOnFail,
    qualified: Boolean(def.qualified),
    aliases: def.aliases || [],
    basis: [basis],
    reasons: [reason],
    fromAi: false,
  };
}
