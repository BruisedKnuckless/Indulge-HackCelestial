/**
 * Centralized Marketplace Fee & Tax Configuration
 * All rates are configurable and not hardcoded into UI components.
 */

export const FEES_CONFIG = {
  // Seeker fees
  PLATFORM_FEE_PERCENT: 5, // 5% Indulge platform fee on resource rental value
  PLATFORM_SERVICE_GST_PERCENT: 18, // 18% GST on Indulge platform service

  // Lister commission
  LISTER_COMMISSION_PERCENT: 3, // 3% successful-booking commission
  LISTER_COMMISSION_GST_PERCENT: 18, // 18% GST on Indulge commission

  // Payment gateway fee (sandbox / demo)
  PAYMENT_GATEWAY_FEE_PERCENT: 2, // 2% payment processing fee
  GATEWAY_GST_PERCENT: 18, // 18% GST on payment processing fee

  // Default resource GST rates by category (configurable, never fixed 8% everywhere)
  CATEGORY_GST_RATES: {
    venue: 18,
    banquet_hall: 18,
    conference_room: 18,
    kitchen: 18,
    cloud_kitchen: 18,
    storage: 18,
    cold_storage: 18,
    vehicle: 18,
    transport: 18,
    av_equipment: 18,
    furniture: 18,
    cutlery_crockery: 18,
    laundry: 18,
    staff: 18,
    other: 18,
  },
  DEFAULT_RESOURCE_GST_PERCENT: 18,

  // Settlement lifecycle configuration
  SETTLEMENT_DELAY_HOURS: 24, // Configurable delay after return verification before funds become available
};
