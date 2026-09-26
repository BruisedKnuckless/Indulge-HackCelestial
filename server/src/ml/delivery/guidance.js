/**
 * Turns a predicted handling plan into what people read: labels, the reasons
 * behind it, instructions for each side, and the condition checklists the
 * handlers work through. Templated from the plan — the model decides *what*
 * handling is needed; this file only words it.
 */

export const LABELS = {
  tier: {
    self_handled: 'Self-handled',
    standard_movers: 'Standard movers',
    professional_handlers: 'Professional handlers',
  },
  fragility: { low: 'Low', medium: 'Medium', high: 'High' },
  checkLevel: {
    count_only: 'Count check',
    visual: 'Visual inspection',
    itemised_photo: 'Itemised check with photos',
    itemised_photo_function_test: 'Itemised check, photos and function test',
  },
  packaging: {
    none: 'No special packaging',
    stack_and_wrap: 'Stacked and stretch-wrapped',
    crates: 'Padded crates',
    flight_cases: 'Flight cases',
  },
  vehicle: {
    none: 'No transport vehicle',
    two_wheeler: 'Two-wheeler',
    tempo: 'Tempo / small goods carrier',
    truck_14ft: '14 ft truck',
    truck_20ft: '20 ft truck',
  },
};

/** Checkpoints at which condition is recorded, in order. */
export const CHECKPOINTS = [
  { key: 'dispatch', label: 'Before delivery', who: 'lister', where: 'at the lister, before loading' },
  { key: 'delivery', label: 'After delivery', who: 'seeker', where: 'at the venue, on arrival' },
  { key: 'return', label: 'On return', who: 'lister', where: 'back at the lister, after the event' },
];

/** Checklist items per checkpoint for a plan. Keys are what a recorded check must use. */
export function checklistFor(plan, { quantity, electrical, selfPropelled }) {
  const items = [{ key: 'count', label: `All ${quantity} unit${quantity === 1 ? '' : 's'} counted and matching the booking` }];

  if (selfPropelled) {
    items.push(
      { key: 'body', label: 'Body, glass and tyres photographed — existing dents and scratches noted' },
      { key: 'odometer_fuel', label: 'Odometer reading and fuel level recorded' },
      { key: 'function', label: 'Engine, AC, lights and doors working' },
      { key: 'documents', label: 'Registration, insurance and permit papers on board' }
    );
    return items;
  }

  if (plan.checkLevel !== 'count_only') {
    items.push({ key: 'visible_damage', label: 'No scratches, dents, cracks or stains' });
  }
  if (plan.checkLevel === 'itemised_photo' || plan.checkLevel === 'itemised_photo_function_test') {
    items.push({ key: 'photos', label: 'Photos taken of each unit (or each stacked lot) from two sides' });
  }
  if (plan.checkLevel === 'itemised_photo_function_test' || electrical) {
    items.push(
      { key: 'function', label: 'Powered on and function-tested (sound, picture or output checked)' },
      { key: 'accessories', label: 'Cables, remotes, stands and spares present' }
    );
  }
  if (plan.packaging !== 'none') {
    items.push({ key: 'packaging', label: `${LABELS.packaging[plan.packaging]} — intact and correctly labelled` });
  }
  return items;
}

