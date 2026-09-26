import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Check, X, Loader2, Navigation, AlertCircle } from 'lucide-react';
import { useGoogleMapsLoader } from './GoogleMap';

// Curated high-volume Indian logistics & commercial hubs for instant, reliable fallback search
const POPULAR_INDIAN_HUBS = [
  { name: 'Bhiwandi Logistics Hub', address: 'Bhiwandi Logistics Park, Mankoli, Bhiwandi, Maharashtra 421302', city: 'Bhiwandi', state: 'Maharashtra', pincode: '421302', coordinates: [73.0631, 19.2813] },
  { name: 'Thane Majiwada Hub', address: 'Eastern Express Highway, Majiwada, Thane, Maharashtra 400601', city: 'Thane', state: 'Maharashtra', pincode: '400601', coordinates: [72.9750, 19.2080] },
  { name: 'Wagle Industrial Estate', address: 'Road No 16, Wagle Estate, Thane, Maharashtra 400604', city: 'Thane', state: 'Maharashtra', pincode: '400604', coordinates: [72.9515, 19.1970] },
  { name: 'Vashi APMC Market', address: 'APMC Market, Sector 19, Vashi, Navi Mumbai, Maharashtra 400703', city: 'Navi Mumbai', state: 'Maharashtra', pincode: '400703', coordinates: [73.0071, 19.0760] },
  { name: 'Bandra Kurla Complex (BKC)', address: 'G Block, Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051', city: 'Mumbai', state: 'Maharashtra', pincode: '400051', coordinates: [72.8656, 19.0657] },
  { name: 'Andheri MIDC Cargo Area', address: 'Central Road, MIDC, Andheri East, Mumbai, Maharashtra 400093', city: 'Mumbai', state: 'Maharashtra', pincode: '400093', coordinates: [72.8697, 19.1136] },
  { name: 'Powai Hiranandani Hub', address: 'Central Avenue, Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076', city: 'Mumbai', state: 'Maharashtra', pincode: '400076', coordinates: [72.9051, 19.1176] },
  { name: 'Kurla LBS Marg Hub', address: 'LBS Marg, Kurla West, Mumbai, Maharashtra 400070', city: 'Mumbai', state: 'Maharashtra', pincode: '400070', coordinates: [72.8890, 19.0863] },
  { name: 'Kalyan Logistics Terminal', address: 'Kalyan-Bhiwandi Road, Kalyan, Maharashtra 421301', city: 'Kalyan', state: 'Maharashtra', pincode: '421301', coordinates: [73.1355, 19.2437] },
  { name: 'Panvel JNPT Cargo Hub', address: 'JNPT Highway, Panvel, Navi Mumbai, Maharashtra 410206', city: 'Navi Mumbai', state: 'Maharashtra', pincode: '410206', coordinates: [73.1100, 18.9894] },
  { name: 'Pune Hinjawadi Tech & Logistics', address: 'Phase 1, Hinjawadi, Pune, Maharashtra 411057', city: 'Pune', state: 'Maharashtra', pincode: '411057', coordinates: [73.7280, 18.5913] },
  { name: 'Mulund West Hub', address: 'LBS Marg, Mulund West, Mumbai, Maharashtra 400080', city: 'Mumbai', state: 'Maharashtra', pincode: '400080', coordinates: [72.9563, 19.1726] },
  { name: 'Dadar Commercial Hub', address: 'Dadar TT Circle, Dadar East, Mumbai, Maharashtra 400014', city: 'Mumbai', state: 'Maharashtra', pincode: '400014', coordinates: [72.8437, 19.0178] },
  { name: 'Worli Hospitality Zone', address: 'Dr Annie Besant Rd, Worli, Mumbai, Maharashtra 400018', city: 'Mumbai', state: 'Maharashtra', pincode: '400018', coordinates: [72.8181, 19.0003] },
  { name: 'Nariman Point Financial District', address: 'Marine Drive, Nariman Point, Mumbai, Maharashtra 400021', city: 'Mumbai', state: 'Maharashtra', pincode: '400021', coordinates: [72.8223, 18.9256] }
];

/**
 * Compact Google Map preview component for a single geocoded point.
 */
