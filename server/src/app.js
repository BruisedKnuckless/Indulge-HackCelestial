import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import resourceRoutes from './routes/resource.routes.js';
import searchRoutes from './routes/search.routes.js';
import cartRoutes from './routes/cart.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import negotiationRoutes from './routes/negotiation.routes.js';
import reviewRoutes from './routes/review.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import requirementRoutes from './routes/requirement.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'indulge-api' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/negotiations', negotiationRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/requirements', requirementRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
