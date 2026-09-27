import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Truck,
  Calendar,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Compass,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  ExternalLink,
  Clock,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Filter,
  Navigation,
  Crosshair,
  Info,
  Maximize2,
  X,
  CloudRain,
  Wind,
  Thermometer,
  Sun,
  Moon,
} from 'lucide-react';
import useTheme from '../../hooks/useTheme';
import { inr } from '../../lib/format';
import { CATEGORY_LABELS } from '../../lib/constants';
import {
  STANDARD_LOGISTICS_RADIUS_KM,
  formatDelay,
  calculateSimulatedETA,
  getLogisticsRiskStatus,
} from './digitalTwinHelper';

// Leaflet consumes HTML strings, unlike React which escapes text for us.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

// Category icon symbols for HTML marker rendering
const CATEGORY_SYMBOLS = {
  banquet_space: '🏛️',
  hotel: '🏨',
  vehicle: '🚚',
  furniture: '🪑',
  av_equipment: '🎤',
  kitchen_capacity: '🍳',
  commercial_kitchen: '🍳',
  cloud_kitchen: '🍳',
  parking: '🅿️',
  staff: '👥',
  other: '📦',
};

// Category colors for markers
const CATEGORY_MARKER_COLORS = {
  banquet_space: '#6366F1', // indigo
  hotel: '#6366F1',
  vehicle: '#0D9488', // teal
  furniture: '#D97706', // amber
  av_equipment: '#8B5CF6', // violet
  kitchen_capacity: '#EA580C', // orange
  commercial_kitchen: '#EA580C',
  cloud_kitchen: '#EA580C',
  parking: '#10B981', // emerald
  staff: '#EC4899', // pink
  other: '#64748B', // slate
};

/**
 * Calculates straight line distance (Haversine formula) in km
 */
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

/**
 * Extracts [lat, lng] safely from various Mongo / GeoJSON formats
 */
