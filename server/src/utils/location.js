/**
 * Best-effort coordinates for a location. There is no geocoding: explicit
 * coordinates win, otherwise known city / area names map to preset points.
 */
export function resolveDefaultCoordinates(loc) {
  if (Array.isArray(loc?.coordinates) && loc.coordinates.length === 2 && !isNaN(loc.coordinates[0]) && !isNaN(loc.coordinates[1])) {
    return [Number(loc.coordinates[0]), Number(loc.coordinates[1])];
  }
  if (loc?.longitude !== undefined && loc?.latitude !== undefined && !isNaN(loc.longitude) && !isNaN(loc.latitude)) {
    return [Number(loc.longitude), Number(loc.latitude)];
  }
  const text = `${loc?.city || ''} ${loc?.address || ''} ${loc?.formattedAddress || ''} ${loc?.state || ''}`.toLowerCase();
  // Navi Mumbai first: "navi mumbai" also contains "mumbai".
  if (text.includes('navi mumbai') || text.includes('vashi') || text.includes('belapur') || text.includes('mahape') || text.includes('kharghar') || text.includes('panvel')) {
    return [73.0297, 19.0330];
  }
  if (text.includes('mumbai') || text.includes('bombay') || text.includes('andheri') || text.includes('bkc') || text.includes('bandra') || text.includes('juhu') || text.includes('powai') || text.includes('worli') || text.includes('lower parel')) {
    return [72.8777, 19.0760];
  }
  if (text.includes('kalyan')) return [73.1355, 19.2437];
  if (text.includes('dombivli')) return [73.0970, 19.2144];
  if (text.includes('bhiwandi')) return [73.0631, 19.2967];
  if (text.includes('pune') || text.includes('hinjewadi') || text.includes('kharadi')) return [73.8567, 18.5204];
  if (text.includes('bengaluru') || text.includes('bangalore')) return [77.5946, 12.9716];
  if (text.includes('delhi') || text.includes('gurgaon') || text.includes('noida')) return [77.2090, 28.6139];
  if (text.includes('hyderabad')) return [78.4867, 17.3850];
  if (text.includes('chennai')) return [80.2707, 13.0827];
  if (text.includes('kolkata')) return [88.3639, 22.5726];
  if (text.includes('ahmedabad')) return [72.5714, 23.0225];
  // Default to central MMR / Thane hub
  return [72.9781, 19.2183];
}
