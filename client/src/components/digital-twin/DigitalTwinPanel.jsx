import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CloudRain, Wind, Thermometer, Clock, MapPin, RefreshCw, Navigation, Search, X, ArrowRight, Download, SlidersHorizontal, Activity, ShieldCheck } from 'lucide-react';
import api, { errorMessage } from '../../api/client';
import { inr, dateTime } from '../../lib/format';
import { CITIES, PRESET_SCENARIOS, getEffectiveRadius, formatDelay } from './digitalTwinHelper';
import './digitalTwin.css';
import DigitalTwinMap from './DigitalTwinMap';
import PublicSignalsPanel from './PublicSignalsPanel';

export default function DigitalTwinPanel({ initialCity = 'Thane' }) {
  const simulationRequest = useRef(0);
  const weatherRequest = useRef(0);
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current++; }, []);

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

const DEFAULT_SCENARIO = {
  rainfallMmPerHour: 0,
  temperature: 28,
  windSpeedMps: 2,
  durationHours: 1,
};

  // Live weather state
  const [liveWeather, setLiveWeather] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // Scenario input state (defaults to baseline clear weather until live weather is fetched)
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);

  // Mode: counterfactual vs live (defaults to Live Current Weather)
  const [isLiveMode, setIsLiveMode] = useState(true);
  const isLiveModeRef = useRef(true);
  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  const scenarioRef = useRef(scenario);
  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  // Simulation execution state
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState(null);

  // Modal / interactive states
  const [activeTab, setActiveTab] = useState('resources');

  // Fetch live weather for the selected city
  const fetchLiveWeather = useCallback(async (city, background = false) => {
    const requestId = ++weatherRequest.current;
    if (!background) setLiveLoading(true);
    try {
      const res = await api.get(`/weather?lat=${city.lat}&lon=${city.lon}`);
      if (requestId !== weatherRequest.current) return null;
      if (res.data?.available) {
        setLiveWeather(res.data);
        return res.data;
      } else {
        setLiveWeather(null);
        return null;
      }
    } catch {
      if (requestId === weatherRequest.current) setLiveWeather(null);
      return null;
    } finally {
      if (requestId === weatherRequest.current && !background) setLiveLoading(false);
    }
  }, []);

  // Run simulation against backend POST /api/digital-twin/simulate
  const runSimulation = useCallback(
    async (overrideScenario = null, useLive = null) => {
      const requestId = ++simulationRequest.current;
      setSimResult(null);
      setSimulating(true);
      setSimError(null);

      const targetScenario = overrideScenario || scenarioRef.current;
      const liveFlag = typeof useLive === 'boolean' ? useLive : isLiveModeRef.current;

      try {
        const payload = {
          location: {
            name: selectedCity.name,
            lat: selectedCity.lat,
            lon: selectedCity.lon,
          },
          scenario: {
            rainfallMmPerHour: Number(targetScenario.rainfallMmPerHour) || 0,
            temperature: Number(targetScenario.temperature ?? 25),
            windSpeedMps: Number(targetScenario.windSpeedMps) || 0,
            durationHours: Number(targetScenario.durationHours) || 1,
          },
          useLiveWeather: liveFlag,
        };

        const res = await api.post('/digital-twin/simulate', payload);
        if (requestId !== simulationRequest.current) return;
        if (res.data?.success) {
          setSimResult(res.data);
          setIsLiveMode(liveFlag);
          if (liveFlag && res.data.scenario) {
            setScenario({
              rainfallMmPerHour: Math.round(Number(res.data.scenario.rainfallMmPerHour) || 0),
              temperature: Math.round(Number(res.data.scenario.temperature) ?? 25),
              windSpeedMps: Math.round(Number(res.data.scenario.windSpeedMps) || 0),
              durationHours: Number(res.data.scenario.durationHours) || 1,
            });
          }
        } else {
          setSimError(res.data?.error || 'Simulation returned unsuccessful status.');
        }
      } catch (err) {
        if (requestId !== simulationRequest.current) return;
        setSimError(
          errorMessage(
            err,
            'Digital Twin simulation service is currently unavailable. Existing Indulge operations are unaffected.'
          )
        );
      } finally {
        if (requestId === simulationRequest.current) setSimulating(false);
      }
    },
    [selectedCity]
  );

  // Initial load / location change: default to live weather and run simulation
  useEffect(() => {
    let active = true;

    const loadLiveWeatherAndSimulate = async () => {
      setIsLiveMode(true);
      const data = await fetchLiveWeather(selectedCity, false);
      if (!active) return;

      if (data?.available && data.current) {
        const liveScenario = {
          rainfallMmPerHour: Math.round(data.current.rainfallIntensity || 0),
          temperature: Math.round(data.current.temperature ?? 25),
          windSpeedMps: Math.round(data.current.windSpeed ?? 0),
          durationHours: 1,
        };
        setScenario(liveScenario);
        if (active) {
          runSimulation(liveScenario, true);
        }
      } else {
        // If live weather feed is unavailable, fall back cleanly to clear weather
        setIsLiveMode(false);
        setScenario(DEFAULT_SCENARIO);
        if (active) {
          runSimulation(DEFAULT_SCENARIO, false);
        }
      }
    };

    loadLiveWeatherAndSimulate();

    return () => {
      active = false;
      simulationRequest.current++;
      weatherRequest.current++;
    };
  }, [selectedCity.name, selectedCity.lat, selectedCity.lon, fetchLiveWeather, runSimulation]);

  // Periodic background auto-refresh (every 5 minutes) so user does not need to manually tap
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    const interval = setInterval(async () => {
      if (document.hidden) return;

      const data = await fetchLiveWeather(selectedCity, true);
      // If user is currently in live mode, automatically sync the simulation with updated conditions
      if (isLiveModeRef.current && data?.available && data?.current) {
        const liveScenario = {
          rainfallMmPerHour: Math.round(data.current.rainfallIntensity || 0),
          temperature: Math.round(data.current.temperature ?? 25),
          windSpeedMps: Math.round(data.current.windSpeed ?? 0),
          durationHours: 1,
        };
        setScenario(liveScenario);
        runSimulation(liveScenario, true);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [selectedCity, fetchLiveWeather, runSimulation]);

  // Live Browser GPS Geolocation
  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    const request = ++locationRequest.current;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (request !== locationRequest.current) return;
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));

        let detectedName = 'Live Location';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) }
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
          detectedName = `Current location (${lat}, ${lon})`;
        }

        if (request !== locationRequest.current) return;
        const newLoc = { name: detectedName, lat, lon, isLiveGps: true };
        setCustomLocation(newLoc);
        setSelectedCityName(detectedName);
        setGpsLoading(false);
        toast.success(`Location set to ${detectedName}`);
      },
      (err) => {
        if (request !== locationRequest.current) return;
        setGpsLoading(false);
        console.warn('Geolocation error:', err);
        toast.error('Unable to retrieve GPS coordinates. Please allow location permissions in your browser.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const searchSequence = useRef(0);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    searchSequence.current++;
    setSearching(false);
    setSearchError('');
    const q = searchQuery.trim().toLowerCase();
    setSearchResults(q ? CITIES.filter(c => `${c.name} ${c.state}`.toLowerCase().includes(q)) : []);
  }, [searchQuery]);
  const searchLocations = async (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    const request = ++searchSequence.current;
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery.trim())}&format=json&addressdetails=1&countrycodes=in&limit=8`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      if (request !== searchSequence.current) return;
      setSearchResults(data.map(item => ({ name: item.name || item.display_name.split(',')[0], displayName: item.display_name, lat: Number(item.lat), lon: Number(item.lon) })));
      if (!data.length) setSearchError('No locations found. Try a city or district in India.');
    } catch {
      if (request === searchSequence.current) setSearchError('Location search is unavailable. Choose a city from the list.');
    } finally {
      if (request === searchSequence.current) setSearching(false);
    }
  };
  useEffect(() => () => { searchSequence.current++; }, []);

  const handleSelectLocation = (loc) => {
    locationRequest.current++;
    setGpsLoading(false);
    setCustomLocation(loc);
    setSelectedCityName(loc.name);
    setSearchOpen(false);
    setSearchQuery('');
    toast.success(`Simulation hub set to ${loc.name}`);
  };

  // Handle switching to Live Weather Mode
  const handleUseLiveWeather = async () => {
    let currentLive = liveWeather?.current;
    if (!currentLive) {
      const fresh = await fetchLiveWeather(selectedCity, false);
      currentLive = fresh?.current;
    }
    if (!currentLive) {
      toast.error('Live weather is unavailable. Refresh conditions or use a what-if preset.');
      return;
    }

    const liveScenario = {
      rainfallMmPerHour: Math.round(currentLive?.rainfallIntensity || 0),
      temperature: Math.round(currentLive?.temperature ?? 25),
      windSpeedMps: Math.round(currentLive?.windSpeed ?? 0),
      durationHours: 1,
    };
    setIsLiveMode(true);
    setScenario(liveScenario);
    runSimulation(liveScenario, true);
  };

  // Handle manual refresh button click
  const handleRefreshWeather = async () => {
    const data = await fetchLiveWeather(selectedCity, false);
    if (isLiveModeRef.current && data?.available && data?.current) {
      const liveScenario = {
        rainfallMmPerHour: Math.round(data.current.rainfallIntensity || 0),
        temperature: Math.round(data.current.temperature ?? 25),
        windSpeedMps: Math.round(data.current.windSpeed ?? 0),
        durationHours: 1,
      };
      setScenario(liveScenario);
      runSimulation(liveScenario, true);
      toast.success('Live weather and assessment refreshed');
    } else if (data?.available) {
      toast.success('Current weather updated');
    }
  };

  // Handle manual scenario change
  const handleScenarioChange = (key, value) => {
    simulationRequest.current++;
    setSimulating(false);
    setSimResult(null);
    setSimError(null);
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

  };

  const metrics = simResult?.metrics;
  const weatherClass = simResult?.weatherClassification;
  const effectiveRadius = weatherClass ? getEffectiveRadius(weatherClass, weatherClass.score) : null;
  const resources = simResult?.affectedResources || [];
  const bookings = simResult?.affectedBookings || [];
  const jobs = simResult?.affectedLogisticsJobs || [];
  const requirements = simResult?.affectedRequirements || [];
  const effects = simResult?.cascadingEffects || [];
  const resourceTitle = (id) => resources.find(r => r.resourceId === id)?.title || 'Resource';
  const current = liveWeather?.current;
  const delta = simResult?.comparison?.delta;
  const activePreset = PRESET_SCENARIOS.find(p => Object.keys(p.scenario).every(k => p.scenario[k] === scenario[k]));
  const controls = [
    { key: 'rainfallMmPerHour', label: 'Rainfall', unit: 'mm/h', min: 0, max: 120, step: 1, icon: CloudRain },
    { key: 'windSpeedMps', label: 'Wind speed', unit: 'm/s', min: 0, max: 30, step: 1, icon: Wind },
    { key: 'temperature', label: 'Temperature', unit: '°C', min: 10, max: 45, step: 1, icon: Thermometer },
    { key: 'durationHours', label: 'Duration', unit: 'hours', min: 1, max: 24, step: 1, icon: Clock },
  ];
  const exportSummary = () => {
    if (!simResult) return;
    const report = {
      location: selectedCity, generatedAt: simResult.meta?.completedAt || new Date().toISOString(),
      mode: isLiveMode ? 'Current weather' : 'What-if scenario', scenario: simResult.scenario,
      metrics, comparison: simResult.comparison,
      bookings, logistics: jobs, resources, requirements,
      notes: 'Rule-based planning estimates, not calibrated probabilities or guaranteed outcomes. Price exposure uses listing rates, not revenue loss. Active bookings are assessed across their dates. No operational records changed.',
    };
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`;
    const link = document.createElement('a');
    link.href = url; link.download = `weather-plan-${selectedCity.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(link); link.click(); link.remove();

  };
  const signed = (value, suffix = '') => `${value > 0 ? '+' : ''}${value}${suffix}`;
  const tabs = [ ['resources', 'Resources', resources.length], ['bookings', 'Bookings', bookings.length], ['logistics', 'Deliveries', jobs.length], ['requirements', 'Requirements', requirements.length], ['effects', 'Knock-on effects', effects.length] ];

  return (
    <div className="digital-twin-panel twin-workspace">
      <section className="twin-card twin-location" aria-label="Planning location">
        <div className="twin-location-title"><MapPin size={19} /><div><span className="twin-eyebrow">PLANNING AREA</span><strong>{selectedCity.name}</strong></div></div>
        <div className="twin-actions">
          <select aria-label="Simulation location" value={selectedCityName} onChange={e => { locationRequest.current++; setGpsLoading(false); setCustomLocation(null); setSelectedCityName(e.target.value); }}>
            {customLocation && !CITIES.some(c => c.name === customLocation.name) && <option value={customLocation.name}>{customLocation.name}</option>}
            {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button className="twin-button" onClick={handleUseLiveLocation} disabled={gpsLoading}><Navigation size={15}/>{gpsLoading ? 'Locating…' : 'Use my location'}</button>
          <button className="twin-button" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={15}/>Find a location</button>
        </div>
      </section>
      {searchOpen && <section className="twin-card twin-search" aria-label="Location search">
        <form onSubmit={searchLocations} className="twin-actions">
          <label className="sr-only" htmlFor="twin-location-search">City or district in India</label>
          <input id="twin-location-search" autoFocus value={searchQuery} placeholder="Search a city or district in India" onChange={e => setSearchQuery(e.target.value)} />
          <button className="twin-button twin-primary" disabled={searching || !searchQuery.trim()}>{searching ? 'Searching…' : 'Search'}</button>
          <button type="button" className="twin-button" aria-label="Close location search" onClick={() => setSearchOpen(false)}><X size={16}/></button>
        </form>
        {searchError && <p role="status">{searchError}</p>}
        <div className="twin-search-results">{searchResults.map(loc => <button key={`${loc.lat}-${loc.lon}`} onClick={() => handleSelectLocation(loc)}><MapPin size={15}/><span>{loc.name}<small>{loc.displayName || loc.state}</small></span><ArrowRight size={14}/></button>)}</div>
      </section>}

      <section className="twin-card twin-weather" aria-label="Current weather">
        <div className="twin-weather-label"><CloudRain size={22}/><div><h2>Current weather</h2><p>{liveLoading ? 'Checking conditions…' : current ? `${liveWeather.source} · ${current.observedAt ? new Date(current.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Latest available'}` : 'Feed unavailable · What-if planning is available'}</p></div></div>
        {current && <div className="twin-weather-values"><span><strong>{current.temperature}°C</strong>Temperature</span><span><strong>{current.rainfallIntensity} mm/h</strong>Rainfall</span><span><strong>{current.windSpeed} m/s</strong>Wind</span></div>}
        <div className="twin-actions">
          <button className="twin-button" aria-label="Refresh current weather" disabled={liveLoading} onClick={handleRefreshWeather}>
            <RefreshCw size={15} className={liveLoading ? 'animate-spin' : ''}/>
            <span>Refresh</span>
          </button>
          <button
            className={`twin-button ${isLiveMode ? 'twin-primary' : ''}`}
            disabled={!current || liveLoading || simulating}
            title={!current ? 'Refresh weather to check whether current conditions are available' : isLiveMode ? 'Current live weather is active (auto-syncing)' : 'Assess current conditions'}
            onClick={handleUseLiveWeather}
          >
            {isLiveMode ? (
              <>
                <ShieldCheck size={14} />
                <span>Current weather active</span>
              </>
            ) : (
              'Use current weather'
            )}
          </button>
        </div>
      </section>

      <div className="twin-planning-grid">
        <section className="twin-card twin-scenario" aria-labelledby="scenario-heading">
          <div className="twin-section-heading"><div><span className="twin-eyebrow">01 / CONDITIONS</span><h2 id="scenario-heading">{isLiveMode ? 'Current live conditions' : 'Plan a weather scenario'}</h2></div><SlidersHorizontal size={19}/></div>
          <div className="twin-presets" role="group" aria-label="Weather presets">{PRESET_SCENARIOS.map(p => <button key={p.id} aria-pressed={!isLiveMode && activePreset?.id === p.id} onClick={() => handleApplyPreset(p)}>{p.id === 'normal' ? 'Clear' : p.id === 'moderate' ? 'Heavy rain' : 'Storm'}</button>)}</div>
          <div className="twin-sliders">{controls.map(({key,label,unit,min,max,step,icon: Icon}) => <div key={key} className="twin-slider"><label htmlFor={`twin-${key}`}><span><Icon size={15}/>{label}</span><strong>{scenario[key]} <small>{unit}</small></strong></label><input id={`twin-${key}`} type="range" min={Math.min(min, scenario[key])} max={Math.max(max, scenario[key])} step={step} value={scenario[key]} aria-valuetext={`${scenario[key]} ${unit}`} onChange={e => handleScenarioChange(key, Number(e.target.value))}/><div className="twin-range-labels"><span>{Math.min(min, scenario[key])} {unit}</span><span>{Math.max(max, scenario[key])} {unit}</span></div></div>)}</div>
          <button className="twin-button twin-primary twin-run" disabled={simulating} onClick={() => runSimulation()}>{simulating ? <RefreshCw size={16} className="animate-spin"/> : <Activity size={16}/>} {simulating ? 'Assessing impact…' : 'Run assessment'}<ArrowRight size={16}/></button>
          <p className="twin-caption"><ShieldCheck size={13}/>Planning only. Bookings remain unchanged.</p>
        </section>

        <section className="twin-card twin-impact" aria-labelledby="impact-heading" aria-busy={simulating}>
          <div className="twin-section-heading"><div><span className="twin-eyebrow">02 / BUSINESS IMPACT</span><h2 id="impact-heading">Your operational outlook</h2></div><span className={`twin-status ${simResult ? 'twin-status-ready' : ''}`}>{simulating ? 'Assessing' : simResult ? isLiveMode ? 'Current weather' : 'What-if scenario' : 'Not assessed'}</span></div>
          <div className="twin-outlook" role="status" aria-live="polite">
            {simError ? <><h3>Assessment unavailable</h3><p>{simError} Try running the assessment again.</p></> : !simResult ? <><h3>{simulating ? 'Reviewing local operations…' : 'Conditions changed'}</h3><p>{simulating ? 'Checking resources, bookings and delivery exposure in this area.' : 'Run the assessment to update your business outlook.'}</p></> : <><div className="twin-outlook-line"><h3>{metrics.highRiskBookings || metrics.disruptedLogistics ? 'Review exposed operations' : resources.length ? 'Review resource readiness' : 'No resources in this area'}</h3><span className={`twin-risk ${['severe','extreme'].includes(weatherClass.severity) ? 'twin-risk-high' : ''}`}>{weatherClass.severity} conditions</span></div><p>{resources.length ? `${resources.length} local resources assessed within ${simResult.location?.radiusKm || 50} km. ${bookings.length} active bookings and ${jobs.length} deliveries belong to your business.` : 'Choose another location to assess your network. Weather conditions alone do not establish business exposure.'}</p></>}
          </div>
          <div className="twin-metrics">
            <Metric label="High-risk bookings" value={simResult ? metrics.highRiskBookings : '—'} detail={simResult ? `${bookings.length} active bookings assessed` : 'Awaiting assessment'}/>
            <Metric label="Disrupted deliveries" value={simResult ? metrics.disruptedLogistics : '—'} detail={simResult ? `${jobs.length} active deliveries assessed` : 'Awaiting assessment'}/>
            <Metric label="Modelled availability" value={simResult && resources.length ? `${Math.round(metrics.avgAvailabilityFactor * 100)}%` : '—'} detail="Resource capacity estimate"/>
            <Metric label="Indicative price exposure" value={simResult && resources.length ? inr(metrics.estimatedTotalRevenueLossInr) : '—'} detail="Based on listing rates; not revenue loss"/>
          </div>
          <div className="twin-comparison"><h3>Compared with clear weather</h3><div><span>Availability <strong>{delta && resources.length ? signed(delta.availabilityPercentagePoints, ' pp') : '—'}</strong></span><span>High-risk bookings <strong>{delta ? signed(delta.highRiskBookings) : '—'}</strong></span><span>Disrupted deliveries <strong>{delta ? signed(delta.disruptedLogistics) : '—'}</strong></span></div></div>
          <div className="twin-impact-footer"><span>Estimated delivery coverage <strong>{effectiveRadius ? `${effectiveRadius} km` : '—'}</strong><small>30 km clear-weather baseline</small></span><button className="twin-button" onClick={exportSummary} disabled={!simResult}><Download size={15}/>Export assessment</button></div>
        </section>
      </div>

      {simResult && <>
        <DigitalTwinMap centerCity={selectedCity.name} centerCoords={{lat:selectedCity.lat,lon:selectedCity.lon}} simResult={simResult} scenario={simResult.scenario} effectiveRadius={effectiveRadius} isLiveWeather={isLiveMode}/>
        <section className="twin-card twin-records" aria-labelledby="records-heading">
          <div className="twin-section-heading"><div><span className="twin-eyebrow">03 / OPERATIONAL REVIEW</span><h2 id="records-heading">Review the details</h2></div><span className="twin-caption">Your bookings and deliveries · Local marketplace resources</span></div>
          <div className="twin-tabs" role="group" aria-label="Operational details">{tabs.map(([key,label,count]) => <button key={key} aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>{label}<span>{count}</span></button>)}</div>
          {activeTab === 'resources' && (resources.length ? <div className="twin-table-wrap"><table><thead><tr><th>Resource</th><th>Scenario impact</th><th>Modelled availability</th><th>Next step</th></tr></thead><tbody>{resources.map(r => <tr key={r.resourceId}><td><strong>{r.title}</strong><small>{r.category.replaceAll('_',' ')}</small></td><td><Risk level={r.impactLevel}/></td><td>{Math.round(r.simulatedAvailabilityFactor * 100)}%</td><td><Link to={`/r/${r.resourceId}`}>Review listing <ArrowRight size={13}/></Link></td></tr>)}</tbody></table></div> : <Empty title="No resources in this area" text="Choose another location to explore nearby marketplace resources."/>)}
          {activeTab === 'bookings' && (bookings.length ? <div className="twin-record-grid">{bookings.map(b => <article className="twin-record" key={b.bookingId}><div className="twin-record-head"><small>BOOKING #{b.bookingId.slice(-6).toUpperCase()}</small><Risk level={b.riskLevel}/></div><h3>{resourceTitle(b.resourceId)}</h3><p>{b.startDateTime ? dateTime(b.startDateTime) : 'Date not recorded'}</p><p>Scenario risk score: <strong>{Math.round(b.disruptionProbability * 100)}/100</strong></p><p>{b.recommendation}</p><Link to={`/bookings/detail/${b.bookingId}`}>Review booking <ArrowRight size={14}/></Link></article>)}</div> : <Empty title="No active bookings in this area" text="Bookings for your business will appear here when they match this planning area."/>)}
          {activeTab === 'logistics' && (jobs.length ? <div className="twin-record-grid">{jobs.map(j => <article className="twin-record" key={j.jobId}><div className="twin-record-head"><small>DELIVERY #{j.jobId.slice(-6).toUpperCase()}</small><span className="twin-status">{j.currentStatus.replaceAll('_',' ')}</span></div><h3>{resourceTitle(j.resourceId)}</h3><p>{j.pickupLocation?.city || 'Pickup not recorded'} → {j.deliveryLocation?.city || 'Destination not recorded'}</p><p>Estimated additional delay: <strong>{formatDelay(j.estimatedDelayHours)}</strong></p><p>Direct distance: {j.distanceKm == null ? 'Not recorded' : `${j.distanceKm} km`}</p><p>{j.recommendation}</p><Link to={`/bookings/detail/${j.bookingId}`}>Review related booking <ArrowRight size={14}/></Link></article>)}</div> : <Empty title="No active deliveries in this area" text="There are no deliveries for your business to assess at this location."/>)}
          {activeTab === 'requirements' && (requirements.length ? <div className="twin-record-grid">{requirements.map(r => <article className="twin-record" key={r.requirementId}><h3>{r.title}</h3><p>Modelled demand change: <strong>{signed(r.competitionIncreasePct, '%')}</strong></p><p>{r.note}</p></article>)}</div> : <Empty title="No open requirements in this area" text="Your open sourcing requirements will appear here when they match this location."/>)}
          {activeTab === 'effects' && (effects.length ? <div className="twin-record-grid">{effects.map((e,i) => <article className="twin-record" key={`${e.type}-${i}`}><small>{e.cascade} effect · scenario estimate</small><h3>{e.type.replaceAll('_',' ')}</h3><p>{e.description}</p></article>)}</div> : <Empty title="No knock-on effects identified" text="The selected scenario did not trigger any additional effects in this model."/>)}
        </section>
      </>}
      <PublicSignalsPanel key={selectedCity.name} city={selectedCity.name}/>
      <details className="twin-card twin-method"><summary>How to interpret this assessment</summary><div><p>This is a rule-based planning model. Scores express relative scenario risk, not the probability of an event. Weather learning and statistical uncertainty are not implemented.</p><p>Resources are selected within 50 km. Your active bookings are stress-tested across their recorded dates, rather than matched to a forecast window. Availability is a modelled capacity factor; it does not represent unreserved stock. Price exposure uses listing base rates, not measured revenue loss.</p><p>The clear-weather comparison uses the same records and duration with no rain or wind at 25°C. Delivery coverage is an illustrative weather-adjusted radius, not a road-route guarantee. Public reports provide context and do not verify a simulated scenario.</p></div></details>
    </div>
  );
}

function Metric({label,value,detail}) { return <div className="twin-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function Risk({level}) { return <span className={`twin-risk ${['high','critical'].includes(level) ? 'twin-risk-high' : ''}`}>{level}</span>; }
function Empty({title,text}) { return <div className="twin-empty"><h3>{title}</h3><p>{text}</p></div>; }
