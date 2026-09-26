import { InputSchema } from './schema.js';

/**
 * Input normalisation, and the adapter from an Indulge listing.
 *
 * Indulge listings (models/Resource.js) have a title, category, description,
 * highlights, tags, quantity, conditions and images — but no brand, model or
 * specification fields. fromResource() maps what exists; brand, model and
 * specifications are recovered later from the text (extract.js). Nothing is
 * added to the Resource model.
 */

/** Validate and tidy a raw input; throws a zod error listing every problem. */
export function normalizeInput(raw) {
  const input = InputSchema.parse(raw);
  // Specification keys are matched case-insensitively downstream.
  input.specifications = Object.fromEntries(
    Object.entries(input.specifications)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => [k.trim(), typeof v === 'string' ? v.trim() : v])
  );
  input.features = input.features.map((f) => f.trim()).filter(Boolean);
  input.accessories = input.accessories.map((a) => a.trim()).filter(Boolean);
  return input;
}

/** Map an Indulge Resource document (or plain object) onto the input schema. */
export function fromResource(resource, { quantity } = {}) {
  const images = [
    ...(resource.media || []).map((m) => m.url),
    ...(resource.images || []),
  ].filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));

  return normalizeInput({
    productName: resource.title,
    listingCategory: resource.category,
    description: [resource.description, resource.conditions].filter(Boolean).join(' ') || undefined,
    features: [...(resource.highlights || []), ...(resource.tags || [])],
    quantity: Math.max(1, Math.round(quantity || resource.totalQuantity || 1)),
    images: [...new Set(images)].slice(0, 8),
    sourceRef: resource._id ? { type: 'resource', id: String(resource._id) } : undefined,
  });
}

/** All free text about the product, for pattern matching. */
export function productText(input) {
  return [
    input.productName,
    input.brand,
    input.model,
    input.description,
    input.intendedUse,
    ...input.features,
    ...input.accessories,
    ...Object.entries(input.specifications).map(([k, v]) => `${k}: ${v}`),
  ]
    .filter(Boolean)
    .join(' . ');
}