function parseCoords(location) {
  if (!location) return null;
  // GeoJSON coordinates [lng, lat]
  if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
    const lng = Number(location.coordinates[0]);
    const lat = Number(location.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }
  // Object with lat & lon/lng
  if (location.lat != null && (location.lon != null || location.lng != null)) {
    const lat = Number(location.lat);
    const lng = Number(location.lon ?? location.lng);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  return null;
}

export default function DigitalTwinMap({
  centerCity = 'Thane',
  centerCoords = { lat: 19.2183, lon: 72.9781 },
  simResult = null,
  scenario = null,
  effectiveRadius = 15,
  isLiveWeather = false,
  onSelectEntity = null,
}) {
  const { dark, toggle: toggleTheme } = useTheme();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    standardRadius: null,
    simulatedRadius: null,
    centerMarker: null,
    resourceMarkers: [],
    logisticsRoutes: [],
    bookingMarkers: [],
    signalMarkers: [],
  });

  // UI Filter state
  const [filterType, setFilterType] = useState('all'); // 'all' | 'resources' | 'logistics' | 'bookings' | 'affected'
  const [showStandardRadius, setShowStandardRadius] = useState(true);
  const [showSimulatedRadius, setShowSimulatedRadius] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Center coordinate tuple [lat, lng]
  const centerLat = Number(centerCoords?.lat ?? 19.2183);
  const centerLng = Number(centerCoords?.lon ?? centerCoords?.lng ?? 72.9781);

  // Weather classification from simulation
  const weatherClass = simResult?.weatherClassification || {
    severity: 'unknown',
    score: 0,
    isStorm: false,
  };

  // ── 1. Initialize Map Instance ───────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: 11,
        zoomControl: false, // Custom styled zoom controls
        attributionControl: false,
        fadeAnimation: true,
      });

      // Add minimal attribution in corner
      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      // Leaflet retains aria-describedby after transient tooltips close.
      map.on('tooltipclose', ({ tooltip }) => {
        map.eachLayer(layer => {
          if (layer.getTooltip?.() === tooltip) layer.getElement?.()?.removeAttribute('aria-describedby');
        });
      });
      mapInstanceRef.current = map;
      setIsMapReady(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  // ── 2. Update Tiles on Theme Change ─────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove existing tile layer
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let tileUrl;
    let attribution;
    let className = '';

    if (googleApiKey) {
      // High-resolution Google Maps Roadmap tiles
      tileUrl = `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleApiKey}`;
      attribution = '&copy; Google Maps';
      className = dark ? 'twin-dark-tiles' : '';
    } else {
      // Clean OpenStreetMap tiles (100% free, zero watermarks)
      tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
      className = dark ? 'twin-dark-tiles' : '';
    }

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      className,
      attribution,
    }).addTo(map);
  }, [dark, isMapReady]);

  // ── 3. Smooth Pan when Center Changes ───────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([centerLat, centerLng], 11, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [centerLat, centerLng]);

  // ── 4. Render Center & Radius Circles ───────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;
    const map = mapInstanceRef.current;
    const layers = layersRef.current;

    // Clean previous radius layers
    if (layers.standardRadius) map.removeLayer(layers.standardRadius);
    if (layers.simulatedRadius) map.removeLayer(layers.simulatedRadius);
    if (layers.centerMarker) map.removeLayer(layers.centerMarker);

    // 1. Center Pulse Marker
    const centerIcon = L.divIcon({
      className: 'twin-center-marker',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 rounded-full bg-indigo-500/25"></div>
          <div class="relative w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    layers.centerMarker = L.marker([centerLat, centerLng], { icon: centerIcon, zIndexOffset: -100, title: `Planning area: ${centerCity}` })
      .addTo(map)
      .bindTooltip(
        `<div class="text-xs font-semibold px-1 py-0.5">${centerCity} Hub (Simulation Center)</div>`,
        { direction: 'top', offset: [0, -10] }
      );

    // 2. Standard 30 km Logistics Radius (Indigo translucent overlay)
    if (showStandardRadius) {
      layers.standardRadius = L.circle([centerLat, centerLng], {
        radius: STANDARD_LOGISTICS_RADIUS_KM * 1000,
        color: '#6366F1',
        weight: 1.8,
        dashArray: '6, 8',
        opacity: 0.7,
        fillColor: '#6366F1',
        fillOpacity: dark ? 0.04 : 0.03,
        interactive: false,
      }).addTo(map);
    }

    // 3. Weather-Adjusted Simulated Radius (Contraction indicator)
    if (showSimulatedRadius) {
      const isSevere = effectiveRadius <= 15;
      const isModerate = effectiveRadius <= 25 && effectiveRadius > 15;
      const radiusColor = isSevere ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';

      layers.simulatedRadius = L.circle([centerLat, centerLng], {
        radius: effectiveRadius * 1000,
        color: radiusColor,
        weight: 2.2,
        opacity: 0.9,
        fillColor: radiusColor,
        fillOpacity: dark ? (isSevere ? 0.12 : 0.08) : 0.06,
        interactive: false,
      }).addTo(map);
    }
  }, [
    centerLat,
    centerLng,
    centerCity,
    effectiveRadius,
    showStandardRadius,
    showSimulatedRadius,
    dark,
    isMapReady,
  ]);

  // ── 5. Render Resources, Logistics Routes & Bookings ─────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;
    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    setSelectedEntity(null);

    // Clear previous dynamic layers
    layers.resourceMarkers.forEach((m) => map.removeLayer(m));
    layers.resourceMarkers = [];
    layers.logisticsRoutes.forEach((l) => map.removeLayer(l));
    layers.logisticsRoutes = [];
    layers.bookingMarkers.forEach((b) => map.removeLayer(b));
    layers.bookingMarkers = [];
    layers.signalMarkers.forEach((s) => map.removeLayer(s));
    layers.signalMarkers = [];

    // Missing data stays empty; markers must represent actual snapshot records.
    const affectedResources = simResult?.affectedResources || [];
    const affectedLogistics = simResult?.affectedLogisticsJobs || [];
    const affectedBookings = simResult?.affectedBookings || [];

    // Helper: matches current filter
    const allowResources = filterType === 'all' || filterType === 'resources';
    const allowLogistics = filterType === 'all' || filterType === 'logistics';
    const allowBookings = filterType === 'all' || filterType === 'bookings';
    const allowSignals = filterType === 'all' || filterType === 'signals';
    const filterAffectedOnly = filterType === 'affected';

    // ── Coordinate Dispersal Registry ──────────────────────────────────────
    // Prevents marker stacking when multiple resources / nodes share exact coordinates.
    const collisionRegistry = new Map();
    // Reserve center hub coordinate so it never gets obscured
    collisionRegistry.set(`${centerLat.toFixed(3)}_${centerLng.toFixed(3)}`, 0);

    const getDispersedCoords = (coords) => {
      if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
      const gridKey = `${coords[0].toFixed(3)}_${coords[1].toFixed(3)}`;
      
      const count = (collisionRegistry.get(gridKey) ?? 0) + 1;
      collisionRegistry.set(gridKey, count);

      // If it's the very first marker and not at center hub, keep exact coords
      if (count === 1 && gridKey !== `${centerLat.toFixed(3)}_${centerLng.toFixed(3)}`) {
        return coords;
      }

      // Fan out in concentric orbits around the location
      // Ring 1 (1–6 collisions): radius ~0.0085° (~950m)
      // Ring 2 (7–14 collisions): radius ~0.016° (~1.8km)
      const ring = count <= 6 ? 1 : 2;
      const ringRadius = ring === 1 ? 0.0085 : 0.016;
      const ringIndex = ring === 1 ? count - 1 : count - 7;
      const ringTotal = ring === 1 ? 6 : 8;
      const angle = (2 * Math.PI * ringIndex) / ringTotal;

      const cosLat = Math.cos((coords[0] * Math.PI) / 180) || 1;
      const newLat = coords[0] + ringRadius * Math.sin(angle);
      const newLng = coords[1] + (ringRadius / cosLat) * Math.cos(angle);

      return [Number(newLat.toFixed(5)), Number(newLng.toFixed(5))];
    };

    // Map of resourceId -> dispersed coordinates for booking alignment
    const resourceCoordsMap = new Map();

    // ── A. Render Real Resources from Simulation ─────────────────────────
    if (allowResources || filterAffectedOnly) {
      affectedResources.forEach((r) => {
        const rawCoords = parseCoords(r.location);
        if (!rawCoords) return; // Follow STEP 16: Never place false marker if no coords
        const coords = getDispersedCoords(rawCoords);
        if (r.resourceId) resourceCoordsMap.set(r.resourceId, coords);

        const isAffected = r.impactLevel === 'critical' || r.impactLevel === 'high' || r.impactLevel === 'moderate';
        if (filterAffectedOnly && !isAffected) return;

        const isCritical = r.impactLevel === 'critical';
        const isHigh = r.impactLevel === 'high';
        const categorySymbol = CATEGORY_SYMBOLS[r.category] || '📦';
        const categoryColor = CATEGORY_MARKER_COLORS[r.category] || '#6366F1';

        // Border & halo styling based on impact level
        let haloClass = '';
        let badgeColor = categoryColor;
        if (isCritical) {
          haloClass = 'ring-4 ring-red-500/40 border-red-500 bg-red-950/80';
          badgeColor = '#EF4444';
        } else if (isHigh) {
          haloClass = 'ring-2 ring-orange-500/40 border-orange-500 bg-orange-950/80';
          badgeColor = '#F97316';
        } else if (r.impactLevel === 'moderate') {
          haloClass = 'border-amber-500/80 bg-amber-950/60';
          badgeColor = '#F59E0B';
        } else {
          haloClass = 'border-line bg-surface shadow-sm';
        }

        const markerHtml = `
          <div class="twin-resource-marker relative cursor-pointer group transition-transform duration-200 hover:scale-125">
            <div class="w-8 h-8 rounded-xl border flex items-center justify-center text-sm shadow-md ${haloClass}">
              <span>${categorySymbol}</span>
            </div>
            ${
              isCritical
                ? `<span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 border border-white flex items-center justify-center text-[9px] text-white font-bold">!</span>`
                : ''
            }
          </div>
        `;

        const icon = L.divIcon({
          className: '',
          html: markerHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker(coords, { icon, riseOnHover: true, title: r.title })
          .addTo(map)
          .on('click', () => {
            const entity = {
              type: 'resource',
              id: r.resourceId,
              title: r.title,
              category: r.category,
              categoryLabel: CATEGORY_LABELS[r.category] || r.category,
              location: r.location?.address ? `${r.location.address}, ${r.location.city || ''}` : r.location?.city || 'Metro Area',
              impactLevel: r.impactLevel,
              availabilityReductionPct: r.availabilityReductionPct,
              simulatedAvailabilityFactor: r.simulatedAvailabilityFactor,
              estimatedRevenueLossInr: r.estimatedRevenueLossInr,
              reasons: r.reasons,
              requiresLogistics: r.requiresLogistics,
            };
            setSelectedEntity(entity);
            onSelectEntity?.(entity);
          });

        marker.bindTooltip(
          `<div class="text-xs leading-snug">
            <strong class="text-ink">${escapeHtml(r.title)}</strong>
            <div class="text-[11px] text-ink-soft">${escapeHtml(CATEGORY_LABELS[r.category] || r.category)}</div>
            <div class="mt-1 font-semibold ${isCritical ? 'text-red-700 dark:text-red-300' : isHigh ? 'text-orange-500' : 'text-emerald-700 dark:text-emerald-300'}">
              ${isAffected ? `⚠ ${r.availabilityReductionPct}% Availability Hit` : '✓ 100% Available'}
            </div>
          </div>`,
          { direction: 'top', offset: [0, -12] }
        );

        layers.resourceMarkers.push(marker);
      });
    }

    // ── B. Render Real Logistics Delivery Routes (STEP 6 & STEP 8) ────────
    if (allowLogistics || filterAffectedOnly) {
      affectedLogistics.forEach((job) => {
        const pickupCoords = parseCoords(job.pickupLocation);
        const deliveryCoords = parseCoords(job.deliveryLocation);
        if (!pickupCoords || !deliveryCoords) return;
        const distanceKm = getDistanceKm(pickupCoords[0], pickupCoords[1], deliveryCoords[0], deliveryCoords[1]);

        // Check if outside weather-adjusted radius
        const isOutsideSimRadius = distanceKm > effectiveRadius;
        const isDisrupted = job.disruptionProbability > 0.4 || isOutsideSimRadius;

        if (filterAffectedOnly && !isDisrupted) return;

        const routeColor = isOutsideSimRadius
          ? '#EF4444' // Red if outside simulated radius
          : job.disruptionProbability > 0.4
          ? '#F59E0B' // Amber if delayed
          : '#10B981'; // Green if normal

        // 1. Pickup Marker (Origin)
        const pickupIcon = L.divIcon({
          className: '',
          html: `
            <div class="cursor-pointer group flex flex-col items-center">
              <div class="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold shadow-md flex items-center gap-1 border border-emerald-400">
                <span>📍</span>
                <span>Pickup</span>
              </div>
              <div class="w-1.5 h-1.5 bg-emerald-600 rounded-full mt-0.5"></div>
            </div>
          `,
          iconSize: [60, 24],
          iconAnchor: [30, 24],
        });

        const pickupMarker = L.marker(pickupCoords, { icon: pickupIcon, title: `Delivery pickup ${job.jobId.slice(-6)}` }).addTo(map);

        // 2. Delivery Destination Marker
        const deliveryIcon = L.divIcon({
          className: '',
          html: `
            <div class="cursor-pointer group flex flex-col items-center">
              <div class="px-2 py-0.5 rounded-full ${
                isOutsideSimRadius ? 'bg-red-600 border-red-300' : 'bg-indigo-600 border-indigo-400'
              } text-white text-[10px] font-bold shadow-md flex items-center gap-1 border">
                <span>${isOutsideSimRadius ? '⚠' : '🎯'}</span>
                <span>Destination</span>
              </div>
              <div class="w-1.5 h-1.5 ${isOutsideSimRadius ? 'bg-red-600' : 'bg-indigo-600'} rounded-full mt-0.5"></div>
            </div>
          `,
          iconSize: [80, 24],
          iconAnchor: [40, 24],
        });

        const deliveryMarker = L.marker(deliveryCoords, { icon: deliveryIcon, title: `Delivery destination ${job.jobId.slice(-6)}` }).addTo(map);

        // 3. Connecting Route Polyline
        const polyline = L.polyline([pickupCoords, deliveryCoords], {
          color: routeColor,
          weight: isOutsideSimRadius ? 4 : 3,
          dashArray: isOutsideSimRadius ? '8, 8' : '4, 6',
          opacity: 0.9,
        }).addTo(map);

        // Midpoint Distance Pill
        const midLat = (pickupCoords[0] + deliveryCoords[0]) / 2;
        const midLng = (pickupCoords[1] + deliveryCoords[1]) / 2;

        const distancePillIcon = L.divIcon({
          className: '',
          html: `
            <div class="cursor-pointer px-2 py-0.5 rounded-md ${
              isOutsideSimRadius
                ? 'bg-red-600/95 text-white ring-2 ring-red-400/50'
                : 'bg-surface/95 border border-line text-ink'
            } text-[10px] font-bold shadow-md whitespace-nowrap flex items-center gap-1">
              <span class="text-xs">🚚</span>
              <span>${distanceKm} km</span>
              ${isOutsideSimRadius ? '<span class="text-[9px] bg-white/20 px-1 rounded">AT RISK</span>' : ''}
            </div>
          `,
          iconSize: [110, 22],
          iconAnchor: [55, 11],
        });

        const pillMarker = L.marker([midLat, midLng], { icon: distancePillIcon, title: `Delivery details ${job.jobId.slice(-6)}` }).addTo(map);

        // Click handler on route / markers
        const handleLogisticsClick = () => {
          const riskInfo = getLogisticsRiskStatus(job.disruptionProbability, distanceKm, effectiveRadius);
          const eta = calculateSimulatedETA(job.requiredDeliveryTime, job.estimatedDelayHours);

          const entity = {
            type: 'logistics',
            jobId: job.jobId,
            displayId: `LG-${job.jobId.slice(-4).toUpperCase()}`,
            bookingId: job.bookingId,
            resourceId: job.resourceId,
            pickupAddress: job.pickupLocation?.address ? `${job.pickupLocation.address}, ${job.pickupLocation.city}` : 'Not recorded',
            deliveryAddress: job.deliveryLocation?.address ? `${job.deliveryLocation.address}, ${job.deliveryLocation.city}` : 'Not recorded',
            distanceKm,
            standardRadiusKm: STANDARD_LOGISTICS_RADIUS_KM,
            effectiveRadiusKm: effectiveRadius,
            isOutsideRadius: isOutsideSimRadius,
            disruptionProbability: job.disruptionProbability,
            estimatedDelayHours: job.estimatedDelayHours,
            delayText: formatDelay(job.estimatedDelayHours),
            eta,
            statusText: riskInfo.statusText,
            badgeLabel: riskInfo.badgeLabel,
            tone: riskInfo.tone,
            recommendation: isOutsideSimRadius
              ? 'Delivery lies outside the weather-adjusted operating radius. Assign closer partner or reschedule.'
              : job.recommendation || riskInfo.recommendation,
          };
          setSelectedEntity(entity);
          onSelectEntity?.(entity);
        };

        polyline.on('click', handleLogisticsClick);
        pickupMarker.on('click', handleLogisticsClick);
        deliveryMarker.on('click', handleLogisticsClick);
        pillMarker.on('click', handleLogisticsClick);

        layers.logisticsRoutes.push(polyline, pickupMarker, deliveryMarker, pillMarker);
      });
    }

    // ── C. Render Bookings (Fulfillment Nodes) ───────────────────────────
    if (allowBookings || filterAffectedOnly) {
      affectedBookings.forEach((b) => {
        // Match booking to its resource to find location
        const parentResource = affectedResources.find((r) => r.resourceId === b.resourceId);
        const parentCoords = resourceCoordsMap.get(b.resourceId) || getDispersedCoords(parseCoords(parentResource?.location));
        if (!parentCoords) return;

        const isRisk = b.riskLevel === 'critical' || b.riskLevel === 'high';
        if (filterAffectedOnly && !isRisk) return;

        // Position booking slightly offset from parent resource
        const offsetCoords = [parentCoords[0] + 0.0025, parentCoords[1] + 0.0025];

        const bookingIcon = L.divIcon({
          className: '',
          html: `
            <div class="cursor-pointer group flex items-center justify-center">
              <div class="w-6 h-6 rounded-lg ${
                isRisk ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'
              } flex items-center justify-center text-[10px] font-bold shadow-md border border-white">
                📅
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const bMarker = L.marker(offsetCoords, { icon: bookingIcon, zIndexOffset: 600, riseOnHover: true, title: `Booking ${b.bookingId.slice(-6)}` })
          .addTo(map)
          .on('click', () => {
            const entity = {
              type: 'booking',
              bookingId: b.bookingId,
              resourceId: b.resourceId,
              resourceTitle: parentResource?.title || 'Hospitality Resource',
              status: b.status,
              riskLevel: b.riskLevel,
              disruptionProbability: b.disruptionProbability,
              recommendation: b.recommendation,
              logisticsType: b.logistics === 'provider_transport' ? 'Provider Logistics' : 'Self Pickup',
            };
            setSelectedEntity(entity);
            onSelectEntity?.(entity);
          });

        bMarker.bindTooltip(
          `<div class="text-xs">
            <strong class="text-ink">Booking #${b.bookingId.slice(-4).toUpperCase()}</strong>
            <div class="text-[11px] ${isRisk ? 'text-red-700 dark:text-red-300 font-bold' : 'text-ink-soft'}">
              Risk: ${b.riskLevel.toUpperCase()} (${Math.round(b.disruptionProbability * 100)}/100)
            </div>
          </div>`,
          { direction: 'top', offset: [0, -10] }
        );

        layers.bookingMarkers.push(bMarker);
      });
    }

    // ── D. Render Public Signals & Clusters (STEP 13 & 14) ───────────────
    if (allowSignals || filterAffectedOnly) {
      const publicSignals = simResult?.publicSignals?.sampleSignals || [];
      const clusters = simResult?.publicSignals?.clusters || [];

      // 1. Render Geographic Clusters (STEP 14)
      clusters.forEach((cl) => {
        if (!cl.lat || !cl.lon) return;
        const clusterCoords = getDispersedCoords([cl.lat, cl.lon]);

        const clusterHtml = `
          <div class="twin-signal-cluster cursor-pointer flex items-center gap-1 bg-blue-600/95 hover:bg-blue-700 text-white px-2 py-0.5 rounded-full shadow-lg border border-white ring-2 ring-blue-400/40 text-[11px] font-bold whitespace-nowrap">
            <span>${escapeHtml(cl.dominantIcon)}</span>
            <span>${cl.count} Reports</span>
          </div>
        `;

        const clusterIcon = L.divIcon({
          className: '',
          html: clusterHtml,
          iconSize: [95, 24],
          iconAnchor: [47, 12],
        });

        const clusterMarker = L.marker(clusterCoords, { icon: clusterIcon, title: `Public report cluster` })
          .addTo(map)
          .on('click', () => {
            const entity = {
              type: 'signal_cluster',
              title: `${cl.count} Public Reports — ${cl.landmark}`,
              count: cl.count,
              dominantCategory: cl.dominantLabel,
              landmark: cl.landmark,
              reports: publicSignals.filter((s) => cl.signalIds?.includes(s.id)),
            };
            setSelectedEntity(entity);
            onSelectEntity?.(entity);
          });

        clusterMarker.bindTooltip(
          `<div class="text-xs font-semibold">
            <div>${escapeHtml(cl.dominantIcon)} ${escapeHtml(cl.landmark)}</div>
            <div class="text-[10px] text-blue-400">${cl.count} Public Reports Clustered</div>
          </div>`,
          { direction: 'top', offset: [0, -12] }
        );

        layers.signalMarkers.push(clusterMarker);
      });

      // 2. Render Individual Public Signals
      publicSignals.forEach((sig) => {
        const rawCoords = parseCoords(sig.location);
        if (!rawCoords) return; // Do not invent fake coordinates

        const isDisrupted = sig.severity === 'critical' || sig.severity === 'high';
        if (filterAffectedOnly && !isDisrupted) return;

        const coords = getDispersedCoords(rawCoords);

        const sigHtml = `
          <div class="twin-signal-marker cursor-pointer group transition-transform duration-200 hover:scale-125">
            <div class="w-7 h-7 rounded-full bg-blue-600 border border-white flex items-center justify-center text-xs shadow-md ${
              isDisrupted ? 'ring-2 ring-red-500/80' : 'ring-1 ring-blue-300'
            }">
              <span>${escapeHtml(sig.categoryIcon || '🌊')}</span>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: '',
          html: sigHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(coords, { icon, title: sig.title })
          .addTo(map)
          .on('click', () => {
            const entity = {
              type: 'signal',
              id: sig.id,
              title: sig.title,
              source: sig.source,
              categoryLabel: sig.categoryLabel,
              categoryIcon: sig.categoryIcon,
              severity: sig.severity,
              relativeTime: sig.relativeTime,
              location: sig.location?.landmark || sig.location?.name,
              summary: sig.summary,
              url: sig.url,
            };
            setSelectedEntity(entity);
            onSelectEntity?.(entity);
          });

        marker.bindTooltip(
          `<div class="text-xs max-w-xs leading-snug">
            <div class="font-bold text-ink">${escapeHtml(sig.categoryIcon)} ${escapeHtml(sig.categoryLabel)}</div>
            <div class="text-[11px] text-ink-soft">${escapeHtml(sig.source)} • ${escapeHtml(sig.relativeTime)}</div>
            <div class="text-[11px] text-blue-500 truncate mt-0.5">${escapeHtml(sig.title)}</div>
          </div>`,
          { direction: 'top', offset: [0, -10] }
        );

        layers.signalMarkers.push(marker);
      });
    }
  }, [
    simResult,
    centerLat,
    centerLng,
    effectiveRadius,
    filterType,
    isMapReady,
    onSelectEntity,
  ]);

  // Handle Zoom In / Out / Reset
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetView = () => {
    mapInstanceRef.current?.flyTo([centerLat, centerLng], 11, { duration: 1 });
  };

  // Weather score severity tone
  const isSevere = weatherClass.severity === 'severe' || weatherClass.severity === 'extreme';

  return (
    <div className="relative w-full bg-surface-alt border border-line rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold text-ink text-base">Operational coverage</h3><p className="text-xs text-ink-soft mt-1">Explore resources and delivery exposure around {centerCity}. Select a marker for details.</p></div>
        <span className="text-xs text-ink-soft">{effectiveRadius} km scenario radius · 30 km baseline</span>
      </div>

        {/* ── TOP-RIGHT CONTROLS & FILTER TOOLBAR (STEP 12) ── */}
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-3">
          {/* Zoom, Reset & Theme Buttons */}
          <div className="flex items-center bg-surface border border-line rounded-xl p-1  gap-1">
            <button
              onClick={handleZoomIn}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-sunk transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={handleZoomOut}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-sunk transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <div className="w-[1px] h-4 bg-line mx-0.5"></div>
            <button
              onClick={handleResetView}
              className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink hover:bg-surface-sunk transition-colors"
              title="Center on simulation hub"
            >
              <Crosshair size={13} className="text-indigo-500" />
              <span className="hidden sm:inline">Center</span>
            </button>
            <div className="w-[1px] h-4 bg-line mx-0.5"></div>
            <button
              onClick={toggleTheme}
              className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink hover:bg-surface-sunk transition-colors"
              title={dark ? 'Switch map to Light Mode' : 'Switch map to Dark Mode'}
            >
              {dark ? (
                <>
                  <Sun size={13} className="text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>

          {/* Filter Pills (STEP 12) */}
          <div className="twin-map-filters flex items-center flex-wrap gap-1 bg-surface border border-line rounded-xl p-1  text-xs font-semibold overflow-x-auto max-w-[90vw]">
            {[
              { id: 'all', label: 'All' },
              { id: 'resources', label: 'Resources' },
              { id: 'logistics', label: 'Logistics' },
              { id: 'bookings', label: 'Bookings' },
              { id: 'signals', label: 'Reports' },
              { id: 'affected', label: 'Affected' },
            ].map((f) => (
              <button
                key={f.id}
                aria-pressed={filterType === f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  filterType === f.id
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-surface-sunk'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Radius Toggles (STEP 4 & 5) */}
          <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3 py-1.5  text-[11px] font-medium text-ink">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showStandardRadius}
                onChange={(e) => setShowStandardRadius(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-line"
              />
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">30 km Standard</span>
            </label>
            <span className="text-line-strong">•</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showSimulatedRadius}
                onChange={(e) => setShowSimulatedRadius(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500 border-line"
              />
              <span className={effectiveRadius <= 15 ? 'text-red-700 dark:text-red-300 font-bold' : 'text-amber-700 dark:text-amber-300 font-semibold'}>
                {effectiveRadius} km Simulated
              </span>
            </label>
          </div>
        </div>


      {/* ── MAP CONTAINER WITH OVERLAYS ── */}
      <div className="relative w-full h-[400px] sm:h-[520px] lg:h-[560px] select-none">
        <style>{`
          .twin-dark-tiles {
            filter: invert(100%) hue-rotate(180deg) brightness(92%) contrast(90%) grayscale(25%);
          }
          .leaflet-tooltip {
            background: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'} !important;
            border: 1px solid ${dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'} !important;
            color: ${dark ? '#f8fafc' : '#0f172a'} !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px -5px ${dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.15)'} !important;
            padding: 8px 12px !important;
            backdrop-filter: blur(8px) !important;
            font-family: inherit !important;
            pointer-events: none !important;
          }
          .leaflet-tooltip-top:before {
            border-top-color: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'} !important;
          }
          .leaflet-tooltip-bottom:before {
            border-bottom-color: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'} !important;
          }
          .leaflet-tooltip-left:before {
            border-left-color: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'} !important;
          }
          .leaflet-tooltip-right:before {
            border-right-color: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'} !important;
          }
          .leaflet-tooltip .text-ink {
            color: ${dark ? '#f8fafc' : '#0f172a'} !important;
          }
          .leaflet-tooltip .text-ink-soft {
            color: ${dark ? '#94a3b8' : '#64748b'} !important;
          }
        `}</style>
        {/* Leaflet DOM Anchor */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* ── BOTTOM-LEFT MAP LEGEND (STEP 11) ── */}
        <div className="absolute bottom-4 left-4 z-[400] hidden sm:block bg-surface/95 dark:bg-surface/90 backdrop-blur-md border border-line rounded-2xl p-3 shadow-lg text-[11px] text-ink-soft max-w-xs">
          <span className="font-bold text-ink uppercase tracking-wider text-[10px] block mb-2">
            Map Legend
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span>🏛️</span>
              <span className="text-ink">Resource</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>📍</span>
              <span className="text-ink">Pickup Depot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>🎯</span>
              <span className="text-ink">Destination</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>📅</span>
              <span className="text-ink">Booking Node</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>🌊</span>
              <span className="text-ink">Public Signals</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b-2 border-dashed border-indigo-500 inline-block"></span>
              <span className="text-ink">30 km Standard</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 inline-block"></span>
              <span className="text-ink">{effectiveRadius} km Weather</span>
            </div>
          </div>
        </div>

        {/* ── SELECTED ENTITY DETAIL POPUP CARD (STEP 13) ── */}
        {selectedEntity && (
          <div style={{ maxHeight: 'calc(100% - 2rem)', overflowY: 'auto' }} className="absolute bottom-4 right-4 left-4 sm:left-auto z-[450] max-w-sm bg-surface dark:bg-surface-alt border border-line rounded-2xl p-4 shadow-2xl animate-fade-in text-ink">
            <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {selectedEntity.type === 'logistics'
                    ? '🚚'
                    : selectedEntity.type === 'booking'
                    ? '📅'
                    : selectedEntity.type === 'signal'
                    ? (selectedEntity.categoryIcon || '🌐')
                    : selectedEntity.type === 'signal_cluster'
                    ? '🌐'
                    : '🏛️'}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-ink leading-tight">
                    {selectedEntity.type === 'logistics'
                      ? `Delivery ${selectedEntity.displayId}`
                      : selectedEntity.type === 'booking'
                      ? `Booking #${selectedEntity.bookingId.slice(-4).toUpperCase()}`
                      : selectedEntity.title}
                  </h4>
                  <span className="text-[11px] text-ink-soft">
                    {selectedEntity.type === 'logistics'
                      ? 'Commercial Logistics Job'
                      : selectedEntity.type === 'booking'
                      ? selectedEntity.resourceTitle
                      : selectedEntity.type === 'signal'
                      ? `${selectedEntity.categoryLabel} • ${selectedEntity.source}`
                      : selectedEntity.type === 'signal_cluster'
                      ? `${selectedEntity.count} Public Reports Clustered`
                      : selectedEntity.categoryLabel}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEntity(null)}
                className="text-ink-soft hover:text-ink p-1 rounded-lg hover:bg-surface-sunk transition-colors"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Logistics Card Specifics (STEP 6) */}
            {selectedEntity.type === 'logistics' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-sunk/80 border border-line space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Distance:</span>
                    <strong className="text-ink">{selectedEntity.distanceKm} km</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Standard Service Radius:</span>
                    <span>30 km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Weather-Adjusted Radius:</span>
                    <strong className={selectedEntity.isOutsideRadius ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                      {selectedEntity.effectiveRadiusKm} km
                    </strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-line">
                    <span className="text-ink-soft">Status:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedEntity.tone}`}>
                      {selectedEntity.badgeLabel}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-sunk/80 border border-line space-y-1">
                  <div className="flex items-center gap-1.5 text-ink-soft">
                    <Clock size={12} className="text-amber-700 dark:text-amber-300" />
                    <span>Predicted Delay: <strong className="text-ink">{selectedEntity.delayText}</strong></span>
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-soft">
                    <span>Pickup: {selectedEntity.pickupAddress}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-soft">
                    <span>Destination: {selectedEntity.deliveryAddress}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[11px] leading-snug">
                  <strong>Recommendation:</strong> {selectedEntity.recommendation}
                </div>
              </div>
            )}

            {/* Resource Card Specifics (STEP 7) */}
            {selectedEntity.type === 'resource' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-sunk/80 border border-line space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Location:</span>
                    <span className="text-ink truncate max-w-[180px]">{selectedEntity.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Baseline capacity:</span>
                    <span>100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Modelled capacity:</span>
                    <strong className={selectedEntity.impactLevel === 'critical' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}>
                      {Math.round(selectedEntity.simulatedAvailabilityFactor * 100)}% ({selectedEntity.availabilityReductionPct}% drop)
                    </strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-line">
                    <span className="text-ink-soft">Impact Status:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedEntity.impactLevel === 'critical'
                        ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : selectedEntity.impactLevel === 'high'
                        ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                        : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {selectedEntity.impactLevel.toUpperCase()}
                    </span>
                  </div>
                </div>

                {selectedEntity.reasons && selectedEntity.reasons.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-surface-sunk border border-line text-[11px] text-ink-soft">
                    <strong className="block text-ink mb-1">Impact Factors:</strong>
                    <ul className="list-disc pl-3.5 space-y-0.5">
                      {selectedEntity.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Booking Card Specifics */}
            {selectedEntity.type === 'booking' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-sunk/80 border border-line space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Logistics Mode:</span>
                    <span className="text-ink">{selectedEntity.logisticsType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Scenario risk score:</span>
                    <strong className={selectedEntity.riskLevel === 'critical' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}>
                      {Math.round(selectedEntity.disruptionProbability * 100)}/100
                    </strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-line">
                    <span className="text-ink-soft">Risk Level:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedEntity.riskLevel === 'critical'
                        ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    }`}>
                      {selectedEntity.riskLevel.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-snug">
                  <strong>Recommendation:</strong> {selectedEntity.recommendation}
                </div>
              </div>
            )}

            {/* Public Signal Card Specifics (STEP 13 & 19) */}
            {selectedEntity.type === 'signal' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface-sunk/80 border border-line space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Category:</span>
                    <span className="font-semibold text-ink flex items-center gap-1">
                      <span>{selectedEntity.categoryIcon}</span>
                      <span>{selectedEntity.categoryLabel}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Source:</span>
                    <span className="text-ink font-medium">{selectedEntity.source}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Reported:</span>
                    <span className="text-ink">{selectedEntity.relativeTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Location:</span>
                    <span className="text-ink truncate max-w-[180px]">{selectedEntity.location}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-line">
                    <span className="text-ink-soft">Severity:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedEntity.severity === 'critical' || selectedEntity.severity === 'high'
                          ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {selectedEntity.severity}
                    </span>
                  </div>
                </div>

                {selectedEntity.summary && (
                  <div className="p-2.5 rounded-xl bg-surface-sunk border border-line text-[11px] text-ink-soft">
                    <p>{selectedEntity.summary}</p>
                  </div>
                )}

                {/^https?:\/\//i.test(selectedEntity.url || '') && (
                  <a
                    href={selectedEntity.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5 hover:text-blue-600 font-semibold"
                  >
                    <span>View Original Report</span>
                    <ExternalLink size={12} />
                  </a>
                )}

                <p className="text-[10px] text-ink-soft italic text-center">
                  Public signal — not independently verified
                </p>
              </div>
            )}

            {/* Signal Cluster Card Specifics (STEP 14) */}
            {selectedEntity.type === 'signal_cluster' && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                  <span className="font-bold block text-xs">High Signal Activity Area</span>
                  <span className="text-[11px]">
                    {selectedEntity.count} reports clustered around {selectedEntity.landmark}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {selectedEntity.reports?.map((r, i) => (
                    <div key={i} className="p-2 rounded-lg bg-surface-sunk border border-line text-[11px]">
                      <div className="font-semibold text-ink">{r.title}</div>
                      <div className="text-[10px] text-ink-soft mt-0.5 flex justify-between">
                        <span>{r.source}</span>
                        <span>{r.relativeTime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MAP FOOTER BAR: SUMMARY STATS STRIP ── */}
      <div className="px-5 py-3 bg-surface border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-ink-soft">
            Planning area: <strong className="text-ink">{centerCity} ({centerLat.toFixed(4)}, {centerLng.toFixed(4)})</strong>
          </span>
          <span className="text-line-strong hidden sm:inline">•</span>
          <span className="text-ink-soft">
            Resources assessed: <strong className="text-ink">{simResult?.affectedResources?.length || 0}</strong>
          </span>
          <span className="text-line-strong hidden sm:inline">•</span>
          <span className="text-ink-soft">
            Deliveries assessed: <strong className="text-ink">{simResult?.affectedLogisticsJobs?.length || 0}</strong>
          </span>
          <span className="text-line-strong hidden sm:inline">•</span>
          <span className="text-ink-soft">
            Bookings assessed: <strong className="text-ink">{simResult?.affectedBookings?.length || 0}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 text-ink-soft text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>Approximate locations · Direct route lines</span>
        </div>
      </div>
    </div>
  );
}
