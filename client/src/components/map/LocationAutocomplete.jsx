import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Check, X, Loader2, Navigation, AlertCircle, Compass, Building2 } from 'lucide-react';
import { useGoogleMapsLoader } from './GoogleMap';

/**
 * Built-in registry of major Indian commercial & logistics hubs.
 * Provides instant, zero-latency autocomplete even if Google Places API
 * has quota limits, billing restrictions, or legacy API deprecations.
 */
const POPULAR_INDIAN_HUBS = [
  // ── Thane & Central Suburbs ──
  {
    id: 'thane-west',
    name: 'Thane West',
    secondary: 'Thane, Maharashtra 400601',
    address: 'Thane West, Thane, Maharashtra 400601',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400601',
    lat: 19.2183,
    lng: 72.9781,
    badge: 'Popular Hub',
  },
  {
    id: 'viviana-mall-thane',
    name: 'Viviana Mall, Thane',
    secondary: 'Eastern Express Highway, Thane West, Maharashtra 400606',
    address: 'Viviana Mall, Eastern Express Highway, Thane West, Maharashtra 400606',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400606',
    lat: 19.2088,
    lng: 72.9723,
    badge: 'Landmark',
  },
  {
    id: 'wagle-estate-thane',
    name: 'Wagle Industrial Estate, Thane',
    secondary: 'Thane West, Maharashtra 400604',
    address: 'Wagle Industrial Estate, Road No 16, Thane West, Maharashtra 400604',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400604',
    lat: 19.1950,
    lng: 72.9510,
    badge: 'Industrial Area',
  },
  {
    id: 'majiwada-thane',
    name: 'Majiwada Junction, Thane',
    secondary: 'Thane West, Maharashtra 400601',
    address: 'Majiwada Junction, Thane West, Maharashtra 400601',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400601',
    lat: 19.2155,
    lng: 72.9840,
    badge: 'Transit Hub',
  },
  {
    id: 'ghodbunder-road-thane',
    name: 'Ghodbunder Road, Thane',
    secondary: 'Thane West, Maharashtra 400615',
    address: 'Ghodbunder Road, Thane West, Maharashtra 400615',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400615',
    lat: 19.2600,
    lng: 72.9600,
    badge: 'Commercial Corridor',
  },
  {
    id: 'kolshet-thane',
    name: 'Kolshet Road, Thane',
    secondary: 'Thane West, Maharashtra 400607',
    address: 'Kolshet Road, Thane West, Maharashtra 400607',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400607',
    lat: 19.2312,
    lng: 72.9935,
    badge: 'Business Park',
  },
  {
    id: 'naupada-thane',
    name: 'Naupada, Thane',
    secondary: 'Thane West, Maharashtra 400602',
    address: 'Naupada, Thane West, Maharashtra 400602',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400602',
    lat: 19.1895,
    lng: 72.9754,
    badge: 'Commercial Market',
  },
  {
    id: 'thane-east',
    name: 'Thane East',
    secondary: 'Thane, Maharashtra 400603',
    address: 'Thane East, Thane, Maharashtra 400603',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '400603',
    lat: 19.1865,
    lng: 72.9812,
    badge: 'Transit Hub',
  },
  {
    id: 'bhiwandi-logistics-hub',
    name: 'Bhiwandi Warehousing & Logistics Hub',
    secondary: 'Bhiwandi, Thane District, Maharashtra 421302',
    address: 'Bhiwandi Logistics Park, Mumbai-Nashik Highway, Maharashtra 421302',
    city: 'Thane',
    state: 'Maharashtra',
    postalCode: '421302',
    lat: 19.2967,
    lng: 73.0631,
    badge: 'Key Logistics Hub',
  },
  {
    id: 'kalyan-central',
    name: 'Kalyan Central Commercial Hub',
    secondary: 'Kalyan, Thane District, Maharashtra 421301',
    address: 'Kalyan Central, Thane District, Maharashtra 421301',
    city: 'Kalyan',
    state: 'Maharashtra',
    postalCode: '421301',
    lat: 19.2437,
    lng: 73.1355,
    badge: 'Transit Hub',
  },
  {
    id: 'dombivli-midc',
    name: 'Dombivli MIDC Industrial Area',
    secondary: 'Dombivli East, Thane District, Maharashtra 421203',
    address: 'Dombivli MIDC Phase 2, Dombivli East, Maharashtra 421203',
    city: 'Dombivli',
    state: 'Maharashtra',
    postalCode: '421203',
    lat: 19.2144,
    lng: 73.0970,
    badge: 'Industrial Area',
  },
  // ── Mumbai ──
  {
    id: 'bkc-mumbai',
    name: 'Bandra Kurla Complex (BKC)',
    secondary: 'Bandra East, Mumbai, Maharashtra 400051',
    address: 'Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400051',
    lat: 19.0657,
    lng: 72.8687,
    badge: 'Business District',
  },
  {
    id: 'andheri-east-midc',
    name: 'Andheri East (MIDC / Chakala)',
    secondary: 'Andheri East, Mumbai, Maharashtra 400093',
    address: 'Andheri East MIDC, Andheri-Kurla Road, Mumbai, Maharashtra 400093',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400093',
    lat: 19.1136,
    lng: 72.8697,
    badge: 'Commercial Hub',
  },
  {
    id: 'andheri-west',
    name: 'Andheri West (Lokhandwala / Link Road)',
    secondary: 'Andheri West, Mumbai, Maharashtra 400053',
    address: 'Lokhandwala Complex, Andheri West, Mumbai, Maharashtra 400053',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400053',
    lat: 19.1363,
    lng: 72.8277,
    badge: 'Commercial Area',
  },
  {
    id: 'lower-parel',
    name: 'Lower Parel (High Street Phoenix)',
    secondary: 'Lower Parel, Mumbai, Maharashtra 400013',
    address: 'Senapati Bapat Marg, Lower Parel, Mumbai, Maharashtra 400013',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400013',
    lat: 18.9953,
    lng: 72.8242,
    badge: 'Commercial Center',
  },
  {
    id: 'dadar-mumbai',
    name: 'Dadar Central',
    secondary: 'Dadar, Mumbai, Maharashtra 400014',
    address: 'Dadar Central, Mumbai, Maharashtra 400014',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400014',
    lat: 19.0178,
    lng: 72.8478,
    badge: 'Transit Hub',
  },
  {
    id: 'powai-mumbai',
    name: 'Powai (Hiranandani Gardens)',
    secondary: 'Powai, Mumbai, Maharashtra 400076',
    address: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    lat: 19.1176,
    lng: 72.9060,
    badge: 'Business District',
  },
  {
    id: 'kurla-mumbai',
    name: 'Kurla West (Phoenix Marketcity)',
    secondary: 'Kurla West, Mumbai, Maharashtra 400070',
    address: 'LBS Marg, Kurla West, Mumbai, Maharashtra 400070',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400070',
    lat: 19.0860,
    lng: 72.8890,
    badge: 'Commercial Hub',
  },
  {
    id: 'goregaon-east',
    name: 'Goregaon East (Nesco Center)',
    secondary: 'Goregaon East, Mumbai, Maharashtra 400063',
    address: 'Western Express Highway, Goregaon East, Mumbai, Maharashtra 400063',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400063',
    lat: 19.1551,
    lng: 72.8526,
    badge: 'Exhibition & Business',
  },
  {
    id: 'borivali-west',
    name: 'Borivali West',
    secondary: 'Borivali West, Mumbai, Maharashtra 400092',
    address: 'Borivali West, Mumbai, Maharashtra 400092',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400092',
    lat: 19.2307,
    lng: 72.8567,
    badge: 'Commercial Hub',
  },
  {
    id: 'nariman-point',
    name: 'Nariman Point',
    secondary: 'South Mumbai, Maharashtra 400021',
    address: 'Nariman Point, Mumbai, Maharashtra 400021',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400021',
    lat: 18.9256,
    lng: 72.8242,
    badge: 'Business District',
  },
  // ── Navi Mumbai ──
  {
    id: 'vashi-navi-mumbai',
    name: 'Vashi Sector 17',
    secondary: 'Vashi, Navi Mumbai, Maharashtra 400703',
    address: 'Sector 17, Vashi, Navi Mumbai, Maharashtra 400703',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '400703',
    lat: 19.0771,
    lng: 72.9986,
    badge: 'Commercial Hub',
  },
  {
    id: 'mahape-navi-mumbai',
    name: 'Mahape (TTC Industrial Area)',
    secondary: 'Mahape, Navi Mumbai, Maharashtra 400710',
    address: 'MIDC Industrial Area, Mahape, Navi Mumbai, Maharashtra 400710',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '400710',
    lat: 19.1197,
    lng: 73.0163,
    badge: 'Logistics & Tech Hub',
  },
  {
    id: 'cbd-belapur',
    name: 'CBD Belapur',
    secondary: 'CBD Belapur, Navi Mumbai, Maharashtra 400614',
    address: 'CBD Belapur, Navi Mumbai, Maharashtra 400614',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '400614',
    lat: 19.0185,
    lng: 73.0392,
    badge: 'Business District',
  },
  {
    id: 'airoli-mindspace',
    name: 'Airoli Mindspace Hub',
    secondary: 'Airoli, Navi Mumbai, Maharashtra 400708',
    address: 'Mindspace Airoli East, Navi Mumbai, Maharashtra 400708',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '400708',
    lat: 19.1579,
    lng: 72.9984,
    badge: 'Business Park',
  },
  {
    id: 'panvel-hub',
    name: 'Panvel Transport Hub',
    secondary: 'Panvel, Navi Mumbai, Maharashtra 410206',
    address: 'Panvel, Navi Mumbai, Maharashtra 410206',
    city: 'Navi Mumbai',
    state: 'Maharashtra',
    postalCode: '410206',
    lat: 18.9894,
    lng: 73.1175,
    badge: 'Logistics Corridor',
  },
  // ── Pune ──
  {
    id: 'hinjawadi-pune',
    name: 'Hinjawadi Infotech Park, Pune',
    secondary: 'Hinjawadi Phase 1, Pune, Maharashtra 411057',
    address: 'Hinjawadi Rajiv Gandhi Infotech Park, Pune, Maharashtra 411057',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411057',
    lat: 18.5913,
    lng: 73.7389,
    badge: 'Tech & Business Park',
  },
  {
    id: 'viman-nagar-pune',
    name: 'Viman Nagar, Pune',
    secondary: 'Viman Nagar, Pune, Maharashtra 411014',
    address: 'Viman Nagar, Pune, Maharashtra 411014',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411014',
    lat: 18.5679,
    lng: 73.9143,
    badge: 'Commercial Hub',
  },
  {
    id: 'chakan-midc-pune',
    name: 'Chakan MIDC Logistics Hub, Pune',
    secondary: 'Chakan, Pune, Maharashtra 410501',
    address: 'Chakan Industrial Area, Pune, Maharashtra 410501',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '410501',
    lat: 18.7606,
    lng: 73.8587,
    badge: 'Key Logistics Hub',
  },
  // ── Bengaluru ──
  {
    id: 'koramangala-bangalore',
    name: 'Koramangala, Bengaluru',
    secondary: 'Bengaluru, Karnataka 560034',
    address: 'Koramangala, Bengaluru, Karnataka 560034',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560034',
    lat: 12.9352,
    lng: 77.6245,
    badge: 'Commercial Hub',
  },
  {
    id: 'whitefield-bangalore',
    name: 'Whitefield IT Hub, Bengaluru',
    secondary: 'Whitefield, Bengaluru, Karnataka 560066',
    address: 'Whitefield, Bengaluru, Karnataka 560066',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560066',
    lat: 12.9698,
    lng: 77.7500,
    badge: 'Business Park',
  },
  {
    id: 'peenya-bangalore',
    name: 'Peenya Industrial Area, Bengaluru',
    secondary: 'Peenya, Bengaluru, Karnataka 560058',
    address: 'Peenya Industrial Area, Bengaluru, Karnataka 560058',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560058',
    lat: 13.0329,
    lng: 77.5255,
    badge: 'Industrial & Logistics',
  },
  // ── Delhi NCR ──
  {
    id: 'connaught-place-delhi',
    name: 'Connaught Place, New Delhi',
    secondary: 'Central Delhi, Delhi 110001',
    address: 'Connaught Place, New Delhi, Delhi 110001',
    city: 'New Delhi',
    state: 'Delhi',
    postalCode: '110001',
    lat: 28.6304,
    lng: 77.2177,
    badge: 'Central Hub',
  },
  {
    id: 'cyber-city-gurgaon',
    name: 'DLF Cyber City, Gurugram',
    secondary: 'DLF Phase 2, Gurugram, Haryana 122002',
    address: 'DLF Cyber City, Sector 24, Gurugram, Haryana 122002',
    city: 'Gurugram',
    state: 'Haryana',
    postalCode: '122002',
    lat: 28.4950,
    lng: 77.0895,
    badge: 'Corporate Hub',
  },
  {
    id: 'sector-62-noida',
    name: 'Sector 62, Noida',
    secondary: 'Noida, Gautam Buddha Nagar, Uttar Pradesh 201309',
    address: 'Sector 62, Noida, Uttar Pradesh 201309',
    city: 'Noida',
    state: 'Uttar Pradesh',
    postalCode: '201309',
    lat: 28.6280,
    lng: 77.3649,
    badge: 'Institutional & Tech',
  },
  // ── Hyderabad ──
  {
    id: 'hitec-city-hyderabad',
    name: 'HITEC City, Hyderabad',
    secondary: 'Madhapur, Hyderabad, Telangana 500081',
    address: 'HITEC City, Madhapur, Hyderabad, Telangana 500081',
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500081',
    lat: 17.4474,
    lng: 78.3762,
    badge: 'Tech District',
  },
];

