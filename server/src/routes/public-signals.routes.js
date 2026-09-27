/**
 * public-signals.routes.js
 *
 * Express routes for Stage 4 — Public / Social Signal Integration
 */

import { Router } from 'express';
import {
  getPublicSignals,
  correlateWeatherAndSignals,
} from '../services/public-signals.service.js';

const router = Router();

/**
 * GET /api/public-signals
 * Returns normalized public signals, aggregation metrics, and geographic clusters for a city.
 */
router.get('/', async (req, res, next) => {
  try {
    const location = req.query.location || 'Thane';
    const forceRefresh = req.query.refresh === 'true';

    const result = await getPublicSignals(location, forceRefresh);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public-signals/correlation
 * Returns the correlation between simulated weather severity and public signals.
 */
router.get('/correlation', async (req, res, next) => {
  try {
    const location = req.query.location || 'Thane';
    const severity = req.query.weatherSeverity || 'moderate';
    const score = Number(req.query.weatherScore) || 50;

    const signalsData = await getPublicSignals(location, false);
    const correlation = correlateWeatherAndSignals(
      { severity, score },
      signalsData.aggregation
    );

    res.json({
      success: true,
      location,
      correlation,
      aggregation: signalsData.aggregation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/public-signals/refresh
 * Forces a cache-busting refresh for the specified location.
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const location = req.body.location || req.query.location || 'Thane';
    const result = await getPublicSignals(location, true);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