/** Instructions for each side of the booking. */
export function instructionsFor(plan, { quantity, title, selfPropelled }) {
  const crewText = `${plan.crew}-person ${plan.tier === 'professional_handlers' ? 'professional handling crew' : 'moving crew'}`;
  const lister = [];
  const seeker = [];

  if (selfPropelled) {
    lister.push(
      'Send the vehicle with its assigned driver; the driver is responsible for it throughout the hire.',
      'Hand over with the before-delivery check: body photos, odometer and fuel, documents.'
    );
    seeker.push(
      'Confirm the pickup points and timings with the driver a day ahead.',
      'Check the vehicle with the driver on arrival and record the after-delivery check.'
    );
    return { lister, seeker };
  }

  if (plan.tier === 'self_handled') {
    lister.push(`Keep the ${quantity} unit${quantity === 1 ? '' : 's'} ready for collection, cleaned and counted.`);
    seeker.push('Small enough to collect yourself — no movers needed.');
  } else {
    lister.push(
      `A ${crewText} with a ${LABELS.vehicle[plan.vehicle].toLowerCase()} is recommended to move ${quantity} × ${title}.`,
      'Have the full quantity counted, cleaned and staged near the loading point before the crew arrives.'
    );
    seeker.push(
      `Expect a ${crewText} with a ${LABELS.vehicle[plan.vehicle].toLowerCase()}.`,
      plan.vehicle === 'truck_14ft' || plan.vehicle === 'truck_20ft'
        ? 'Arrange truck access, a loading bay or clear drop point, and venue permission for the unloading window.'
        : 'Keep a clear path and a drop point ready at the venue for unloading.'
    );
  }

  if (plan.packaging === 'flight_cases') {
    lister.push('Pack every unit in its flight case; label each case with the booking reference.');
    seeker.push('Keep the flight cases on site — the items go back in them for the return.');
  } else if (plan.packaging === 'crates') {
    lister.push('Pack in padded crates, one layer per crate, and label each crate.');
    seeker.push('Keep the crates for the return trip.');
  } else if (plan.packaging === 'stack_and_wrap') {
    lister.push('Stack and stretch-wrap in counted lots so the count can be verified quickly.');
  }

  if (plan.fragility === 'high') {
    lister.push('Fragile: brief the crew; no stacking of cases more than two high.');
    seeker.push('Fragile: have someone on site to receive it and keep it away from foot traffic until set up.');
  }
  if (plan.checkLevel === 'itemised_photo_function_test') {
    seeker.push('Power on and test each unit with the crew before signing the after-delivery check.');
  }
  seeker.push('Record the after-delivery check before the crew leaves — issues found later are harder to attribute.');
  lister.push('Record the before-delivery check with the crew before loading.');

  return { lister, seeker };
}

const DISPLAY = { pa: 'PA system', array: 'line array', led: 'LED', tv: 'TV', dj: 'DJ', mic: 'mic', kva: 'kVA' };
const show = (words) => [...new Set(words.map((w) => DISPLAY[w] || w))];

/** Plain reasons for the plan, from the listing's own inputs. */
export function driversFor({ quantity, unitPrice, words, plan }) {
  const out = [];
  if (quantity >= 50) out.push(`${quantity} units — bulk volume to move`);
  else if (quantity >= 10) out.push(`${quantity} units`);
  else out.push(`${quantity} unit${quantity === 1 ? '' : 's'} only`);

  const fragileWords = words.filter((w) =>
    ['led', 'screen', 'projector', 'speaker', 'pa', 'glass', 'crystal', 'chandelier', 'mirror', 'fragile', 'delicate', 'crockery', 'china', 'tv', 'mixer', 'console', 'mic', 'microphone', 'array', 'subwoofer', 'video', 'display'].includes(w)
  );
  if (fragileWords.length) out.push(`Fragile or electronic: ${show(fragileWords).slice(0, 4).join(', ')}`);
  const heavyWords = words.filter((w) => ['stage', 'platform', 'truss', 'generator', 'genset', 'oven', 'fridge', 'freezer', 'sofa', 'tent'].includes(w));
  if (heavyWords.length) out.push(`Heavy or bulky: ${show(heavyWords).slice(0, 3).join(', ')}`);
  const finishWords = words.filter((w) => ['chiavari', 'tiffany', 'gold', 'antique', 'premium'].includes(w));
  if (finishWords.length) out.push(`Finish to protect: ${show(finishWords).slice(0, 3).join(', ')}`);

  const value = quantity * unitPrice;
  if (value >= 50000) out.push(`High hire value — ₹${Math.round(value).toLocaleString('en-IN')} at listed price`);
  if (plan.crew >= 4) out.push(`${plan.crew} people needed to move it safely`);
  return out;
}
