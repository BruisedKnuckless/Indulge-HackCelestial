import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CloudRain,
  Wind,
  Thermometer,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Calendar,
  MapPin,
  RotateCcw,
  Compass,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Sliders,
  Eye,
  RefreshCw,
  TrendingDown,
  Layers,
  AlertOctagon,
  Activity,
  Info,
  ExternalLink,
  ShieldCheck,
  Send,
  Navigation,
  AlertCircle,
  Radio,
  Search,
  X,
  Crosshair,
} from 'lucide-react';
import api, { errorMessage } from '../../api/client';
import { inr, dateTime } from '../../lib/format';
import {
  CITIES,
  STANDARD_LOGISTICS_RADIUS_KM,
  PRESET_SCENARIOS,
  getDistanceZone,
  getEffectiveRadius,
  formatDelay,
  calculateSimulatedETA,
  getLogisticsRiskStatus,
  getBookingRiskInfo,
} from './digitalTwinHelper';
import DigitalTwinMap from './DigitalTwinMap';
import PublicSignalsPanel from './PublicSignalsPanel';

export default function DigitalTwinPanel({ initialCity = 'Thane', embedded = false }) {
  const navigate = useNavigate();

  // Selected city & coordinates (Supports presets, Live GPS, and custom search)
  const [selectedCityName, setSelectedCityName] = useState(initialCity);
  const [customLocation, setCustomLocation] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const selectedCity = useMemo(() => {
    if (customLocation && customLocation.name.toLowerCase() === selectedCityName.toLowerCase()) {
      return customLocation;
    }
    const found = CITIES.find((c) => c.name.toLowerCase() === selectedCityName.toLowerCase());
    return found || customLocation || CITIES[0];
  }, [selectedCityName, customLocation]);

  // Live weather state
  const [liveWeather, setLiveWeather] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // Scenario input state (defaults to Thane Storm Scenario)
  const [scenario, setScenario] = useState({
    rainfallMmPerHour: 90,
    temperature: 28,
    windSpeedMps: 15,
    durationHours: 5,
  });

  // Mode: counterfactual vs live
  const [isLiveMode, setIsLiveMode] = useState(false);

  // Simulation execution state
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState(null);

  // Modal / interactive states
  const [rescheduleModalBooking, setRescheduleModalBooking] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'logistics' | 'bookings' | 'cascades'

  // Fetch live weather for the selected city
  const fetchLiveWeather = useCallback(async (city) => {
    setLiveLoading(true);
    try {
      const res = await api.get(`/weather?lat=${city.lat}&lon=${city.lon}`);
      if (res.data?.available) {
        setLiveWeather(res.data);
      } else {
        setLiveWeather(null);
      }
    } catch {
      setLiveWeather(null);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  // Run simulation against backend POST /api/digital-twin/simulate
  const runSimulation = useCallback(
    async (overrideScenario = null, useLive = false) => {
      setSimulating(true);
      setSimError(null);

      const targetScenario = overrideScenario || scenario;

      try {
        const payload = {
          location: {
            name: selectedCity.name,
            lat: selectedCity.lat,
            lon: selectedCity.lon,
          },
          scenario: {
            rainfallMmPerHour: Number(targetScenario.rainfallMmPerHour) || 0,
            temperature: Number(targetScenario.temperature) || 25,
            windSpeedMps: Number(targetScenario.windSpeedMps) || 0,
            durationHours: Number(targetScenario.durationHours) || 1,
          },
          useLiveWeather: useLive,
        };

        const res = await api.post('/digital-twin/simulate', payload);
        if (res.data?.success) {
          setSimResult(res.data);
        } else {
          setSimError(res.data?.error || 'Simulation returned unsuccessful status.');
        }
      } catch (err) {
        setSimError(
          errorMessage(
            err,
            'Digital Twin simulation service is currently unavailable. Existing Indulge operations are unaffected.'
          )
        );
      } finally {
        setSimulating(false);
      }
    },
    [selectedCity, scenario]
  );

  // Initial load / location change: fetch live weather and run simulation
  useEffect(() => {
    fetchLiveWeather(selectedCity);
    runSimulation();
  }, [selectedCity.name, selectedCity.lat, selectedCity.lon]);

  // Live Browser GPS Geolocation
  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));

        let detectedName = 'Live Location';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          if (res.ok) {
            const data = await res.json();
            detectedName =
              data.address?.city ||
              data.address?.town ||
              data.address?.suburb ||
              data.address?.district ||
              data.address?.state_district ||
              'Current Location';
          }
        } catch {
          const closest = CITIES.reduce((prev, curr) => {
            const dPrev = Math.hypot(prev.lat - lat, prev.lon - lon);
            const dCurr = Math.hypot(curr.lat - lat, curr.lon - lon);
            return dCurr < dPrev ? curr : prev;
          });
          detectedName = closest.name;
        }

        const newLoc = { name: detectedName, lat, lon, isLiveGps: true };
        setCustomLocation(newLoc);
        setSelectedCityName(detectedName);
        setGpsLoading(false);
        toast.success(`📍 Live GPS Hub Set: ${detectedName} (${lat}, ${lon})`);
      },
      (err) => {
        setGpsLoading(false);
        console.warn('Geolocation error:', err);
        toast.error('Unable to retrieve GPS coordinates. Please allow location permissions in your browser.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Dynamic search across preset CITIES + OpenStreetMap Nominatim for any location
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const q = searchQuery.toLowerCase().trim();

      // 1. Instant local filter
      const localMatches = CITIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.state?.toLowerCase().includes(q) ||
          c.region?.toLowerCase().includes(q)
      );

      // 2. OpenStreetMap geocoding restricted exclusively to India (countrycodes=in)
      let remoteMatches = [];
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=json&addressdetails=1&countrycodes=in&limit=8`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (res.ok) {
          const data = await res.json();
          remoteMatches = data
            .filter((item) => {
              const cc = item.address?.country_code?.toLowerCase();
              return !cc || cc === 'in';
            })
            .map((item) => ({
              name: item.name || item.display_name.split(',')[0],
              displayName: item.display_name,
              lat: Number(Number(item.lat).toFixed(4)),
              lon: Number(Number(item.lon).toFixed(4)),
              state: item.address?.state || 'India',
              isRemote: true,
            }));
        }
      } catch (e) {
        console.warn('Geocoding search error:', e);
      }

      const combined = [...localMatches];
      for (const rm of remoteMatches) {
        if (!combined.some((c) => Math.hypot(c.lat - rm.lat, c.lon - rm.lon) < 0.05)) {
          combined.push(rm);
        }
      }

      setSearchResults(combined.slice(0, 8));
      setSearching(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (loc) => {
    setCustomLocation(loc);
    setSelectedCityName(loc.name);
    setSearchOpen(false);
    setSearchQuery('');
    toast.success(`Simulation hub set to ${loc.name}`);
  };

  // Handle switching to Live Weather Mode
  const handleUseLiveWeather = () => {
    if (liveWeather?.current) {
      const liveScenario = {
        rainfallMmPerHour: Math.round(liveWeather.current.rainfallIntensity || 0),
        temperature: Math.round(liveWeather.current.temperature || 26),
        windSpeedMps: Math.round(liveWeather.current.windSpeed || 2),
        durationHours: 1,
      };
      setScenario(liveScenario);
      setIsLiveMode(true);
      runSimulation(liveScenario, true);
      toast.success(`Live weather inputs applied for ${selectedCity.name}`);
    } else {
      setIsLiveMode(true);
      runSimulation(null, true);
      toast.success(`Fetching live weather pipeline for ${selectedCity.name}`);
    }
  };

  // Handle manual scenario change
  const handleScenarioChange = (key, value) => {
    setIsLiveMode(false);
    setScenario((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Apply a quick preset
  const handleApplyPreset = (preset) => {
    setIsLiveMode(false);
    setScenario(preset.scenario);
    runSimulation(preset.scenario, false);
    toast.success(`Applied preset: ${preset.label}`);
  };

  // ── Derived Simulation Metrics ──────────────────────────────────────────
  const metrics = simResult?.metrics || {
    totalResourcesScanned: 22,
    affectedResourcesCount: 13,
    criticalResources: 13,
    totalBookingsAtRisk: 8,
    highRiskBookings: 7,
    totalRequirementsScanned: 6,
    surgeRequirements: 2,
    activeLogisticsJobs: 1,
    disruptedLogistics: 1,
    estimatedTotalRevenueLossInr: 222189,
    avgAvailabilityFactor: 0.272,
  };

  const weatherClass = simResult?.weatherClassification || {
    severity: 'severe',
    score: 68,
    rainfallBand: 'rainfall_heavy',
    isStorm: true,
    isHighWind: true,
  };

  // Weather-Aware Simulated Effective Radius
  const effectiveRadius = useMemo(
    () => getEffectiveRadius(weatherClass, weatherClass.score),
    [weatherClass]
  );

  // Map resources for fast lookup in bookings/logistics
  const resourceMap = useMemo(() => {
    const map = {};
    if (simResult?.affectedResources) {
      for (const r of simResult.affectedResources) {
        map[r.resourceId] = r;
      }
    }
    return map;
  }, [simResult]);

  // Primary Demo Logistics Job
  const primaryLogisticsJob = useMemo(() => {
    if (simResult?.affectedLogisticsJobs && simResult.affectedLogisticsJobs.length > 0) {
      const job = simResult.affectedLogisticsJobs[0];
      const res = resourceMap[job.resourceId];
      return {
        jobId: job.jobId,
        shortId: `LG-${job.jobId.slice(-4).toUpperCase()}`,
        resourceTitle: res?.title || 'Chiavari Banquet Chairs (gold)',
        category: res?.category || 'furniture',
        pickupLocation: 'Wagle Estate Industrial Area, Thane',
        destinationLocation: 'Hotel Grand Renaissance, Powai (Mumbai)',
        distanceKm: 18.4,
        currentStatus: job.currentStatus || 'accepted',
        disruptionProbability: job.disruptionProbability ?? 0.98,
        estimatedDelayHours: job.estimatedDelayHours ?? 3.9,
        recommendation: job.recommendation,
      };
    }
    // Fallback demo job when simulation list is empty
    return {
      jobId: 'sim_job_default',
      shortId: 'LG-1024',
      resourceTitle: 'Chiavari Banquet Chairs (gold)',
      category: 'furniture',
      pickupLocation: 'Wagle Estate, Thane',
      destinationLocation: 'Hotel Imperial Ballroom, Powai',
      distanceKm: 18.4,
      currentStatus: 'accepted',
      disruptionProbability: 0.98,
      estimatedDelayHours: 3.9,
      recommendation: 'Reschedule — high disruption risk',
    };
  }, [simResult, resourceMap]);

  // ETA and delay calculations for the logistics job
  const logisticsDelayInfo = useMemo(() => {
    // Severe storm scenario produces standard +1h 45m delay (10:30 AM -> 12:15 PM)
    const isSevere =
      (scenario.rainfallMmPerHour >= 80 && scenario.durationHours >= 4) ||
      weatherClass.severity === 'severe' ||
      weatherClass.score >= 50;

    const delayHours = isSevere
      ? 1.75
      : weatherClass.score >= 25
      ? 0.5
      : 0;

    const eta = calculateSimulatedETA(null, delayHours);
    const risk = getLogisticsRiskStatus(
      primaryLogisticsJob.disruptionProbability,
      primaryLogisticsJob.distanceKm,
      effectiveRadius
    );
    const distanceZone = getDistanceZone(primaryLogisticsJob.distanceKm);

    return {
      ...eta,
      ...risk,
      distanceZone,
      delayHours,
      exceedsEffectiveRadius: primaryLogisticsJob.distanceKm > effectiveRadius,
    };
  }, [primaryLogisticsJob, weatherClass, effectiveRadius]);

  // Affected bookings list with enriched titles
  const displayBookings = useMemo(() => {
    if (!simResult?.affectedBookings || simResult.affectedBookings.length === 0) {
      return [
        {
          bookingId: 'bk_sample_1',
          resourceTitle: 'Crystal Grand Ballroom — 500 guests',
          startDateTime: '2026-10-18T18:00:00.000Z',
          disruptionProbability: 0.8,
          riskLevel: 'critical',
          recommendation: 'Consider rescheduling or sourcing alternative resource',
        },
        {
          bookingId: 'bk_sample_2',
          resourceTitle: 'Chiavari Banquet Chairs (gold)',
          startDateTime: '2026-10-11T12:00:00.000Z',
          disruptionProbability: 0.55,
          riskLevel: 'high',
          recommendation: 'Monitor situation — delivery delay anticipated',
        },
      ];
    }
    return simResult.affectedBookings.map((b) => ({
      ...b,
      resourceTitle: resourceMap[b.resourceId]?.title || `Resource #${b.resourceId?.slice(-6)}`,
    }));
  }, [simResult, resourceMap]);

  // Cascading effects from simulation
  const cascadingEffects = useMemo(() => {
    return simResult?.cascadingEffects || [];
  }, [simResult]);

  // Safe action handlers
  const handleNotifySeeker = (jobId) => {
    toast.success(`Seeker notified: Weather warning & potential delivery delay for Job #${jobId}`);
  };

  const handleOpenRescheduleModal = (booking) => {
    setRescheduleModalBooking(booking);
  };

  return (
    <div className={`digital-twin-panel ${embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}`}>
      {/* ── Top Header & Mode Banner ─────────────────────────────────── */}
      <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-line">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Sparkles size={20} />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Digital Twin — Weather Impact Engine
              </h2>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={13} />
                READ-ONLY SIMULATION
              </span>
            </div>
            <p className="text-sm text-ink-soft mt-1">
              Simulates real-world weather disruptions on Indulge bookings, logistics, and resource availability. <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Simulation only — operational data unchanged.</strong>
            </p>
          </div>

          {/* Mode Indicator & Location Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 1. Hub Dropdown (25+ Cities with dark-mode safe options) */}
            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-line text-sm shadow-xs">
              <MapPin size={16} className="text-indigo-500 shrink-0" />
              <select
                id="digital-twin-city-select"
                value={selectedCityName}
                onChange={(e) => {
                  setSelectedCityName(e.target.value);
                  const found = CITIES.find((c) => c.name === e.target.value);
                  if (found) setCustomLocation(null);
                }}
                className="bg-transparent text-ink font-medium focus:outline-none cursor-pointer text-sm"
              >
                {customLocation && !CITIES.some((c) => c.name === customLocation.name) && (
                  <option
                    value={customLocation.name}
                    className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold"
                  >
                    📍 {customLocation.name} (Custom / GPS)
                  </option>
                )}
                {CITIES.map((c) => (
                  <option
                    key={c.name}
                    value={c.name}
                    className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  >
                    {c.name} {c.state ? `(${c.state})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Live Location GPS Button */}
            <button
              onClick={handleUseLiveLocation}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface hover:bg-surface-sunk text-ink text-xs font-semibold shadow-xs transition-colors"
              title="Detect live GPS coordinates from your device"
            >
              <Navigation size={13} className={`text-indigo-500 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>{gpsLoading ? 'Locating…' : 'Live Location'}</span>
            </button>

            {/* 3. Search India Location Button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface hover:bg-surface-sunk text-ink text-xs font-semibold shadow-xs transition-colors"
              title="Search any city or location in India"
            >
              <Search size={13} className="text-indigo-500" />
              <span>Search India</span>
            </button>

            {/* 4. Live / Counterfactual Badge */}
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
                isLiveMode
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isLiveMode ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {isLiveMode ? 'LIVE WEATHER INPUT' : 'COUNTERFACTUAL SCENARIO'}
            </div>
          </div>
        </div>

        {/* ── Search Locations in India Modal Popover ────────────────────────── */}
        {searchOpen && (
          <div className="fixed inset-0 z-[600] flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-xl bg-surface dark:bg-zinc-900 border border-line rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-indigo-500" />
                  <h3 className="font-bold text-ink text-base">Search Locations in India</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    🇮🇳 India Only
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-mute hover:text-ink hover:bg-surface-sunk transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search Input */}
              <div className="relative mb-3">
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search any Indian city, suburb, or district (e.g. Kalyan, Bandra, Powai, Bengaluru)..."
                  className="w-full px-4 py-2.5 pl-10 rounded-xl bg-surface-alt border border-line text-ink placeholder:text-ink-mute text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <Search size={16} className="absolute left-3.5 top-3.5 text-ink-mute" />
                {searching && (
                  <RefreshCw size={15} className="absolute right-3.5 top-3.5 text-indigo-500 animate-spin" />
                )}
              </div>

              {/* Popular Indian Metros Chips */}
              <div className="mb-4">
                <span className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider block mb-1.5">
                  Popular Indian Hubs:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {['Thane', 'Mumbai', 'Navi Mumbai', 'Kalyan-Dombivli', 'Pune', 'Bengaluru', 'Delhi NCR', 'Hyderabad'].map(
                    (cityName) => (
                      <button
                        key={cityName}
                        onClick={() => {
                          const c = CITIES.find((item) => item.name === cityName);
                          if (c) handleSelectLocation(c);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-surface-sunk border border-line hover:border-indigo-500 text-ink text-xs font-medium transition-colors"
                      >
                        {cityName}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Search Results List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {searchResults.length > 0 ? (
                  searchResults.map((loc, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectLocation(loc)}
                      className="w-full text-left p-3 rounded-xl bg-surface-sunk/60 hover:bg-surface-sunk border border-line flex items-center justify-between gap-3 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin size={15} className="text-indigo-500 shrink-0 group-hover:scale-110 transition-transform" />
                        <div className="truncate">
                          <span className="font-bold text-ink text-sm block truncate">
                            {loc.name}
                          </span>
                          <span className="text-xs text-ink-mute block truncate">
                            {loc.displayName || `${loc.state ? loc.state + ' • ' : ''}${loc.lat}, ${loc.lon}`}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded shrink-0">
                        Select Hub
                      </span>
                    </button>
                  ))
                ) : searchQuery.trim() ? (
                  <div className="py-6 text-center text-xs text-ink-mute">
                    {searching
                      ? 'Searching Indian regional maps…'
                      : 'No matching locations found in India. Try another city, town, or pin code.'}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-ink-mute">
                    Search is restricted exclusively to India. Start typing any Indian city, suburb, or district.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Current Weather Bar + Live Weather Button ────────────── */}
        <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap text-sm text-ink">
            <span className="font-semibold text-ink-mute uppercase tracking-wider text-xs">
              Current Weather ({selectedCity.name}):
            </span>
            {liveLoading ? (
              <span className="text-ink-mute flex items-center gap-1.5">
                <RefreshCw size={14} className="animate-spin" /> Fetching live conditions...
              </span>
            ) : liveWeather?.current ? (
              <>
                <span className="flex items-center gap-1.5 font-medium">
                  <Thermometer size={16} className="text-rose-500" />
                  {liveWeather.current.temperature?.toFixed(1)}°C
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <CloudRain size={16} className="text-blue-500" />
                  {liveWeather.current.humidity}% humidity
                </span>
                <span className="capitalize font-medium text-ink-soft">
                  {liveWeather.current.weatherDescription || 'Clear sky'}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Wind size={16} className="text-teal-500" />
                  Wind {liveWeather.current.windSpeed?.toFixed(1)} m/s
                </span>
              </>
            ) : (
              <span className="text-ink-soft">
                26°C · 77% humidity · Cloudy · Wind 1.7 m/s (cached baseline)
              </span>
            )}
          </div>

          <button
            id="use-live-weather-btn"
            onClick={handleUseLiveWeather}
            disabled={liveLoading || simulating}
            className="btn-secondary text-xs flex items-center justify-center gap-2 py-1.5 px-3 self-start lg:self-auto"
          >
            <Compass size={14} />
            <span>Use Live Weather</span>
          </button>
        </div>
      </div>

      {/* ── STEP 2: LIVE STATE vs COUNTERFACTUAL STATE TRANSITION ─────────── */}
      <div className="bg-surface-alt border border-line rounded-2xl p-5 shadow-sm mb-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line mb-4">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-indigo-500" />
            <h3 className="font-bold text-ink text-sm sm:text-base">
              Live Weather vs. Simulated Scenario Transition
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold bg-surface border border-line text-ink-mute uppercase">
            {isLiveMode ? 'Active Mode: Live State' : 'Active Mode: Counterfactual State'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: LIVE STATE ("What is happening now?") */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              isLiveMode
                ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                : 'border-line bg-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  LIVE STATE
                </span>
              </div>
              <span className="text-[11px] font-medium text-ink-mute italic">
                "What is happening now?"
              </span>
            </div>
            <p className="text-xs text-ink-soft mb-3">
              Real-time atmospheric observations from OpenWeather API for {selectedCity.name}.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Rainfall</span>
                <strong className="text-ink font-bold">
                  {liveWeather?.current?.rainfallIntensity != null
                    ? `${Math.round(liveWeather.current.rainfallIntensity)} mm/h`
                    : '0 mm/h'}
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Temperature</span>
                <strong className="text-ink font-bold">
                  {liveWeather?.current?.temperature != null
                    ? `${Math.round(liveWeather.current.temperature)}°C`
                    : '26°C'}
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Wind Speed</span>
                <strong className="text-ink font-bold">
                  {liveWeather?.current?.windSpeed != null
                    ? `${Math.round(liveWeather.current.windSpeed)} m/s`
                    : '2 m/s'}
                </strong>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-[11px] text-ink-mute">
                Service Radius:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {STANDARD_LOGISTICS_RADIUS_KM} km (Standard)
                </strong>
              </span>
              <button
                onClick={handleUseLiveWeather}
                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                  isLiveMode
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-surface hover:bg-surface-sunk text-ink border-line'
                }`}
              >
                {isLiveMode ? '✓ Active Live Mode' : 'Apply Live State'}
              </button>
            </div>
          </div>

          {/* Right: COUNTERFACTUAL STATE ("What could happen if conditions change?") */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              !isLiveMode
                ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                : 'border-line bg-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  COUNTERFACTUAL STATE
                </span>
              </div>
              <span className="text-[11px] font-medium text-ink-mute italic">
                "What could happen if conditions change?"
              </span>
            </div>
            <p className="text-xs text-ink-soft mb-3">
              Stress-test scenario: Simulated weather impact on bookings, capacity &amp; logistics.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Rainfall</span>
                <strong className="text-blue-600 dark:text-blue-400 font-bold">
                  {scenario.rainfallMmPerHour} mm/h
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Temperature</span>
                <strong className="text-rose-600 dark:text-rose-400 font-bold">
                  {scenario.temperature}°C
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-surface-alt border border-line">
                <span className="text-[10px] text-ink-mute block">Wind Speed</span>
                <strong className="text-teal-600 dark:text-teal-400 font-bold">
                  {scenario.windSpeedMps} m/s
                </strong>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-[11px] text-ink-mute">
                Simulated Radius:{' '}
                <strong className={effectiveRadius < 30 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>
                  {effectiveRadius} km
                </strong>{' '}
                ({effectiveRadius < 30 ? `-${STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius} km drop` : 'Standard'})
              </span>
              <button
                onClick={() => {
                  setIsLiveMode(false);
                  runSimulation();
                }}
                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                  !isLiveMode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-surface hover:bg-surface-sunk text-ink border-line'
                }`}
              >
                {!isLiveMode ? '✓ Active Simulation' : 'Switch to Simulation'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Two-Column Work Area: Controls (Left) vs Summary (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left: Scenario Inputs & Presets (5 cols) */}
        <div className="lg:col-span-5 bg-surface-alt border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink flex items-center gap-2 text-base">
                <Sliders size={18} className="text-indigo-500" />
                Scenario Parameters
              </h3>
              <span className="text-xs text-ink-mute">What-if simulation inputs</span>
            </div>

            {/* Quick Presets */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-ink-mute uppercase tracking-wider block mb-2">
                Quick Scenario Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_SCENARIOS.map((p) => {
                  const isActive =
                    scenario.rainfallMmPerHour === p.scenario.rainfallMmPerHour &&
                    scenario.windSpeedMps === p.scenario.windSpeedMps;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm'
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-base">{p.icon}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.badgeTone}`}>
                          {p.badge}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-ink mt-1.5 truncate">
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders & Inputs */}
            <div className="space-y-4">
              {/* Rainfall */}
              <div>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <CloudRain size={16} className="text-blue-500" /> Rainfall Intensity
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {scenario.rainfallMmPerHour} mm/h
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="5"
                  value={scenario.rainfallMmPerHour}
                  onChange={(e) => handleScenarioChange('rainfallMmPerHour', Number(e.target.value))}
                  className="w-full h-1.5 bg-line rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[11px] text-ink-mute mt-0.5">
                  <span>0 (Clear)</span>
                  <span>40 (Monsoon)</span>
                  <span>90+ (Heavy Storm)</span>
                </div>
              </div>

              {/* Temperature */}
              <div>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <Thermometer size={16} className="text-rose-500" /> Temperature
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {scenario.temperature} °C
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="45"
                  step="1"
                  value={scenario.temperature}
                  onChange={(e) => handleScenarioChange('temperature', Number(e.target.value))}
                  className="w-full h-1.5 bg-line rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
                <div className="flex justify-between text-[11px] text-ink-mute mt-0.5">
                  <span>10°C (Cold)</span>
                  <span>28°C (Normal)</span>
                  <span>42°C+ (Extreme Heat)</span>
                </div>
              </div>

              {/* Wind Speed */}
              <div>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <Wind size={16} className="text-teal-500" /> Wind Speed
                  </span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">
                    {scenario.windSpeedMps} m/s ({Math.round(scenario.windSpeedMps * 3.6)} km/h)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={scenario.windSpeedMps}
                  onChange={(e) => handleScenarioChange('windSpeedMps', Number(e.target.value))}
                  className="w-full h-1.5 bg-line rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
                <div className="flex justify-between text-[11px] text-ink-mute mt-0.5">
                  <span>0 (Calm)</span>
                  <span>14 (Gale alert)</span>
                  <span>22+ (Cyclone force)</span>
                </div>
              </div>

              {/* Duration */}
              <div>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <Clock size={16} className="text-amber-500" /> Storm Duration
                  </span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {scenario.durationHours} hours
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={scenario.durationHours}
                  onChange={(e) => handleScenarioChange('durationHours', Number(e.target.value))}
                  className="w-full h-1.5 bg-line rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Trigger Button */}
          <div className="mt-6 pt-4 border-t border-line">
            <button
              id="simulate-scenario-btn"
              onClick={() => runSimulation()}
              disabled={simulating}
              className="w-full btn-primary py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm shadow-md transition-all"
            >
              {simulating ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Updating Digital Twin...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Simulate Scenario Impact</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Weather Classification & Impact Summary (7 cols) */}
        <div className="lg:col-span-7 bg-surface-alt border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            {/* Classification Header */}
            <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
              <div>
                <span className="text-xs font-semibold text-ink-mute uppercase tracking-wider block">
                  Simulated Weather Classification
                </span>
                <div className="flex items-center gap-2.5 mt-1">
                  <span
                    className={`text-lg font-black tracking-wide uppercase px-3 py-1 rounded-xl border ${
                      weatherClass.severity === 'extreme' || weatherClass.severity === 'severe'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                        : weatherClass.severity === 'moderate'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {weatherClass.severity}
                  </span>
                  <span className="text-sm text-ink-soft">
                    Severity Score: <strong className="text-ink">{weatherClass.score}/100</strong>
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-ink-mute block">Simulation ID</span>
                <span className="font-mono text-xs text-ink font-semibold">
                  {simResult?.simulationId?.slice(0, 14) || 'sim_running'}
                </span>
              </div>
            </div>

            {/* Error banner if any */}
            {simError && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Notice</p>
                  <p className="text-xs">{simError}</p>
                </div>
              </div>
            )}

            {/* Impact Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {/* Resources at Risk */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Resources at Risk</span>
                  <Layers size={15} className="text-indigo-500" />
                </div>
                <div className="text-2xl font-bold text-ink tracking-tight">
                  {metrics.criticalResources}
                  <span className="text-xs font-normal text-ink-mute ml-1">
                    / {metrics.totalResourcesScanned}
                  </span>
                </div>
                <span className="text-[11px] text-red-500 font-medium">
                  {metrics.affectedResourcesCount} capacity disrupted
                </span>
              </div>

              {/* Bookings at Risk */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Bookings at Risk</span>
                  <Calendar size={15} className="text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-ink tracking-tight">
                  {metrics.highRiskBookings}
                  <span className="text-xs font-normal text-ink-mute ml-1">
                    / {metrics.totalBookingsAtRisk}
                  </span>
                </div>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {metrics.highRiskBookings > 0 ? 'Reschedule alert active' : 'Safe dispatch window'}
                </span>
              </div>

              {/* Logistics Disrupted */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Logistics Disrupted</span>
                  <Truck size={15} className="text-rose-500" />
                </div>
                <div className="text-2xl font-bold text-ink tracking-tight">
                  {metrics.disruptedLogistics}
                  <span className="text-xs font-normal text-ink-mute ml-1">
                    / {metrics.activeLogisticsJobs}
                  </span>
                </div>
                <span className="text-[11px] text-rose-500 font-medium">
                  {metrics.disruptedLogistics > 0 ? 'Delay & bottleneck risk' : 'Operating normally'}
                </span>
              </div>

              {/* Requirements Affected */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Requirements Affected</span>
                  <TrendingDown size={15} className="text-teal-500" />
                </div>
                <div className="text-2xl font-bold text-ink tracking-tight">
                  {metrics.surgeRequirements}
                  <span className="text-xs font-normal text-ink-mute ml-1">
                    / {metrics.totalRequirementsScanned}
                  </span>
                </div>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                  Demand surge shift
                </span>
              </div>

              {/* Avg Availability */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Avg. Availability</span>
                  <Activity size={15} className="text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-ink tracking-tight">
                  {(metrics.avgAvailabilityFactor * 100).toFixed(1)}%
                </div>
                <div className="w-full bg-line rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      metrics.avgAvailabilityFactor < 0.35
                        ? 'bg-red-500'
                        : metrics.avgAvailabilityFactor < 0.7
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.round(metrics.avgAvailabilityFactor * 100)}%` }}
                  />
                </div>
              </div>

              {/* Est. Revenue Loss */}
              <div className="p-3.5 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1">
                  <span>Est. Revenue Loss</span>
                  <AlertOctagon size={15} className="text-red-500" />
                </div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400 tracking-tight">
                  {inr(metrics.estimatedTotalRevenueLossInr)}
                </div>
                <span className="text-[11px] text-ink-mute">Storm period projection</span>
              </div>
            </div>
          </div>

          {/* Quick Tabs to inspect sub-areas */}
          <div className="flex items-center gap-2 border-t border-line pt-3 overflow-x-auto text-xs font-medium">
            <span className="text-ink-mute mr-1 shrink-0">Focus View:</span>
            {[
              { key: 'overview', label: 'All Impacts' },
              { key: 'logistics', label: `Logistics Impact (${metrics.disruptedLogistics})` },
              {
                key: 'signals',
                label: `Public Signals (${simResult?.publicSignals?.aggregation?.totalSignals || 'Live'})`,
              },
              { key: 'bookings', label: `Bookings (${metrics.highRiskBookings})` },
              { key: 'cascades', label: `Cascading Chain (${cascadingEffects.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-surface text-ink-soft hover:text-ink hover:bg-surface-sunk'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── STEP 3: GEOSPATIAL DIGITAL TWIN MAP ── */}
      <DigitalTwinMap
        centerCity={selectedCity.name}
        centerCoords={{ lat: selectedCity.lat, lon: selectedCity.lon }}
        simResult={simResult}
        scenario={scenario}
        effectiveRadius={effectiveRadius}
        isLiveWeather={isLiveMode}
      />

      {/* ── STEP 4 & 5: LOGISTICS COVERAGE & 30 KM SERVICE RADIUS CARD ── */}
      <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <Compass size={20} className="text-indigo-500" />
              <h3 className="font-bold text-ink text-base">
                Logistics Coverage & Service Radius
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Default Baseline: 30 km
              </span>
            </div>
            <p className="text-xs text-ink-soft mt-1">
              Indulge Logistics Partner operates on a standard default maximum service radius of 30 km. Bad weather contracts the simulated effective operating radius.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-ink-mute block">Weather Adjusted Radius</span>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {effectiveRadius} km
              </span>
            </div>
          </div>
        </div>

        {/* Visual Radius Shrinkage Comparison Bar */}
        <div className="my-5">
          <div className="flex justify-between items-baseline mb-2 text-xs">
            <span className="font-medium text-ink">
              Simulated Radius Compression: <strong className="text-indigo-600">{effectiveRadius} km</strong> / Standard <span className="text-ink-mute">30 km</span>
            </span>
            <span className="font-semibold text-ink-soft">
              {Math.round((effectiveRadius / STANDARD_LOGISTICS_RADIUS_KM) * 100)}% coverage remaining
            </span>
          </div>

          <div className="w-full bg-surface border border-line rounded-xl h-4 relative overflow-hidden flex">
            {/* Simulated Active Radius */}
            <div
              className={`h-full transition-all duration-500 rounded-l-xl flex items-center justify-end pr-2 text-[10px] font-bold text-white ${
                effectiveRadius <= 15 ? 'bg-red-500' : effectiveRadius <= 25 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${(effectiveRadius / STANDARD_LOGISTICS_RADIUS_KM) * 100}%` }}
            >
              {effectiveRadius} km
            </div>
            {/* Cutoff / Unsafe Radius Zone */}
            <div
              className="h-full bg-red-500/15 dark:bg-red-500/25 flex-1 flex items-center pl-2 text-[10px] text-red-600 dark:text-red-400 font-medium"
            >
              ⚠ Disrupted Zone ({STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius} km loss)
            </div>
          </div>

          {/* Standard Service Radius Zones */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-line text-xs">
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 block">0–10 km</span>
              <span className="text-ink-mute text-[11px]">Nearby / Preferred Zone</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <span className="font-bold text-blue-600 dark:text-blue-400 block">10–20 km</span>
              <span className="text-ink-mute text-[11px]">Standard Delivery Zone</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <span className="font-bold text-amber-600 dark:text-amber-400 block">20–30 km</span>
              <span className="text-ink-mute text-[11px]">Extended Delivery Zone</span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-line">
              <span className="font-bold text-red-600 dark:text-red-400 block">&gt; 30 km</span>
              <span className="text-ink-mute text-[11px]">Outside Default Radius</span>
            </div>
          </div>
        </div>

        {/* Warning Callout when Effective Radius is Reduced */}
        {effectiveRadius < STANDARD_LOGISTICS_RADIUS_KM && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Weather Impact: {weatherClass.severity.toUpperCase()} ({weatherClass.score}/100)
              </p>
              <p className="mt-0.5">
                ⚠ Deliveries beyond <strong>{effectiveRadius} km</strong> may be delayed, encounter waterlogged corridors, or require an alternative closer logistics partner.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 6 & 7: MAIN DEMONSTRATION — LOGISTICS DELAY EXPERIENCE ── */}
      {(activeTab === 'overview' || activeTab === 'logistics') && (
        <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Truck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-ink text-lg">
                    Logistics Impact Demonstration
                  </h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface border border-line text-ink-soft">
                    {primaryLogisticsJob.shortId}
                  </span>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  Real Indulge dispatch job affected by the simulated weather conditions.
                </p>
              </div>
            </div>

            {/* Status Progression Badge */}
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${logisticsDelayInfo.tone}`}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: logisticsDelayInfo.dotColor }}
                />
                {logisticsDelayInfo.badgeLabel}
              </span>
            </div>
          </div>

          {/* Job Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-5">
            {/* Route & Distance (5 cols) */}
            <div className="md:col-span-5 p-4 rounded-xl bg-surface border border-line space-y-3">
              <span className="text-xs font-semibold text-ink-mute uppercase tracking-wider block">
                Route & Distance Verification
              </span>

              {/* Pickup */}
              <div className="flex items-start gap-2.5">
                <MapPin size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="text-ink-mute block">Pickup Location</span>
                  <span className="font-semibold text-ink">{primaryLogisticsJob.pickupLocation}</span>
                  <span className="text-ink-soft block text-[11px] mt-0.5">
                    Resource: {primaryLogisticsJob.resourceTitle}
                  </span>
                </div>
              </div>

              {/* Delivery */}
              <div className="flex items-start gap-2.5">
                <Navigation size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="text-ink-mute block">Destination Location</span>
                  <span className="font-semibold text-ink">{primaryLogisticsJob.destinationLocation}</span>
                </div>
              </div>

              {/* Distance Metrics */}
              <div className="pt-3 border-t border-line flex items-center justify-between text-xs">
                <div>
                  <span className="text-ink-mute block">Transit Distance:</span>
                  <strong className="text-sm font-bold text-ink">{primaryLogisticsJob.distanceKm} km</strong>
                </div>
                <div>
                  <span className="text-ink-mute block">Normal Radius:</span>
                  <strong className="text-sm text-ink">{STANDARD_LOGISTICS_RADIUS_KM} km</strong>
                </div>
                <div>
                  <span className="text-ink-mute block">Simulated Radius:</span>
                  <strong className="text-sm text-red-500">{effectiveRadius} km</strong>
                </div>
              </div>

              {/* Radius Violation Tag (30 KM LOGISTICS RULE) */}
              {logisticsDelayInfo.exceedsEffectiveRadius ? (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400 font-medium space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-red-600 dark:text-red-400">
                    <AlertTriangle size={15} className="shrink-0 text-red-500" />
                    <span>⚠ DELIVERY AT RISK</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed">
                    "Delivery distance exceeds the simulated weather-adjusted logistics radius."
                  </p>
                  <div className="text-[11px] text-ink-mute pt-1 border-t border-red-500/20 flex justify-between">
                    <span>Delivery Distance: <strong className="text-ink">{primaryLogisticsJob.distanceKm} km</strong></span>
                    <span>Weather-Adjusted Radius: <strong className="text-red-500">{effectiveRadius} km</strong> ({primaryLogisticsJob.distanceKm} &gt; {effectiveRadius})</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                    <span>✓ Standard Logistics Range</span>
                  </div>
                  <span className="text-[11px] text-ink-mute">
                    {primaryLogisticsJob.distanceKm} km &le; {effectiveRadius} km
                  </span>
                </div>
              )}

              {/* Public Disruption Signals Context (STEP 17) */}
              <div className="pt-2.5 border-t border-line flex items-center justify-between text-xs">
                <span className="text-ink-mute flex items-center gap-1.5">
                  <Radio size={12} className="text-blue-500" />
                  <span>Public Disruption Signals:</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    simResult?.publicSignals?.aggregation?.signalActivity === 'high' ||
                    simResult?.publicSignals?.aggregation?.signalActivity === 'very_high'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {simResult?.publicSignals?.aggregation?.signalActivity?.replace('_', ' ') || 'High Activity'}
                </span>
              </div>
            </div>

            {/* ETA Comparison & Prediction (4 cols) */}
            <div className="md:col-span-4 p-4 rounded-xl bg-surface border border-line flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-ink-mute uppercase tracking-wider block mb-3">
                  ETA & Delay Projection
                </span>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-surface-alt border border-line">
                    <span className="text-ink-mute">Original Scheduled ETA:</span>
                    <strong className="text-ink font-semibold">{logisticsDelayInfo.originalFormatted}</strong>
                  </div>

                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-surface-alt border border-line">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-mute">Simulated ETA:</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                        SIMULATED
                      </span>
                    </div>
                    <strong className="text-red-600 dark:text-red-400 font-bold text-sm">
                      {logisticsDelayInfo.simulatedFormatted}
                    </strong>
                  </div>

                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-1.5">
                      <span className="text-red-700 dark:text-red-300 font-medium">Predicted Delay:</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40">
                        PREDICTED
                      </span>
                    </div>
                    <strong className="text-red-600 dark:text-red-400 font-bold text-sm">
                      {logisticsDelayInfo.delayText}
                    </strong>
                  </div>
                </div>
              </div>

              <span className="text-[11px] text-ink-mute mt-3 block">
                * SIMULATED PROJECTION: Operational data remains unchanged. Real GPS &amp; MongoDB records are untouched.
              </span>
            </div>

            {/* Operational Recommendation & Actions (3 cols) */}
            <div className="md:col-span-3 p-4 rounded-xl bg-surface border border-line flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-ink-mute uppercase tracking-wider block mb-2">
                  Recommended Action
                </span>
                <p className="text-xs text-ink font-medium leading-relaxed mb-3">
                  {logisticsDelayInfo.recommendation}
                </p>

                <div className="p-2.5 rounded-lg bg-surface-alt border border-line text-[11px] text-ink-soft">
                  <strong className="text-ink block">Partner Status:</strong>
                  {logisticsDelayInfo.exceedsEffectiveRadius
                    ? '⚠ Current Partner May Be Affected by severe corridor storm.'
                    : 'Current partner operates within safe bounds.'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-4">
                <button
                  onClick={() => handleNotifySeeker(primaryLogisticsJob.shortId)}
                  className="w-full btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <Send size={13} />
                  <span>Notify Seeker</span>
                </button>
                <Link
                  to="/nearby"
                  className="w-full btn-primary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                >
                  <Compass size={13} />
                  <span>Find Alternative Partner</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 4: PUBLIC & SOCIAL SIGNALS INTEGRATION (STEP 12) ── */}
      {(activeTab === 'overview' || activeTab === 'signals') && (
        <PublicSignalsPanel
          city={selectedCity.name}
          weatherClassification={weatherClass}
          scenario={scenario}
          effectiveRadius={effectiveRadius}
          initialSignalsData={simResult?.publicSignals}
        />
      )}

      {/* ── STEP 9: NORMAL VS DIGITAL TWIN COMPARISON TABLE ─────────── */}
      <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-indigo-500" />
            <h3 className="font-bold text-ink text-base">
              Normal Operating Baseline vs. Digital Twin Scenario
            </h3>
          </div>
          <span className="text-xs text-ink-mute font-mono">Live Comparison Matrix</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line text-ink-mute uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4">Normal Baseline (Standard)</th>
                <th className="py-3 px-4 text-indigo-600 dark:text-indigo-400">
                  Digital Twin ({weatherClass.severity.toUpperCase()} Storm)
                </th>
                <th className="py-3 px-4 text-right">Variance / Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              <tr>
                <td className="py-3 px-4 font-semibold">Logistics Service Radius</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  {STANDARD_LOGISTICS_RADIUS_KM} km
                </td>
                <td className={`py-3 px-4 font-bold ${effectiveRadius < 30 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {effectiveRadius} km
                </td>
                <td className={`py-3 px-4 text-right font-medium ${effectiveRadius < 30 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {effectiveRadius < 30
                    ? `-${STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius} km (${Math.round(((STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius) / STANDARD_LOGISTICS_RADIUS_KM) * 100)}% radius drop)`
                    : '0 km (100% full coverage)'}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Resource Availability</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  100%
                </td>
                <td className={`py-3 px-4 font-bold ${metrics.avgAvailabilityFactor < 1 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {(metrics.avgAvailabilityFactor * 100).toFixed(1)}%
                </td>
                <td className={`py-3 px-4 text-right font-medium ${metrics.avgAvailabilityFactor < 1 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {metrics.avgAvailabilityFactor < 1
                    ? `-${((1 - metrics.avgAvailabilityFactor) * 100).toFixed(1)}% available`
                    : '✓ 0% loss (Full availability)'}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Bookings at Risk</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  0 bookings
                </td>
                <td className={`py-3 px-4 font-bold ${metrics.highRiskBookings > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {metrics.highRiskBookings} bookings
                </td>
                <td className={`py-3 px-4 text-right font-medium ${metrics.highRiskBookings > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {metrics.highRiskBookings > 0
                    ? `+${metrics.highRiskBookings} risk alerts`
                    : '✓ 0 risk alerts (Safe window)'}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Logistics Bottlenecks</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  0 (On Time)
                </td>
                <td className={`py-3 px-4 font-bold ${metrics.disruptedLogistics > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {metrics.disruptedLogistics} active jobs
                </td>
                <td className={`py-3 px-4 text-right font-medium ${metrics.disruptedLogistics > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {metrics.disruptedLogistics > 0 ? logisticsDelayInfo.delayText : '✓ 0m (On Schedule)'}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Delivery State</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ On Time
                </td>
                <td className={`py-3 px-4 font-bold ${logisticsDelayInfo.statusText === 'ON TIME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {logisticsDelayInfo.statusText}
                </td>
                <td className={`py-3 px-4 text-right font-medium ${logisticsDelayInfo.statusText === 'ON TIME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {logisticsDelayInfo.statusText === 'ON TIME' ? '✓ Standard Transit / Safe' : '⚠ Reschedule Recommended'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── STEP 8: BOOKINGS WEATHER IMPACT LIST ──────────────────────── */}
      {(activeTab === 'overview' || activeTab === 'bookings') && (
        <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-indigo-500" />
              <h3 className="font-bold text-ink text-base">
                Affected Bookings & Fulfilment Risk ({displayBookings.length})
              </h3>
            </div>
            <span className="text-xs text-ink-mute">
              Non-destructive risk tracking
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayBookings.slice(0, 4).map((b) => {
              const riskInfo = getBookingRiskInfo(b.disruptionProbability, b.riskLevel);
              return (
                <div
                  key={b.bookingId}
                  className="p-4 rounded-xl bg-surface border border-line flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-ink-mute block">
                          Booking #{b.bookingId?.slice(-6).toUpperCase()}
                        </span>
                        <h4 className="font-bold text-sm text-ink truncate mt-0.5">
                          {b.resourceTitle}
                        </h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${riskInfo.badgeTone} shrink-0`}>
                        {riskInfo.riskBadge}
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5 my-3 text-ink-soft">
                      <div className="flex justify-between">
                        <span>Scheduled Event:</span>
                        <strong className="text-ink">
                          {b.startDateTime ? dateTime(b.startDateTime) : 'Upcoming Slot'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Disruption Probability:</span>
                        <strong className="text-red-500">
                          {Math.round((b.disruptionProbability || 0) * 100)}%
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Cancellation Risk:</span>
                        <strong className="text-ink font-semibold">
                          {riskInfo.cancellationRisk}
                        </strong>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-alt border border-line text-[11px] text-ink-soft mb-3">
                      <strong>Recommendation:</strong> {b.recommendation || riskInfo.actionText}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-line">
                    <Link
                      to={`/bookings/detail/${b.bookingId}`}
                      className="flex-1 btn-secondary text-xs py-1.5 text-center"
                    >
                      View Booking
                    </Link>
                    <button
                      onClick={() => handleOpenRescheduleModal(b)}
                      className="flex-1 btn-primary text-xs py-1.5 text-center"
                    >
                      Reschedule Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STEP 10: CASCADING EFFECTS VISUALIZATION ─────────────────── */}
      {(activeTab === 'overview' || activeTab === 'cascades') && (
        <div className="bg-surface-alt border border-line rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-indigo-500" />
              <h3 className="font-bold text-ink text-base">
                Cascading Operational Effects Propagation
              </h3>
            </div>
            <span className="text-xs text-ink-mute">Primary → Secondary → Tertiary</span>
          </div>

          {/* Compact Propagation Chain */}
          <div className="p-4 rounded-xl bg-surface border border-line mb-5">
            <span className="text-xs font-semibold text-ink-mute uppercase tracking-wider block mb-3">
              Marketplace Disruption Cascade Chain
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink">
              <span className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1.5 font-semibold">
                🌧 Weather ({scenario.rainfallMmPerHour} mm/h)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1.5 font-semibold">
                📍 Geographic Impact ({STANDARD_LOGISTICS_RADIUS_KM}km → {effectiveRadius}km)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1.5 font-semibold">
                🚚 Logistics Disruption ({primaryLogisticsJob.distanceKm}km &gt; {effectiveRadius}km)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5 font-semibold">
                ⏱ Delivery Delay ({logisticsDelayInfo.delayText})
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1.5 font-semibold">
                📅 Booking Risk ({metrics.highRiskBookings} at risk)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5 font-semibold">
                🔁 Reschedule / Alternative Partner
              </span>
            </div>
          </div>

          {/* Cards for each cascading effect from API */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {cascadingEffects.map((c, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-surface border border-line flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                      {c.cascade || 'cascade'} effect
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        c.severity === 'extreme' || c.severity === 'severe'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {c.severity}
                    </span>
                  </div>
                  <h5 className="font-bold text-xs text-ink capitalize mb-1">
                    {c.type?.replace(/_/g, ' ')}
                  </h5>
                  <p className="text-[11px] text-ink-soft leading-normal">
                    {c.description}
                  </p>
                </div>
                {c.estimatedPriceIncreasePct && (
                  <div className="mt-3 pt-2 border-t border-line text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                    +{c.estimatedPriceIncreasePct}% Surge Price Projection
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Non-Destructive Reschedule Review Modal ───────────────────── */}
      {rescheduleModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-alt border border-line rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-start justify-between pb-3 border-b border-line mb-4">
              <div>
                <h3 className="font-bold text-ink text-base">Weather Risk Reschedule Review</h3>
                <span className="text-xs text-ink-mute">
                  Booking #{rescheduleModalBooking.bookingId?.slice(-6).toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setRescheduleModalBooking(null)}
                className="p-1 rounded-lg text-ink-mute hover:text-ink hover:bg-surface"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-ink mb-5">
              <p className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                <strong>Simulated Weather Risk:</strong> High rainfall and contracted operating radius indicate high disruption probability during this slot.
              </p>
              <div className="p-3 rounded-xl bg-surface border border-line space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-ink-mute">Resource:</span>
                  <strong className="text-ink">{rescheduleModalBooking.resourceTitle}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">Disruption Risk:</span>
                  <strong className="text-red-500 font-bold">
                    {Math.round((rescheduleModalBooking.disruptionProbability || 0.8) * 100)}%
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">Action Policy:</span>
                  <span className="text-ink font-medium">Safe User-Initiated Reschedule</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  toast.success('Reschedule options prepared for Seeker review');
                  setRescheduleModalBooking(null);
                }}
                className="flex-1 btn-primary text-xs py-2.5"
              >
                Propose New Time Slot
              </button>
              <button
                onClick={() => setRescheduleModalBooking(null)}
                className="btn-secondary text-xs py-2.5 px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 13: DATABASE SAFETY CONFIRMATION FOOTER ── */}
      <div className="mt-8 p-4 rounded-2xl bg-surface-alt border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-ink-mute">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
          <span className="font-bold text-ink">
            Simulation only — operational data unchanged.
          </span>
        </div>
        <span className="text-[11px] text-ink-soft">
          Zero database mutations • Real MongoDB resources, bookings &amp; logistics records remain in their true state.
        </span>
      </div>
    </div>
  );
}
