/**
 * weather.routes.js
 *
 * GET /api/weather?lat=<latitude>&lon=<longitude>
 *
 * Public endpoint — no auth required (weather data is not sensitive).
 * The OpenWeather API key is NEVER exposed in requests, responses, or logs.
 */

import { Router } from 'express';
import { getWeatherByCoords, getCacheStats } from '../services/weather.service.js';

const router = Router();

/**
 * GET /api/weather
 * Query params: lat (number), lon (number)
 *
 * Returns a normalized IndulgeWeatherSnapshot or an availability envelope.
 */
router.get('/', async (req, res, next) => {
  try {
    const { lat, lon } = req.query;

    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        error: 'Missing required query parameters: lat and lon',
        example: '/api/weather?lat=19.2183&lon=72.9781',
      });
    }

    const snapshot = await getWeatherByCoords(lat, lon);

    // 200 even when available=false — the API is functioning, weather just
    // couldn't be fetched. Let callers decide how to handle gracefully.
    return res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/weather/cache
 * Returns cache statistics for monitoring / health dashboards.
 * Does not expose any API key or sensitive data.
 */
router.get('/cache', (req, res) => {
  res.json({ cache: getCacheStats() });
});

export default router;
