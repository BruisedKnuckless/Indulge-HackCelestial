import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSearch, useOpenRequirements, useCartMutations } from '../hooks/queries';
import { useGeolocation } from '../hooks/useGeolocation';
import GoogleMap from '../components/map/GoogleMap';
import NearbyCard from '../components/map/NearbyCard';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_LABELS } from '../lib/constants';
import { Spinner, EmptyState } from '../components/ui';

const PRESET_RADII = [5, 10, 25, 50, 100];

const SORT_OPTIONS = [
  { value: 'distance', label: 'Nearest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'rating', label: 'Rating' },
];

export default function Nearby() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Mode: 'resources' | 'requirements'
  const [mode, setMode] = useState('resources');
  const [radiusKm, setRadiusKm] = useState(() => Number(searchParams.get('radiusKm')) || 25);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('distance');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [mobileTab, setMobileTab] = useState('map'); // 'map' | 'list'

  const {
    coords,
    status: geoStatus,
    errorMessage: geoError,
    requestLocation,
    useDemoLocation,
    useBusinessLocation,
  } = useGeolocation();

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
      setSelectedItemId(null);
    }
  };

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
    if (window.innerWidth < 1024) {
      setMobileTab('map');
    }
  }, []);

  /* Clear selection on filter changes */
  useEffect(() => {
    setSelectedItemId(null);
  }, [mode, category, radiusKm, sort]);

  /* ── 4. Location Permission Flow Screen ── */
  if (!coords) {
    return (
      <div className="shell py-12">
        <div className="p-8 md:p-10 rounded-2xl border border-line bg-surface-alt text-center max-w-lg mx-auto shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-2xl">
            📍
          </div>

          <h1 className="text-xl font-bold text-ink mb-2">
            {geoStatus === 'loading'
              ? 'Finding resources near you...'
              : geoStatus === 'denied'
              ? 'Location access is required to show nearby resources.'
              : geoStatus === 'unavailable'
              ? 'Unable to determine your location.'
              : 'Nearby Resources & RFQs'}
          </h1>

          <p className="text-sm text-ink-soft max-w-md mx-auto mb-6 leading-relaxed">
            {geoStatus === 'loading'
              ? 'Querying browser geolocation for your current position…'
              : geoStatus === 'denied'
              ? 'Location permission was denied in your browser. You can enable it in site settings or explore with our Mumbai–Thane demo location.'
              : geoStatus === 'unavailable'
              ? 'Could not retrieve device coordinates. Please verify your connection or use our Mumbai–Thane demo location.'
              : 'Indulge calculates real-time distances from your position to available commercial kitchens, banquet halls, vehicles, and equipment.'}
          </p>

          {geoError && (
            <div className="mb-4 text-xs text-danger bg-danger/10 border border-danger/20 rounded-md p-2.5 max-w-md mx-auto">
              {geoError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={requestLocation}
              disabled={geoStatus === 'loading'}
              className="btn-primary w-full sm:w-auto"
            >
              {geoStatus === 'loading' ? (
                <span>Locating…</span>
              ) : geoStatus === 'denied' ? (
                'Try again'
              ) : (
                'Use my current location'
              )}
            </button>

            <button onClick={useDemoLocation} className="btn-secondary w-full sm:w-auto">
              Explore Demo (Thane, Mumbai)
            </button>

            {user?.location?.coordinates?.length === 2 && (
              <button
                onClick={() => useBusinessLocation(user.location)}
                className="btn-secondary w-full sm:w-auto"
              >
                Use business address
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── 5. Main Two-Column Layout ── */
  return (
    <div className="flex flex-col min-h-screen">
      {/* Page Header Area */}
      <header className="shell pt-6 pb-4 border-b border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Nearby Discovery</h1>
            <p className="text-sm text-ink-soft mt-0.5">
              {isLoading
                ? 'Finding resources near you...'
                : `${activeItems.length} ${mode} within ${radiusKm} km`}
              {coords.city && (
                <span className="text-ink-mute"> · {coords.city}</span>
              )}
            </p>
          </div>

          {/* Location status chip */}
          <div className="flex items-center gap-2 text-xs bg-surface border border-line rounded-lg px-3 py-1.5 self-start sm:self-auto shrink-0 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="font-medium truncate max-w-[200px]">
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
              Update
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode switch */}
            <div className="flex items-center gap-0.5 p-0.5 bg-surface-sunk rounded-lg border border-line">
              <button
                onClick={() => {
                  setMode('resources');
                  setSelectedItemId(null);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === 'resources' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
                }`}
              >
                Available Listings
              </button>
              <button
                onClick={() => {
                  setMode('requirements');
                  setSelectedItemId(null);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  mode === 'requirements' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
                }`}
              >
                Open RFQs
              </button>
            </div>

            {/* Category filter */}
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelectedItemId(null);
              }}
              className="field-select text-xs h-8 pl-2.5 pr-7"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Radius Selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-mute mr-1">Radius:</span>
              {PRESET_RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRadiusChange(r)}
                  className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                    radiusKm === r
                      ? 'bg-ink text-ink-invert border-ink'
                      : 'bg-surface border-line text-ink-soft hover:text-ink'
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            {mode === 'resources' && (
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="field-select text-xs h-8 pl-2.5 pr-7"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              mobileTab === 'map' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            🗺 Map
          </button>
          <button
            onClick={() => setMobileTab('list')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              mobileTab === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            📋 Listings ({activeItems.length})
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
              <GoogleMap
                userCoords={coords}
                items={activeItems}
                radiusKm={radiusKm}
                selectedId={selectedItemId}
                onSelect={handleMapSelect}
              />
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
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent uppercase tracking-wider">
                          <span>{CATEGORY_ICONS[req.category] || '📋'}</span>
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
                      <span className="font-semibold text-accent">
                        📍 {(req.distanceKm ?? 0).toFixed(1)} km
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
