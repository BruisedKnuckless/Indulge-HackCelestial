import {
  Landmark,
  Armchair,
  Truck,
  UtensilsCrossed,
  Mic,
  Car,
  Users,
  Package,
} from 'lucide-react';

const CATEGORY_MAP = {
  banquet_space: Landmark,
  furniture: Armchair,
  vehicle: Truck,
  kitchen_capacity: UtensilsCrossed,
  av_equipment: Mic,
  parking: Car,
  staff: Users,
  other: Package,
};

/**
 * Clean Lucide icon for any resource category with consistent stroke width and styling.
 */
export default function CategoryIcon({ category, size = 16, className = '', strokeWidth = 1.75 }) {
  const IconComponent = CATEGORY_MAP[category] || Package;
  return <IconComponent size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}

export { CATEGORY_MAP };