function CompactMapPreview({ lat, lng, address }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const { isLoaded, authError, loadError } = useGoogleMapsLoader();

  useEffect(() => {
    if (!isLoaded || authError || loadError || !mapRef.current || typeof window.google?.maps?.Map !== 'function') {
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
  }, [isLoaded, authError, loadError, lat, lng, address]);

  if (!isLoaded || authError || loadError) {
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
 * Searchable Google Places Autocomplete component with Map Preview and
 * robust fallback for manual entry.
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
  const { isLoaded, loadError, authError } = useGoogleMapsLoader();
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

  // Initialize Places services when Google script is ready
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

  // Sync initial query if value has address but no query set
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

  // Fetch predictions with debounce and Indian commercial hubs fallback
  useEffect(() => {
    if (!query.trim() || hasSelectedCoords || manualMode) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const q = query.trim().toLowerCase();
    const matchingHubs = POPULAR_INDIAN_HUBS.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q)
    ).map((h) => ({
      place_id: `hub_${h.name.replace(/\s+/g, '_').toLowerCase()}`,
      isCustomHub: true,
      description: h.address,
      structured_formatting: {
        main_text: h.name,
        secondary_text: `${h.city}, ${h.state} (${h.pincode})`,
      },
      ...h,
    }));

    if (!isLoaded || authError || loadError || !autocompleteServiceRef.current) {
      setSuggestions(matchingHubs);
      setIsOpen(matchingHubs.length > 0 || query.trim().length >= 3);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'in' },
        },
        (predictions, status) => {
          setLoading(false);
          const ok = status === window.google?.maps?.places?.PlacesServiceStatus?.OK && Array.isArray(predictions);
          const googleResults = ok ? predictions : [];
          // Merge Google results with curated hubs, avoiding duplicates
          const seen = new Set(googleResults.map((p) => (p.description || '').toLowerCase()));
          const extraHubs = matchingHubs.filter((h) => !seen.has(h.description.toLowerCase()));
          const combined = [...googleResults, ...extraHubs];
          setSuggestions(combined);
          setIsOpen(combined.length > 0 || query.trim().length >= 3);
          setActiveIdx(-1);
        }
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isLoaded, authError, loadError, hasSelectedCoords, manualMode]);

  // Handle suggestion selection via PlacesService.getDetails or curated hub
  const handleSelectPrediction = (prediction) => {
    if (prediction.isCustomHub) {
      const locationData = {
        type: 'Point',
        coordinates: prediction.coordinates,
        address: prediction.address,
        formattedAddress: prediction.address,
        addressLine2: value?.addressLine2 || '',
        city: prediction.city,
        state: prediction.state,
        pincode: prediction.pincode,
        postalCode: prediction.pincode,
        placeId: prediction.place_id,
      };

      setQuery('');
      setIsOpen(false);
      setSuggestions([]);
      onChange?.(locationData);
      return;
    }

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
            // Crucial: GeoJSON ordering is [longitude, latitude]
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

  // Manual fallback submission
  const handleApplyManual = (e) => {
    e?.preventDefault?.();
    setManualMsg('');

    const lat = Number(manualForm.lat);
    const lng = Number(manualForm.lng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setManualMsg('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setManualMsg('Longitude must be a valid number between -180 and 180.');
      return;
    }
    if (!manualForm.city.trim()) {
      setManualMsg('City is required.');
      return;
    }

    const locationData = {
      type: 'Point',
      coordinates: [lng, lat],
      address: manualForm.address || `${manualForm.city}, ${manualForm.state}`,
      formattedAddress: manualForm.address || `${manualForm.city}, ${manualForm.state}`,
      addressLine2: value?.addressLine2 || '',
      city: manualForm.city.trim(),
      state: manualForm.state.trim(),
      pincode: manualForm.postalCode.trim(),
      postalCode: manualForm.postalCode.trim(),
      placeId: '',
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
        }));
        setManualMsg('Coordinates acquired from device location.');
      },
      (err) => {
        setManualMsg(`Geolocation error: ${err.message}. Please enter manually.`);
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
              onClick={() => setManualMode(!manualMode)}
              className="text-[11px] text-accent hover:underline font-medium"
            >
              {manualMode ? 'Use Google Search' : 'Manual Address Entry'}
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
              {isLoaded && (
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="text-[11px] text-accent hover:underline"
                >
                  Back to Search
                </button>
              )}
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
                    placeholder="Thane"
                    className="field text-xs py-1.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">State</label>
                  <input
                    value={manualForm.state}
                    onChange={(e) => setManualForm({ ...manualForm, state: e.target.value })}
                    placeholder="Maharashtra"
                    className="field text-xs py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-soft">Pincode</label>
                  <input
                    value={manualForm.postalCode}
                    onChange={(e) => setManualForm({ ...manualForm, postalCode: e.target.value })}
                    placeholder="400601"
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
                    placeholder="19.2183"
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
                    placeholder="72.9781"
                    className="field text-xs py-1.5"
                    required
                  />
                </div>
              </div>

              {manualMsg && (
                <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
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
          /* ── State C: Searchable Google Places Input ── */
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
                  if (suggestions.length > 0) setIsOpen(true);
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
                className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface shadow-xl py-1 text-xs"
              >
                {suggestions.length > 0 ? (
                  suggestions.map((item, idx) => {
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
                        <MapPin size={14} className="shrink-0 mt-0.5 text-accent" />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate">
                            {item.structured_formatting?.main_text || item.description}
                          </p>
                          {item.structured_formatting?.secondary_text && (
                            <p className="text-[11px] text-ink-mute truncate">
                              {item.structured_formatting.secondary_text}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : query.trim().length >= 3 && !loading ? (
                  <div className="px-3 py-3 text-center text-ink-mute">
                    <p className="text-xs">No matching locations found for "{query}".</p>
                    <button
                      type="button"
                      onClick={() => setManualMode(true)}
                      className="mt-1 text-[11px] text-accent hover:underline font-medium"
                    >
                      Enter address manually →
                    </button>
                  </div>
                ) : null}
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