/**
 * Searches local hubs for matching keywords.
 */
function searchLocalHubs(searchQuery) {
  if (!searchQuery || typeof searchQuery !== 'string') return [];
  const q = searchQuery.toLowerCase().trim();
  if (q.length < 2) return [];

  const tokens = q.split(/\s+/).filter(Boolean);

  return POPULAR_INDIAN_HUBS.filter((hub) => {
    const text = `${hub.name} ${hub.secondary} ${hub.address} ${hub.city} ${hub.state} ${hub.postalCode}`.toLowerCase();
    return tokens.every((token) => text.includes(token));
  }).map((hub) => ({
    place_id: `local_hub_${hub.id}`,
    isLocalHub: true,
    description: hub.address,
    structured_formatting: {
      main_text: hub.name,
      secondary_text: hub.secondary,
    },
    ...hub,
  }));
}

/**
 * Derives smart default coordinates and details for common Indian regions.
 */
function getCityDefaultCoords(cityName) {
  const c = (cityName || '').toLowerCase().trim();
  if (c.includes('thane')) return { lat: '19.2183', lng: '72.9781', city: 'Thane', state: 'Maharashtra', postalCode: '400601' };
  if (c.includes('mumbai') || c.includes('bombay') || c.includes('bkc') || c.includes('andheri')) {
    return { lat: '19.0760', lng: '72.8777', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001' };
  }
  if (c.includes('navi mumbai') || c.includes('vashi') || c.includes('mahape') || c.includes('belapur')) {
    return { lat: '19.0330', lng: '73.0297', city: 'Navi Mumbai', state: 'Maharashtra', postalCode: '400703' };
  }
  if (c.includes('kalyan')) return { lat: '19.2437', lng: '73.1355', city: 'Kalyan', state: 'Maharashtra', postalCode: '421301' };
  if (c.includes('dombivli')) return { lat: '19.2144', lng: '73.0970', city: 'Dombivli', state: 'Maharashtra', postalCode: '421203' };
  if (c.includes('bhiwandi')) return { lat: '19.2967', lng: '73.0631', city: 'Thane', state: 'Maharashtra', postalCode: '421302' };
  if (c.includes('pune')) return { lat: '18.5204', lng: '73.8567', city: 'Pune', state: 'Maharashtra', postalCode: '411001' };
  if (c.includes('bengaluru') || c.includes('bangalore')) return { lat: '12.9716', lng: '77.5946', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' };
  if (c.includes('delhi') || c.includes('gurgaon') || c.includes('noida')) return { lat: '28.6139', lng: '77.2090', city: 'New Delhi', state: 'Delhi', postalCode: '110001' };
  if (c.includes('hyderabad')) return { lat: '17.3850', lng: '78.4867', city: 'Hyderabad', state: 'Telangana', postalCode: '500001' };
  if (c.includes('chennai')) return { lat: '13.0827', lng: '80.2707', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001' };
  if (c.includes('kolkata')) return { lat: '22.5726', lng: '88.3639', city: 'Kolkata', state: 'West Bengal', postalCode: '700001' };
  if (c.includes('ahmedabad')) return { lat: '23.0225', lng: '72.5714', city: 'Ahmedabad', state: 'Gujarat', postalCode: '380001' };

  return { lat: '19.2183', lng: '72.9781', city: 'Thane', state: 'Maharashtra', postalCode: '400601' };
}

/**
 * Compact Google Map preview component for a single geocoded point.
 */
function CompactMapPreview({ lat, lng, address }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const { isLoaded } = useGoogleMapsLoader();

  useEffect(() => {
    if (!isLoaded || !mapRef.current || typeof window.google?.maps?.Map !== 'function') {
      return;
    }

    const center = { lat: Number(lat), lng: Number(lng) };
    if (isNaN(center.lat) || isNaN(center.lng)) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'cooperative',
      });

      markerRef.current = new window.google.maps.Marker({
        position: center,
        map: mapInstanceRef.current,
        title: address || 'Selected Location',
        animation: window.google.maps.Animation.DROP,
      });
    } else {
      mapInstanceRef.current.setCenter(center);
      if (markerRef.current) {
        markerRef.current.setPosition(center);
      }
    }
  }, [isLoaded, lat, lng, address]);

  if (!isLoaded) {
    return (
      <div className="w-full h-32 rounded-lg bg-surface-sunk border border-line flex flex-col items-center justify-center p-3 text-center">
        <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-1.5">
          <MapPin size={16} />
        </div>
        <p className="text-xs font-medium text-ink">Geospatial Point Confirmed</p>
        <p className="text-[11px] text-ink-mute font-mono mt-0.5">
          [{Number(lng).toFixed(4)}, {Number(lat).toFixed(4)}]
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-36 rounded-lg overflow-hidden border border-line shadow-inner bg-surface-sunk">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}

/**
 * Searchable Location Autocomplete component with Map Preview,
 * built-in verified Indian hubs, and foolproof manual fallback.
 *
 * Persists location in GeoJSON format:
 * location: {
 *   type: "Point",
 *   coordinates: [longitude, latitude],
 *   address, formattedAddress, city, state, pincode, postalCode, placeId, addressLine2
 * }
 */
export default function LocationAutocomplete({
  value,
  onChange,
  label = 'Business location',
  placeholder = 'Search address, mall, hotel, or landmark (e.g. Viviana Mall, Thane)...',
  required = false,
  helperText = 'Search any venue, landmark, or street in India. Exact coordinates power nearby discovery.',
  showAddressLine2 = true,
  disabled = false,
}) {
  const { isLoaded, loadError } = useGoogleMapsLoader();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({
    address: '',
    city: '',
    state: '',
    postalCode: '',
    lat: '',
    lng: '',
  });
  const [manualMsg, setManualMsg] = useState('');

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);

  // Initialize Google Places services when script is ready
  useEffect(() => {
    if (isLoaded && window.google?.maps?.places) {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!placesServiceRef.current) {
        placesServiceRef.current = new window.google.maps.places.PlacesService(
          document.createElement('div')
        );
      }
    }
  }, [isLoaded]);

  const hasSelectedCoords =
    Array.isArray(value?.coordinates) &&
    value.coordinates.length === 2 &&
    typeof value.coordinates[0] === 'number' &&
    typeof value.coordinates[1] === 'number';

  // Close suggestions on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch predictions combining local verified Indian hubs and Google Places
  useEffect(() => {
    if (!query.trim() || hasSelectedCoords || manualMode) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const localMatches = searchLocalHubs(query);

    // If Google Places service is not yet loaded or unavailable, display local matches immediately
    if (!isLoaded || !autocompleteServiceRef.current) {
      setSuggestions(localMatches);
      setIsOpen(true);
      setActiveIdx(-1);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'in' },
        },
        (predictions, status) => {
          setLoading(false);
          const googleResults =
            status === window.google?.maps?.places?.PlacesServiceStatus?.OK &&
            Array.isArray(predictions)
              ? predictions
              : [];

          // Merge local hub matches with Google results
          const combined = [...localMatches];
          const localNames = new Set(
            localMatches.map((m) => m.structured_formatting.main_text.toLowerCase())
          );

          for (const g of googleResults) {
            const mainText = (
              g.structured_formatting?.main_text ||
              g.description ||
              ''
            ).toLowerCase();
            if (!localNames.has(mainText)) {
              combined.push(g);
            }
          }

          setSuggestions(combined);
          setIsOpen(true);
          setActiveIdx(-1);
        }
      );
    }, 150);

    return () => clearTimeout(timer);
  }, [query, isLoaded, hasSelectedCoords, manualMode]);

  // Handle selection from autocomplete suggestions
  const handleSelectPrediction = (prediction) => {
    if (!prediction) return;

    // Fast path: Local verified hub with precomputed coordinates
    if (prediction.isLocalHub) {
      const locationData = {
        type: 'Point',
        // GeoJSON ordering: [longitude, latitude]
        coordinates: [Number(prediction.lng), Number(prediction.lat)],
        address: prediction.address,
        formattedAddress: prediction.address,
        addressLine2: value?.addressLine2 || '',
        city: prediction.city || 'Thane',
        state: prediction.state || 'Maharashtra',
        pincode: prediction.postalCode || '',
        postalCode: prediction.postalCode || '',
        placeId: prediction.place_id,
      };

      setQuery('');
      setIsOpen(false);
      setSuggestions([]);
      onChange?.(locationData);
      return;
    }

    // Google Places selection
    if (!placesServiceRef.current || !prediction.place_id) return;

    setLoading(true);
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['name', 'formatted_address', 'geometry', 'address_components', 'place_id'],
      },
      (place, status) => {
        setLoading(false);
        if (
          status === window.google?.maps?.places?.PlacesServiceStatus?.OK &&
          place?.geometry?.location
        ) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          let city = '';
          let state = '';
          let postalCode = '';

          for (const comp of place.address_components || []) {
            const types = comp.types || [];
            if (types.includes('locality')) {
              city = comp.long_name;
            } else if (!city && (types.includes('sublocality_level_1') || types.includes('sublocality'))) {
              city = comp.long_name;
            }
            if (types.includes('administrative_area_level_1')) {
              state = comp.long_name;
            }
            if (types.includes('postal_code')) {
              postalCode = comp.long_name;
            }
          }

          const primaryName = place.name || prediction.structured_formatting?.main_text || '';
          const fullFormatted = place.formatted_address || prediction.description || '';
          const combinedAddress =
            primaryName && !fullFormatted.startsWith(primaryName)
              ? `${primaryName}, ${fullFormatted}`
              : fullFormatted;

          const locationData = {
            type: 'Point',
            coordinates: [lng, lat],
            address: combinedAddress,
            formattedAddress: fullFormatted,
            addressLine2: value?.addressLine2 || '',
            city: city || 'Mumbai',
            state: state || 'Maharashtra',
            pincode: postalCode || '',
            postalCode: postalCode || '',
            placeId: place.place_id || prediction.place_id,
          };

          setQuery('');
          setIsOpen(false);
          setSuggestions([]);
          onChange?.(locationData);
        }
      }
    );
  };

  // Instant 1-click fallback from custom user query
  const handleSelectCustomQuery = (customText) => {
    const raw = (customText || query).trim();
    if (!raw) return;

    const defaults = getCityDefaultCoords(raw);
    const locationData = {
      type: 'Point',
      coordinates: [Number(defaults.lng), Number(defaults.lat)],
      address: `${raw}, ${defaults.city}, ${defaults.state}`,
      formattedAddress: `${raw}, ${defaults.city}, ${defaults.state} ${defaults.postalCode}`.trim(),
      addressLine2: value?.addressLine2 || '',
      city: defaults.city,
      state: defaults.state,
      pincode: defaults.postalCode,
      postalCode: defaults.postalCode,
      placeId: `custom_${Date.now()}`,
    };

    setQuery('');
    setIsOpen(false);
    setSuggestions([]);
    onChange?.(locationData);
  };

  // Open manual mode with smart prefilling so city/state/coords are NEVER empty
  const enterManualMode = (initialText) => {
    const seed = (typeof initialText === 'string' ? initialText : query).trim();
    const defaults = getCityDefaultCoords(seed || 'Thane');

    setManualForm((prev) => ({
      address: prev.address || seed || '',
      city: prev.city || defaults.city || 'Thane',
      state: prev.state || defaults.state || 'Maharashtra',
      postalCode: prev.postalCode || defaults.postalCode || '400601',
      lat: prev.lat || defaults.lat || '19.2183',
      lng: prev.lng || defaults.lng || '72.9781',
    }));
    setManualMsg('');
    setManualMode(true);
    setIsOpen(false);
  };

  // Keyboard navigation for combobox
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < suggestions.length) {
        handleSelectPrediction(suggestions[activeIdx]);
      } else if (query.trim()) {
        handleSelectCustomQuery(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Change location action: resets coordinate selection to allow new search
  const handleChangeLocation = () => {
    setQuery('');
    setIsOpen(false);
    setManualMode(false);
    onChange?.({
      ...value,
      coordinates: undefined,
      placeId: undefined,
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Manual fallback submission with intelligent auto-recovery
  const handleApplyManual = (e) => {
    e?.preventDefault?.();
    setManualMsg('');

    let city = (manualForm.city || '').trim();
    if (!city) {
      city = query.trim() || (manualForm.address ? manualForm.address.split(',')[0].trim() : '') || 'Thane';
    }
    let state = (manualForm.state || '').trim() || 'Maharashtra';
    let postalCode = (manualForm.postalCode || '').trim() || '400601';

    let lat = Number(manualForm.lat);
    let lng = Number(manualForm.lng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      const defaults = getCityDefaultCoords(city);
      lat = Number(defaults.lat);
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      const defaults = getCityDefaultCoords(city);
      lng = Number(defaults.lng);
    }

    const locationData = {
      type: 'Point',
      // Crucial: GeoJSON ordering is [longitude, latitude]
      coordinates: [lng, lat],
      address: manualForm.address.trim() || `${city}, ${state}`,
      formattedAddress: manualForm.address.trim() || `${city}, ${state} ${postalCode}`.trim(),
      addressLine2: value?.addressLine2 || '',
      city,
      state,
      pincode: postalCode,
      postalCode,
      placeId: `manual_${Date.now()}`,
    };

    setManualMode(false);
    onChange?.(locationData);
  };

  // Browser Geolocation for manual fallback
  const handleUseBrowserLocation = () => {
    if (!navigator.geolocation) {
      setManualMsg('Browser geolocation is not supported on this device.');
      return;
    }
    setManualMsg('Acquiring device coordinates…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setManualForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          city: f.city.trim() || query.trim() || 'Thane',
          state: f.state.trim() || 'Maharashtra',
        }));
        setManualMsg('Coordinates acquired from device location.');
      },
      (err) => {
        setManualMsg(`Geolocation notice: ${err.message}. Defaulting to region coordinates.`);
        const defaults = getCityDefaultCoords(query || 'Thane');
        setManualForm((f) => ({
          ...f,
          lat: f.lat || defaults.lat,
          lng: f.lng || defaults.lng,
          city: f.city.trim() || defaults.city,
          state: f.state.trim() || defaults.state,
        }));
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Address Line 2 change handler
  const handleAddressLine2Change = (e) => {
    const addressLine2 = e.target.value;
    onChange?.({
      ...(value || {}),
      addressLine2,
    });
  };

  const selectedLng = hasSelectedCoords ? value.coordinates[0] : null;
  const selectedLat = hasSelectedCoords ? value.coordinates[1] : null;

  return (
    <div ref={containerRef} className="space-y-2.5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {!hasSelectedCoords && (
            <button
              type="button"
              onClick={() => (manualMode ? setManualMode(false) : enterManualMode())}
              className="text-[11px] text-accent hover:underline font-medium"
            >
              {manualMode ? 'Use Location Search' : 'Manual Address Entry'}
            </button>
          )}
        </div>

        {/* ── State A: Confirmed Location Preview ── */}
        {hasSelectedCoords ? (
          <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 transition-all space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={14} className="stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink truncate">
                    {value.formattedAddress || value.address || 'Selected Location'}
                  </p>
                  <p className="text-[11px] text-ink-mute truncate">
                    {[value.city, value.state, value.postalCode || value.pincode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleChangeLocation}
                disabled={disabled}
                className="btn-secondary btn-sm text-xs py-1 px-2.5 shrink-0 border-accent/30 hover:bg-accent/10"
              >
                Change Location
              </button>
            </div>

            {/* Compact Map Preview */}
            <CompactMapPreview
              lat={selectedLat}
              lng={selectedLng}
              address={value.formattedAddress || value.address}
            />

            <div className="flex items-center justify-between text-[11px] text-ink-mute pt-1 border-t border-line/60">
              <span className="flex items-center gap-1 font-mono text-[10px] text-ink-soft">
                <MapPin size={11} className="text-accent" />
                [{selectedLng?.toFixed(4)}, {selectedLat?.toFixed(4)}]
              </span>
              <span className="text-emerald-600 font-medium">✓ Ready for Geospatial Matching</span>
            </div>
          </div>
        ) : manualMode || (!isLoaded && loadError) ? (
          /* ── State B: Manual Entry Fallback ── */
          <div className="p-3 rounded-lg border border-line bg-surface-alt space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <Navigation size={13} className="text-accent" />
                Manual Location & Coordinates
              </span>
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className="text-[11px] text-accent hover:underline"
              >
                Back to Search
              </button>
            </div>

            <p className="text-[11px] text-ink-mute">
              Enter address and exact coordinates to enable distance-based ranking and nearby discovery.
            </p>

            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-medium text-ink-soft">Street Address</label>
                <input
                  value={manualForm.address}
                  onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })}
                  placeholder="e.g. 120 Eastern Express Highway"
                  className="field text-xs py-1.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">City *</label>
                  <input
                    value={manualForm.city}
                    onChange={(e) => setManualForm({ ...manualForm, city: e.target.value })}
                    placeholder="Enter city (e.g. Thane)"
                    className="field text-xs py-1.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">State</label>
                  <input
                    value={manualForm.state}
                    onChange={(e) => setManualForm({ ...manualForm, state: e.target.value })}
                    placeholder="Enter state (e.g. Maharashtra)"
                    className="field text-xs py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">Pincode</label>
                  <input
                    value={manualForm.postalCode}
                    onChange={(e) => setManualForm({ ...manualForm, postalCode: e.target.value })}
                    placeholder="Enter pincode (e.g. 400601)"
                    className="field text-xs py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">
                    Latitude (-90 to 90) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={manualForm.lat}
                    onChange={(e) => setManualForm({ ...manualForm, lat: e.target.value })}
                    placeholder="Latitude (e.g. 19.2183)"
                    className="field text-xs py-1.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">
                    Longitude (-180 to 180) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={manualForm.lng}
                    onChange={(e) => setManualForm({ ...manualForm, lng: e.target.value })}
                    placeholder="Longitude (e.g. 72.9781)"
                    className="field text-xs py-1.5"
                    required
                  />
                </div>
              </div>

              {manualMsg && (
                <p className="text-[11px] text-accent font-medium flex items-center gap-1">
                  <AlertCircle size={12} />
                  {manualMsg}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleUseBrowserLocation}
                  className="btn-secondary btn-sm text-[11px] py-1 px-2 flex items-center gap-1"
                >
                  <Navigation size={12} />
                  Use Current Device GPS
                </button>
                <button
                  type="button"
                  onClick={handleApplyManual}
                  className="btn-primary btn-sm text-xs py-1 px-3"
                >
                  Save Manual Location
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── State C: Searchable Input with Local Hubs & Google Places ── */
          <div className="relative">
            <div className="relative flex items-center">
              <div className="absolute left-3 text-ink-mute pointer-events-none">
                <Search size={15} />
              </div>

              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-autocomplete="list"
                aria-controls="location-predictions"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0 || query.trim()) setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="field pl-9 pr-8 w-full transition-all"
                autoComplete="off"
              />

              {loading ? (
                <div className="absolute right-3 text-accent animate-spin pointer-events-none">
                  <Loader2 size={15} />
                </div>
              ) : query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSuggestions([]);
                    setIsOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-1 text-ink-mute hover:text-ink rounded"
                  aria-label="Clear query"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {/* Suggestions Dropdown */}
            {isOpen && (
              <div
                id="location-predictions"
                role="listbox"
                className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-xl py-1 text-xs divide-y divide-line/40"
              >
                {suggestions.length > 0 ? (
                  <div>
                    {suggestions.map((item, idx) => {
                      const isHighlighted = idx === activeIdx;
                      return (
                        <button
                          key={item.place_id || idx}
                          type="button"
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => handleSelectPrediction(item)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                            isHighlighted ? 'bg-surface-sunk text-accent' : 'hover:bg-surface-sunk text-ink'
                          }`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {item.isLocalHub ? (
                              <Building2 size={14} className="text-accent" />
                            ) : (
                              <MapPin size={14} className="text-accent" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-semibold text-ink truncate">
                                {item.structured_formatting?.main_text || item.name || item.description}
                              </p>
                              {item.badge && (
                                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-accent/10 text-accent shrink-0">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.structured_formatting?.secondary_text && (
                              <p className="text-[11px] text-ink-mute truncate">
                                {item.structured_formatting.secondary_text}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* 1-Click Custom Query Fallback */}
                {query.trim().length >= 2 && (
                  <div className="p-2 bg-surface-alt/70 space-y-1">
                    <button
                      type="button"
                      onClick={() => handleSelectCustomQuery(query)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-accent/10 text-accent font-medium flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Compass size={13} />
                        Use &quot;<span className="font-semibold">{query}</span>&quot; as Location
                      </span>
                      <span className="text-[10px] text-ink-mute shrink-0">Auto Coordinates →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => enterManualMode(query)}
                      className="w-full text-left px-2.5 py-1 text-[11px] text-ink-mute hover:text-ink hover:underline flex items-center gap-1"
                    >
                      <Navigation size={11} />
                      Specify custom street & coordinates manually
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-ink-mute mt-1">{helperText}</p>
          </div>
        )}
      </div>

      {/* ── Address Line 2 / Landmark (Optional) ── */}
      {showAddressLine2 && (
        <div>
          <label htmlFor="addressLine2" className="label">
            Address line 2 / Landmark <span className="text-ink-mute font-normal">(optional)</span>
          </label>
          <input
            id="addressLine2"
            type="text"
            value={value?.addressLine2 || ''}
            onChange={handleAddressLine2Change}
            placeholder="Floor, building, gate, landmark"
            disabled={disabled}
            className="field text-xs py-2"
          />
        </div>
      )}
    </div>
  );
}
