/**
 * digital-twin.routes.js
 *
 * POST /api/digital-twin/simulate
 * GET  /api/digital-twin/status
 *
 * All endpoints are READ-ONLY with respect to the real database.
 * The simulation result is a transient in-memory computation only.
 */

import { Router } from 'express';
import { runWeatherSimulation, getTwinStatus } from '../services/digital-twin.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/digital-twin/simulate
 *
 * Body:
 * {
 *   location: "Thane" | { lat: 19.2183, lon: 72.9781 },
 *   scenario: {
 *     rainfallMmPerHour: 90,
 *     windSpeedMps: 15,
 *     temperature: 28,
 *     durationHours: 5
 *   },
 *   useLiveWeather: false   // optional: enrich with live OpenWeather data
 * }
 */
router.post('/simulate', async (req, res, next) => {
  try {
    const { location, scenario, useLiveWeather } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'location is required (city name or {lat,lon})' });
    }
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      return res.status(400).json({ error: 'scenario object is required' });
    }

    const result = await runWeatherSimulation({ location, scenario, useLiveWeather, userId: req.user._id });
    return res.status(result.success ? 200 : (result.statusCode || 400)).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/digital-twin/status
 * Returns current marketplace counts (read-only health check).
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await getTwinStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
