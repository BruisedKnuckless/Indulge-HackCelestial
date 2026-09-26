import { candidateFromLibrary } from './baseline.js';

/**
 * Deterministic product-specific layers:
 *   - brand/model profiles (brand-profiles.json) — rule 2;
 *   - provider claims → verification parameters (spec-rules.json) — rule 3.
 */

const escapeText = (input) => [input.productName, input.brand, input.model].filter(Boolean).join(' ');

/** Profiles whose match conditions hold for this product. */
export function matchProfiles(input, category, profiles) {
  const text = escapeText(input);
  return profiles.profiles.filter((p) => {
    const m = p.match || {};
    if (m.categories && !m.categories.includes(category)) return false;
    if (m.text && !new RegExp(m.text, 'i').test(text)) return false;
    if (m.notText && new RegExp(m.notText, 'i').test(text)) return false;
    return true;
  });
}

export function applyProfileAttributes(matched, attributes, sources) {
  for (const p of matched) {
    for (const [k, v] of Object.entries(p.attributes || {})) {
      attributes[k] = v;
      sources[k] = `profile: ${p.id}`;
    }
  }
}

export function applyProfileParameters(matched, candidates, library) {
  for (const p of matched) {
    const reason = `Product-specific (${p.id}): ${p.reason}`;
    for (const id of p.include || []) {
      if (!candidates.has(id)) candidates.set(id, candidateFromLibrary(id, library[id], 'brand_profile', reason));
    }
    for (const def of p.parameters || []) {
      if (candidates.has(def.id)) continue;
      const c = candidateFromLibrary(def.id, def, 'brand_profile', reason);
      c.inline = true; // defined outside the library — checked for overlap
      candidates.set(def.id, c);
    }
    for (const [id, o] of Object.entries(p.override || {})) {
      const c = candidates.get(id);
      if (!c) continue; // only refines checks that apply to this product
      if (o.instructions) c.instructions = [...o.instructions];
      if (o.appendInstructions) c.instructions.push(...o.appendInstructions);
      if (!c.basis.includes('brand_profile')) c.basis.push('brand_profile');
      c.reasons.push(reason);
    }
  }
}

function whereFor(category, specRules) {
  return specRules.whereToLook[category] || specRules.whereToLook.default;
}

/**
 * Every claim becomes a claim-vs-actual check: the technician records what
 * they observe against `claimedValue`. Claims that belong to an existing
 * parameter (battery health, odometer, seating) are attached to it rather
 * than duplicated.
 */
export function applyClaims({ claims, candidates, library, specRules, priorities, category, declaredCondition }) {
  const where = whereFor(category, specRules);
  for (const c of claims) {
    const rule = specRules.specs[c.key];
    // A single item has nothing to count.
    if (c.key === 'quantity' && Number(String(c.value).replace(/[^\d]/g, '')) <= 1) continue;
    const origin = c.source === 'listing_text' ? `stated in the listing ("${c.matchedText}")` : 'declared by the provider';
    const reason = `Provider claim: ${c.title} = ${c.value}, ${origin}.`;

    if (!rule) {
      // A specification the rules don't know — still verified, generically.
      const id = `spec_${c.key}`.slice(0, 60);
      candidates.set(id, {
        id,
        category: 'specification',
        title: c.title,
        description: `Verify the provider's declared ${c.title}.`,
        instructions: [`Confirm the ${c.title} from the item itself, its label or its documentation`, 'Record what you observe'],
        verificationInstruction: `Confirm the ${c.title} from the item itself, its label or its documentation.`,
        expectedResult: `Matches the declared value: ${c.value}`,
        verificationType: 'comparison',
        weight: 3,
        claimedValue: String(c.value),
        qualified: false,
        aliases: [c.title.toLowerCase()],
        basis: ['claim'],
        reasons: [reason],
        fromAi: false,
      });
      continue;
    }

    const instruction = rule.instruction.replace('{where}', where).replace('{value}', c.value);
    if (rule.mergeInto) {
      let target = candidates.get(rule.mergeInto);
      if (!target) {
        target = candidateFromLibrary(rule.mergeInto, library[rule.mergeInto], 'claim', reason);
        candidates.set(rule.mergeInto, target);
      } else {
        target.basis.push('claim');
        target.reasons.push(reason);
      }
      target.claimedValue = String(c.value);
      target.verificationInstruction = instruction;
      target.expectedResult = `${target.expectedResult} Declared: ${c.value}.`;
      target.weight = Math.max(target.weight, priorities.rules.specClaimWeight);
      continue;
    }

    const id = `spec_${c.key}`;
    candidates.set(id, {
      id,
      category: 'specification',
      title: rule.title,
      description: `Verify the provider's declared ${rule.title.toLowerCase()}.`,
      instructions: [instruction, 'Record the observed value next to the claimed value'],
      verificationInstruction: instruction,
      expectedResult: `Matches the declared value: ${c.value}`,
      verificationType: rule.verificationType,
      weight: priorities.rules.specClaimWeight,
      claimedValue: String(c.value),
      qualified: false,
      aliases: [rule.title.toLowerCase(), ...rule.aliases],
      basis: ['claim'],
      reasons: [reason],
      fromAi: false,
    });
  }

  // The declared condition grade is itself a claim.
  if (declaredCondition) {
    const target = candidates.get('declared_condition');
    if (target) {
      target.claimedValue = declaredCondition;
      target.verificationInstruction = 'Grade the observed condition and compare it with the declared grade.';
      target.reasons.push(`Provider declared condition: ${declaredCondition}.`);
      if (!target.basis.includes('claim')) target.basis.push('claim');
    }
  }
}
