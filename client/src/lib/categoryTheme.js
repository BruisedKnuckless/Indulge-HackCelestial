/**
 * Category Card Theme Configurations
 * Centralizes category-specific hover styling for B2B resource cards.
 * 
 * Mapping:
 * - AV Equipment     -> Indigo
 * - Banquet Spaces   -> Amber
 * - Furniture        -> Violet
 * - Vehicles         -> Teal/Blue
 * - Kitchen Capacity -> Orange
 * - Parking          -> Blue
 * - Staff            -> Rose
 * - Other            -> Slate/Green (Emerald)
 */

export const CATEGORY_CARD_THEMES = {
  av_equipment: {
    catClass: 'card-cat-av_equipment',
    badge: 'border-indigo/25 text-indigo bg-indigo/10 group-hover:border-indigo/50 group-hover:bg-indigo/15',
    titleHover: 'group-hover:text-indigo',
    accentColor: '#6366F1',
    ringColor: 'ring-indigo/30',
  },
  banquet_space: {
    catClass: 'card-cat-banquet_space',
    badge: 'border-amber-500/25 text-amber-700 dark:text-amber-300 bg-amber-500/10 group-hover:border-amber-500/50 group-hover:bg-amber-500/15',
    titleHover: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
    accentColor: '#F59E0B',
    ringColor: 'ring-amber-500/30',
  },
  furniture: {
    catClass: 'card-cat-furniture',
    badge: 'border-violet/25 text-violet bg-violet/10 group-hover:border-violet/50 group-hover:bg-violet/15',
    titleHover: 'group-hover:text-violet',
    accentColor: '#8B5CF6',
    ringColor: 'ring-violet/30',
  },
  vehicle: {
    catClass: 'card-cat-vehicle',
    badge: 'border-teal/25 text-teal bg-teal/10 group-hover:border-teal/50 group-hover:bg-teal/15',
    titleHover: 'group-hover:text-teal',
    accentColor: '#14B8A6',
    ringColor: 'ring-teal/30',
  },
  kitchen_capacity: {
    catClass: 'card-cat-kitchen_capacity',
    badge: 'border-orange-500/25 text-orange-700 dark:text-orange-300 bg-orange-500/10 group-hover:border-orange-500/50 group-hover:bg-orange-500/15',
    titleHover: 'group-hover:text-orange-600 dark:group-hover:text-orange-400',
    accentColor: '#F97316',
    ringColor: 'ring-orange-500/30',
  },
  parking: {
    catClass: 'card-cat-parking',
    badge: 'border-blue-500/25 text-blue-700 dark:text-blue-300 bg-blue-500/10 group-hover:border-blue-500/50 group-hover:bg-blue-500/15',
    titleHover: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
    accentColor: '#3B82F6',
    ringColor: 'ring-blue-500/30',
  },
  staff: {
    catClass: 'card-cat-staff',
    badge: 'border-rose-500/25 text-rose-700 dark:text-rose-300 bg-rose-500/10 group-hover:border-rose-500/50 group-hover:bg-rose-500/15',
    titleHover: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
    accentColor: '#F43F5E',
    ringColor: 'ring-rose-500/30',
  },
  other: {
    catClass: 'card-cat-other',
    badge: 'border-emerald-500/25 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 group-hover:border-emerald-500/50 group-hover:bg-emerald-500/15',
    titleHover: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
    accentColor: '#10B981',
    ringColor: 'ring-emerald-500/30',
  },
};

export function getCategoryCardTheme(category) {
  return CATEGORY_CARD_THEMES[category] || CATEGORY_CARD_THEMES.other;
}
