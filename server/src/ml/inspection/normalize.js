import { InputSchema } from './schema.js';

/**
 * Input normalisation, and the adapter from an Indulge listing.
 *
 * Indulge listings (models/Resource.js) have a title, category, description,
 * highlights, tags, quantity, conditions and images, plus optional product
 * details (brand, model, declaredCondition, specifications, accessories).
 * fromResource() maps what exists; anything the provider left out is
 * recovered later from the text (extract.js).
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

  const specs = resource.specifications instanceof Map
    ? Object.fromEntries(resource.specifications)
    : { ...(resource.specifications || {}) };
  const opt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  return normalizeInput({
    productName: resource.title,
    brand: opt(resource.brand),
    model: opt(resource.model),
    declaredCondition: opt(resource.declaredCondition),
    specifications: Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, String(v)])),
    accessories: (resource.accessories || []).map(String),
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
