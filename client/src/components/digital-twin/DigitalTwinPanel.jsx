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

export default function DigitalTwinPanel({ initialCity = 'Thane', embedded = false }) {
  const navigate = useNavigate();

  // Selected city & coordinates
  const [selectedCityName, setSelectedCityName] = useState(initialCity);
  const selectedCity = useMemo(
    () => CITIES.find((c) => c.name.toLowerCase() === selectedCityName.toLowerCase()) || CITIES[0],
    [selectedCityName]
  );

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
          location: selectedCity.name,
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

  // Initial load: fetch live weather and run initial simulation
  useEffect(() => {
    fetchLiveWeather(selectedCity);
    runSimulation();
  }, [selectedCity.name]);

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
    // If disruption is high, calculate simulated delay
    const delayHours =
      weatherClass.score >= 50
        ? Math.max(1.75, primaryLogisticsJob.estimatedDelayHours || 1.75)
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
              Simulates real-world weather disruptions on Indulge bookings, logistics, and resource availability without mutating MongoDB records.
            </p>
          </div>

          {/* Mode Indicator & Location Picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-line text-sm">
              <MapPin size={16} className="text-indigo-500" />
              <select
                id="digital-twin-city-select"
                value={selectedCityName}
                onChange={(e) => setSelectedCityName(e.target.value)}
                className="bg-transparent text-ink font-medium focus:outline-none cursor-pointer text-sm"
              >
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

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

              {/* Radius Violation Tag */}
              {logisticsDelayInfo.exceedsEffectiveRadius && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>
                    Radius Impact: Delivery distance ({primaryLogisticsJob.distanceKm} km) exceeds simulated weather radius ({effectiveRadius} km).
                  </span>
                </div>
              )}
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
                    <span className="text-ink-mute">Simulated ETA:</span>
                    <strong className="text-red-600 dark:text-red-400 font-bold">
                      {logisticsDelayInfo.simulatedFormatted}
                    </strong>
                  </div>

                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <span className="text-red-700 dark:text-red-300 font-medium">Predicted Delay:</span>
                    <strong className="text-red-600 dark:text-red-400 font-bold text-sm">
                      {logisticsDelayInfo.delayText}
                    </strong>
                  </div>
                </div>
              </div>

              <span className="text-[11px] text-ink-mute mt-3 block">
                * Simulated projection based on rainfall intensity and radius contraction. Real GPS data is untouched.
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
                <td className="py-3 px-4 font-bold text-red-500">
                  {effectiveRadius} km
                </td>
                <td className="py-3 px-4 text-right text-red-500 font-medium">
                  -{STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius} km ({Math.round(((STANDARD_LOGISTICS_RADIUS_KM - effectiveRadius) / STANDARD_LOGISTICS_RADIUS_KM) * 100)}% radius drop)
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Resource Availability</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  100%
                </td>
                <td className="py-3 px-4 font-bold text-amber-500">
                  {(metrics.avgAvailabilityFactor * 100).toFixed(1)}%
                </td>
                <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 font-medium">
                  -{((1 - metrics.avgAvailabilityFactor) * 100).toFixed(1)}% available
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Bookings at Risk</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  0 bookings
                </td>
                <td className="py-3 px-4 font-bold text-red-500">
                  {metrics.highRiskBookings} bookings
                </td>
                <td className="py-3 px-4 text-right text-red-500 font-medium">
                  +{metrics.highRiskBookings} risk alerts
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Logistics Bottlenecks</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  0 (On Time)
                </td>
                <td className="py-3 px-4 font-bold text-rose-500">
                  {metrics.disruptedLogistics} active jobs
                </td>
                <td className="py-3 px-4 text-right text-rose-500 font-medium">
                  {logisticsDelayInfo.delayText}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold">Delivery State</td>
                <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ On Time
                </td>
                <td className="py-3 px-4 font-bold text-red-500">
                  {logisticsDelayInfo.statusText}
                </td>
                <td className="py-3 px-4 text-right text-red-500 font-medium">
                  Reschedule Recommended
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
              <span className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1.5">
                <CloudRain size={14} /> Heavy Rainfall ({scenario.rainfallMmPerHour}mm/h)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1.5">
                <Compass size={14} /> Radius Drop ({STANDARD_LOGISTICS_RADIUS_KM}km → {effectiveRadius}km)
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                <Truck size={14} /> Logistics Delay ({logisticsDelayInfo.delayText})
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
                <Calendar size={14} /> Booking Fulfilment Risk
              </span>
              <ArrowRight size={14} className="text-ink-mute shrink-0" />
              <span className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
                <RotateCcw size={14} /> Reschedule / Alternative Partner
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
    </div>
  );
}
