import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Map,
  ListFilter,
  Navigation,
  Compass,
  Package,
  ClipboardList,
  Route,
  Layers,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSearch, useOpenRequirements, useCartMutations } from '../hooks/queries';
import { useGeolocation } from '../hooks/useGeolocation';
import GoogleMap from '../components/map/GoogleMap';
import MapErrorBoundary from '../components/map/MapErrorBoundary';
import NearbyCard from '../components/map/NearbyCard';
import CategoryIcon from '../components/ui/CategoryIcon';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants';
import { Spinner, EmptyState } from '../components/ui';
import {
  getSavedNearbySession,
  saveNearbySession,
  clearNearbySession,
} from '../lib/nearbySession';

const PRESET_RADII = [5, 10, 25, 50, 100];

const SORT_OPTIONS = [
  { value: 'distance', label: 'Nearest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating', label: 'Rating' },
];

export default function Nearby() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Safely restore validated Nearby session state from sessionStorage on mount
  const savedSession = useMemo(() => getSavedNearbySession(), []);

  // Mode: 'resources' | 'requirements'
  const [mode, setMode] = useState(() => searchParams.get('mode') || savedSession?.mode || 'resources');
  const [radiusKm, setRadiusKm] = useState(
    () => Number(searchParams.get('radiusKm')) || savedSession?.radiusKm || 25
  );
  const [isCustomRadius, setIsCustomRadius] = useState(() => {
    const initRadius = Number(searchParams.get('radiusKm')) || savedSession?.radiusKm || 25;
    return !PRESET_RADII.includes(initRadius);
  });
  const [customRadiusInput, setCustomRadiusInput] = useState('');
  const [category, setCategory] = useState(
    () => searchParams.get('category') || savedSession?.category || 'all'
  );
  const [sort, setSort] = useState(() => searchParams.get('sort') || savedSession?.sort || 'distance');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [mobileTab, setMobileTab] = useState(() => savedSession?.mobileTab || 'map'); // 'map' | 'list'

  const {
    coords,
    status: geoStatus,
    errorMessage: geoError,
    requestLocation,
    useDemoLocation,
    useBusinessLocation,
    clearLocation,
  } = useGeolocation(savedSession?.coords || null);

  const { add: addToCart } = useCartMutations();
  const [addingId, setAddingId] = useState(null);

  const handleAddToCart = async (r) => {
    setAddingId(r._id);
    try {
      await addToCart.mutateAsync({ resourceId: r._id, quantity: 1 });
    } finally {
      setAddingId(null);
    }
  };

  const handleRadiusChange = (r) => {
    const num = Number(r);
    if (num > 0) {
      setRadiusKm(num);
      setIsCustomRadius(!PRESET_RADII.includes(num));
      setSelectedItemId(null);
    }
  };

  const handleResetLocation = useCallback(() => {
    clearNearbySession();
    clearLocation();
    setSelectedItemId(null);
  }, [clearLocation]);

  // Persist valid Nearby discovery state across browser refresh
  useEffect(() => {
    if (coords) {
      saveNearbySession({
        coords,
        radiusKm,
        mode,
        category,
        sort,
        mobileTab,
      });
    }
  }, [coords, radiusKm, mode, category, sort, mobileTab]);

  /* ── 1. Backend Data Queries ── */
  const resourceQuery = useMemo(() => {
    if (!coords) return null;
    const q = {
      lat: coords.lat,
      lng: coords.lng,
      radiusKm,
      sort,
      limit: 60,
    };
    if (category && category !== 'all') q.category = category;
    return q;
  }, [coords, radiusKm, sort, category]);

  const { data: resourceData, isLoading: resourcesLoading } = useSearch(
    resourceQuery,
    Boolean(coords && mode === 'resources')
  );
  const resources = resourceData?.results || [];

  const requirementQuery = useMemo(() => {
    if (!coords) return null;
    const q = {
      lat: coords.lat,
      lng: coords.lng,
      radiusKm,
      limit: 60,
    };
    if (category && category !== 'all') q.category = category;
    return q;
  }, [coords, radiusKm, category]);

  const { data: requirementData, isLoading: requirementsLoading } = useOpenRequirements(
    requirementQuery,
    Boolean(coords && mode === 'requirements')
  );
  const requirements = requirementData?.requirements || [];

  const activeItems = mode === 'resources' ? resources : requirements;
  const isLoading = mode === 'resources' ? resourcesLoading : requirementsLoading;

  /* ── 2. Synchronization: Map Marker -> Resource Card ── */
  const handleMapSelect = useCallback((item) => {
    if (!item) {
      setSelectedItemId(null);
      return;
    }
    setSelectedItemId(item._id);
    const cardEl = document.getElementById(`nearby-card-${item._id}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  /* ── 3. Synchronization: Resource Card -> Map Marker ── */
  const handleCardClick = useCallback((item) => {
    setSelectedItemId(item._id);
    // On small screens, switch to map view so the focused marker is visible
    if (window.innerWidth < 1024) {
      setMobileTab('map');
    }
  }, []);

  /* Clear selection on filter changes */
  useEffect(() => {
    setSelectedItemId(null);
  }, [mode, category, radiusKm, sort]);

  /* ── 4. Location Permission Flow Screen (Enhanced Initial Experience) ── */
  if (!coords) {
    return (
      <div className="shell py-10 md:py-16 max-w-4xl mx-auto flex flex-col gap-10">
        {/* Main Location Selection Card */}
        <div className="p-8 md:p-10 rounded-2xl border border-line bg-surface-alt text-center shadow-sm relative overflow-hidden">
          {/* Subtle top indicator bar */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent/20 via-accent to-accent/20" />

          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shadow-2xs">
            <Navigation size={26} className="shrink-0" />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-ink mb-2">
            Nearby Resources & RFQs
          </h1>

          <p className="text-sm md:text-base text-ink-soft max-w-lg mx-auto mb-6 leading-relaxed">
            Find available hospitality resources and open requirements around your operational location.
          </p>

          {geoError && (
            <div className="mb-6 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 max-w-md mx-auto flex items-center gap-2 text-left">
              <AlertCircle size={16} className="shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          {/* Action CTAs: Primary is visually prominent */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
            <button
              onClick={requestLocation}
              disabled={geoStatus === 'loading'}
              className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 shadow-sm font-semibold"
            >
              {geoStatus === 'loading' ? (
                <>
                  <Spinner size="sm" />
                  <span>Locating…</span>
                </>
              ) : (
                <>
                  <Navigation size={15} className="shrink-0" />
                  <span>Use my current location</span>
                </>
              )}
            </button>

            <button
              onClick={useDemoLocation}
              className="btn-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium"
            >
              <Compass size={15} className="shrink-0 text-ink-soft" />
              <span>Explore Demo (Thane, Mumbai)</span>
            </button>

            {user?.location?.coordinates?.length === 2 && (
              <button
                onClick={() => useBusinessLocation(user.location)}
                className="btn-outline w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium"
              >
                <Building2 size={15} className="shrink-0 text-ink-soft" />
                <span>Use business address</span>
              </button>
            )}
          </div>

          {/* Compact Operational Benefits */}
          <div className="mt-8 pt-6 border-t border-line/70 grid grid-cols-1 md:grid-cols-3 gap-3.5 text-left">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface/70 border border-line/60">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 text-accent flex items-center justify-center shrink-0">
                <Package size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-ink">Nearby Resources</h4>
                <p className="text-[11px] text-ink-soft leading-snug mt-0.5">
                  Find available hospitality capacity around you.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface/70 border border-line/60">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 text-accent flex items-center justify-center shrink-0">
                <ClipboardList size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-ink">Open RFQs</h4>
                <p className="text-[11px] text-ink-soft leading-snug mt-0.5">
                  Discover active requirements from nearby businesses.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface/70 border border-line/60">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 text-accent flex items-center justify-center shrink-0">
                <Route size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-ink">Distance-Aware Results</h4>
                <p className="text-[11px] text-ink-soft leading-snug mt-0.5">
                  Compare availability and proximity before opening a resource.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section: How Nearby works */}
        <section className="flex flex-col gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-base font-semibold text-ink tracking-tight">How Nearby works</h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Rapid proximity-based asset mobilization for commercial hospitality operations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-line bg-surface flex flex-col gap-2 relative shadow-2xs">
              <div className="flex items-center justify-between text-xs text-ink-mute font-mono">
                <span className="w-6 h-6 rounded-md bg-surface-sunk border border-line flex items-center justify-center font-bold text-ink">
                  1
                </span>
                <MapPin size={15} className="text-ink-soft" />
              </div>
              <h3 className="text-sm font-semibold text-ink mt-1">Set your location</h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                Choose your current operational position, registered business venue, or test with our Mumbai demo cluster.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-line bg-surface flex flex-col gap-2 relative shadow-2xs">
              <div className="flex items-center justify-between text-xs text-ink-mute font-mono">
                <span className="w-6 h-6 rounded-md bg-surface-sunk border border-line flex items-center justify-center font-bold text-ink">
                  2
                </span>
                <Compass size={15} className="text-ink-soft" />
              </div>
              <h3 className="text-sm font-semibold text-ink mt-1">Choose a radius</h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                Search within 5 to 100+ km to match your logistics tolerances and transport constraints.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-line bg-surface flex flex-col gap-2 relative shadow-2xs">
              <div className="flex items-center justify-between text-xs text-ink-mute font-mono">
                <span className="w-6 h-6 rounded-md bg-surface-sunk border border-line flex items-center justify-center font-bold text-ink">
                  3
                </span>
                <Layers size={15} className="text-ink-soft" />
              </div>
              <h3 className="text-sm font-semibold text-ink mt-1">Discover capacity</h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                Explore nearby resources and open RFQs with real-time distance calculations and verified providers.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Platform Scope / Categories Preview */}
        <section className="p-5 rounded-xl border border-line bg-surface-alt/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-mute">
              Operational Asset Categories
            </h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Available for real-time proximity discovery across the Indulge B2B network.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:max-w-md sm:justify-end">
            {CATEGORIES.map((cat) => (
              <span
                key={cat.value}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface border border-line text-[11px] text-ink-soft font-medium shadow-2xs"
              >
                <CategoryIcon category={cat.value} size={12} className="shrink-0 text-ink-mute" />
                <span>{cat.short || cat.label}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    );
  }

  /* ── 5. Main Two-Column Layout (Nearby Discovery) ── */
  return (
    <div className="flex flex-col min-h-screen">
      {/* Page Header Area */}
      <header className="shell pt-5 pb-3 border-b border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Nearby Discovery</h1>
            <p className="text-sm text-ink-soft mt-0.5">
              {isLoading
                ? 'Finding resources near you...'
                : `${activeItems.length} ${mode === 'resources' ? 'resource' : 'requirement'}${activeItems.length === 1 ? '' : 's'} within ${radiusKm} km`}
              {coords.city && (
                <span className="text-ink-mute"> · {coords.city}</span>
              )}
            </p>
          </div>

          {/* Location status chip with quick-switch and reset */}
          <div className="flex items-center gap-2 text-xs bg-surface border border-line rounded-lg px-3 py-1.5 self-start sm:self-auto shrink-0 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-success shrink-0" />
            <span className="font-medium truncate max-w-[180px]">
              {coords.isDemo
                ? 'Demo: Thane, Mumbai'
                : coords.isBusiness
                ? `Business: ${coords.city}`
                : coords.city || 'Current position'}
            </span>
            <button
              onClick={requestLocation}
              className="text-accent hover:underline font-semibold ml-1 shrink-0"
              title="Re-request browser GPS location"
            >
              Use GPS
            </button>
            <span className="text-line-strong">·</span>
            <button
              onClick={handleResetLocation}
              className="text-ink-mute hover:text-ink hover:underline font-medium shrink-0 transition-colors"
              title="Change or reset discovery location"
            >
              Change
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode switch */}
            <div className="flex items-center gap-0.5 p-0.5 bg-surface-sunk rounded-lg border border-line">
              <button
                onClick={() => {
                  setMode('resources');
                  setSelectedItemId(null);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === 'resources'
                    ? 'bg-surface text-ink shadow-2xs'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Resources {resources.length > 0 && `(${resources.length})`}
              </button>
              <button
                onClick={() => {
                  setMode('requirements');
                  setSelectedItemId(null);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === 'requirements'
                    ? 'bg-surface text-ink shadow-2xs'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Requirements {requirements.length > 0 && `(${requirements.length})`}
              </button>
            </div>

            {/* Radius Selector Pills */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-ink-mute font-medium mr-0.5">Radius:</span>
              {PRESET_RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRadiusChange(r)}
                  className={`h-7 px-2.5 text-xs font-medium rounded-full border transition-colors ${
                    radiusKm === r && !isCustomRadius
                      ? 'bg-ink border-ink text-ink-invert'
                      : 'border-line text-ink-soft hover:border-ink hover:text-ink'
                  }`}
                >
                  {r} km
                </button>
              ))}

              {/* Custom radius */}
              {isCustomRadius ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRadiusChange(customRadiusInput);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={customRadiusInput}
                    onChange={(e) => setCustomRadiusInput(e.target.value)}
                    placeholder="km"
                    className="field h-7 w-16 text-xs px-2"
                    autoFocus
                  />
                  <button type="submit" className="btn-primary h-7 px-2 text-xs">
                    Set
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setIsCustomRadius(true);
                    setCustomRadiusInput(String(radiusKm));
                  }}
                  className="h-7 px-2.5 text-xs font-medium rounded-full border border-line text-ink-soft hover:border-ink hover:text-ink"
                >
                  Custom
                </button>
              )}
            </div>
          </div>

          {/* Right side: Category & Sort */}
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelectedItemId(null);
              }}
              className="field-select text-xs h-8 pl-2 pr-7"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {mode === 'resources' && (
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="field-select text-xs h-8 pl-2 pr-7"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="flex lg:hidden items-center gap-1 p-0.5 bg-surface-sunk rounded-lg border border-line mt-3 w-fit">
          <button
            onClick={() => setMobileTab('map')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all inline-flex items-center gap-1.5 ${
              mobileTab === 'map' ? 'bg-surface text-ink shadow-2xs' : 'text-ink-soft'
            }`}
          >
            <Map size={13} />
            <span>Map</span>
          </button>
          <button
            onClick={() => setMobileTab('list')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all inline-flex items-center gap-1.5 ${
              mobileTab === 'list' ? 'bg-surface text-ink shadow-2xs' : 'text-ink-soft'
            }`}
          >
            <ListFilter size={13} />
            <span>Listings ({activeItems.length})</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: 60% Map / 40% Listings */}
      <main className="shell flex-1 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
          {/* Left Column: Google Map (~60%) */}
          <section
            className={`sticky top-20 ${mobileTab === 'list' ? 'hidden lg:block' : 'block'}`}
            aria-label="Map discovery"
          >
            <div className="h-[48vh] lg:h-[calc(100vh-210px)] min-h-[420px] w-full rounded-xl overflow-hidden">
              <MapErrorBoundary>
                <GoogleMap
                  userCoords={coords}
                  items={activeItems}
                  radiusKm={radiusKm}
                  selectedId={selectedItemId}
                  onSelect={handleMapSelect}
                />
              </MapErrorBoundary>
            </div>
          </section>

          {/* Right Column: Nearby Resources List (~40%) */}
          <section
            className={`min-w-0 flex flex-col gap-3 ${
              mobileTab === 'map' ? 'hidden lg:flex' : 'flex'
            }`}
            aria-label="Nearby resource listings"
          >
            {/* List sub-header */}
            <div className="flex items-center justify-between text-xs text-ink-mute font-medium px-1">
              <span>
                {isLoading
                  ? 'Searching listings…'
                  : `${activeItems.length} result${activeItems.length === 1 ? '' : 's'}`}
              </span>
              <span>Sorted by {SORT_OPTIONS.find((s) => s.value === sort)?.label}</span>
            </div>

            {/* List content */}
            {isLoading ? (
              <div className="py-20 flex justify-center">
                <Spinner label={`Finding nearby ${mode}…`} />
              </div>
            ) : activeItems.length === 0 ? (
              <EmptyState
                title={`No ${mode} found within ${radiusKm} km`}
                message="Try expanding your search radius or clearing category filters to find available options."
                action={
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => handleRadiusChange(50)}
                      className="btn-secondary btn-sm"
                    >
                      Expand to 50 km
                    </button>
                    <button onClick={() => setCategory('all')} className="btn-secondary btn-sm">
                      All Categories
                    </button>
                  </div>
                }
              />
            ) : mode === 'resources' ? (
              <div className="flex flex-col gap-2.5">
                {resources.map((r) => (
                  <div key={r._id} id={`nearby-card-${r._id}`}>
                    <NearbyCard
                      resource={r}
                      selected={selectedItemId === r._id}
                      onClick={() => handleCardClick(r)}
                      onAdd={handleAddToCart}
                      adding={addingId === r._id}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {requirements.map((req) => (
                  <div
                    key={req._id}
                    id={`nearby-card-${req._id}`}
                    onClick={() => handleCardClick(req)}
                    className={`p-3.5 rounded-xl border bg-surface-alt cursor-pointer transition-all duration-150 ${
                      selectedItemId === req._id
                        ? 'border-accent ring-1 ring-accent/30 shadow-sm bg-surface'
                        : 'border-line hover:border-line-strong hover:shadow-sm hover:-translate-y-px'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent uppercase tracking-wider">
                          <CategoryIcon category={req.category} size={13} className="shrink-0" />
                          <span>{CATEGORY_LABELS[req.category] || req.category}</span>
                        </span>
                        <h3 className="text-sm font-semibold text-ink mt-0.5 leading-snug line-clamp-1">
                          <Link
                            to={`/requirements/${req._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-accent transition-colors"
                          >
                            {req.title}
                          </Link>
                        </h3>
                        <p className="text-xs text-ink-soft mt-0.5 truncate">
                          {req.seeker?.businessName || 'Verified Seeker'}
                        </p>
                      </div>

                      {req.urgency && (
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            req.urgency === 'high'
                              ? 'bg-danger/10 text-danger border border-danger/20'
                              : req.urgency === 'medium'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-surface-sunk text-ink-mute'
                          }`}
                        >
                          {req.urgency}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft mt-2 pt-2 border-t border-line/60">
                      <span className="font-semibold text-accent inline-flex items-center gap-1">
                        <MapPin size={12} className="shrink-0" />
                        <span>{(req.distanceKm ?? 0).toFixed(1)} km</span>
                      </span>
                      {req.location?.city && <span>· {req.location.city}</span>}
                      {req.maxPrice != null && (
                        <span className="font-medium text-ink">
                          · Budget: ₹{req.maxPrice.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-line/60">
                      <span className="text-[11px] text-ink-mute">
                        Needed: {new Date(req.startDateTime).toLocaleDateString()}
                      </span>
                      <Link
                        to={`/requirements/${req._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="btn-secondary btn-sm text-xs py-0.5 px-2.5"
                      >
                        Make an offer →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
