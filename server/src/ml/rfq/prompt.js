/**
 * The one prompt contract for the RFQ intake model.
 *
 * build-dataset.js writes every training pair and benchmark sample with
 * formatInstruction(), and chain.js sends exactly the same instruction at
 * inference, so the aligned model is always asked the way it was aligned.
 * Change the wording → bump PROMPT_VERSION → rebuild the dataset and re-align.
 */

export const PROMPT_VERSION = 'rfq-intake-1.0';

export const OUTPUT_KEYS = [
  'category',
  'title',
  'quantity',
  'unit',
  'minCapacity',
  'budget',
  'city',
  'dateText',
  'startTime',
  'endTime',
  'urgency',
  'notes',
];

export const SYSTEM_PROMPT = `You turn a hospitality business's request into JSON for the Indulge B2B rental marketplace.
Reply with one JSON object and nothing else, with exactly these keys: ${OUTPUT_KEYS.join(', ')}.
- category: one of banquet_space, parking, vehicle, kitchen_capacity, furniture, av_equipment, staff, other. Use the first thing asked for.
- title: a short title, e.g. "250 banquet chairs".
- quantity: how many of the first item (kitchen: hours), as a number, else null.
- unit: unit, hour (kitchen time) or slot (parking).
- minCapacity: guests for a venue or seats for a vehicle, else null.
- budget: rupees as a plain number (40k = 40000, 1.5 lakh = 150000), else null.
- city: the city named, else null.
- dateText: the date words exactly as written, e.g. "12 Oct" or "this Saturday", else null. Never compute a date.
- startTime, endTime: 24-hour HH:MM, else null.
- urgency: high, medium or low.
- notes: any other details, else null.
Use null for anything not stated. Never invent a value.`;

const INSTRUCTION = 'Extract the Indulge RFQ fields from this request as JSON.';

export function formatInstruction(text) {
  return `${INSTRUCTION}\nRequest: ${String(text).trim()}`;
}

/** Two worked examples sent ahead of the request (few-shot). */
export const FEW_SHOT = [
  {
    text: 'Need 250 banquet chairs with covers in Navi Mumbai on 12 Oct, 6pm-11pm. Budget 40k. Urgent',
    output: {
      category: 'furniture',
      title: '250 banquet chairs',
      quantity: 250,
      unit: 'unit',
      minCapacity: null,
      budget: 40000,
      city: 'Navi Mumbai',
      dateText: '12 Oct',
      startTime: '18:00',
      endTime: '23:00',
      urgency: 'high',
      notes: 'with covers',
    },
  },
  {
    text: 'looking for a banquet hall for 300 guests in Pune this Saturday, budget around 1.5 lakh',
    output: {
      category: 'banquet_space',
      title: 'Banquet hall for 300 guests',
      quantity: 1,
      unit: 'unit',
      minCapacity: 300,
      budget: 150000,
      city: 'Pune',
      dateText: 'this Saturday',
      startTime: null,
      endTime: null,
      urgency: 'medium',
      notes: null,
    },
  },
];
