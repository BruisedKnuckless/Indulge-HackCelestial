import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { apiLimiter, authLimiter } from './middleware/rate-limit.middleware.js';

import authRoutes from './routes/auth.routes.js';
import resourceRoutes from './routes/resource.routes.js';
import searchRoutes from './routes/search.routes.js';
import cartRoutes from './routes/cart.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import negotiationRoutes from './routes/negotiation.routes.js';
import reviewRoutes from './routes/review.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import requirementRoutes from './routes/requirement.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminAuthRoutes from './routes/admin-auth.routes.js';
import logisticsRoutes from './routes/logistics.routes.js';
import procurementOrderRoutes from './routes/procurement-order.routes.js';
import capacityRecoveryRoutes from './routes/capacity-recovery.routes.js';
import contributionRoutes from './routes/contribution.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import historyRoutes from './routes/history.routes.js';
import billingRoutes from './routes/billing.routes.js';

export function createApp() {
  const app = express();

  // 1. Production Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // 2. Correlation ID for all incoming requests
  app.use(requestIdMiddleware);

  // 3. Strict CORS Allowlist
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, mobile apps)
      if (!origin) return callback(null, true);

      const normalized = origin.trim().replace(/\/+$/, '');
      const allowed = env.allowedOrigins;

      // In production: strict allowlist matching, reject wildcard
      if (env.isProduction) {
        if (allowed.includes(normalized)) {
          return callback(null, true);
        }
        const corsErr = new Error(`CORS policy: origin "${origin}" is not allowed.`);
        corsErr.status = 403;
        return callback(corsErr);
      }

      // In development / test: allow configured origins and common local dev hosts
      if (
        allowed.includes(normalized) ||
        normalized === 'http://localhost:5173' ||
        normalized === 'http://127.0.0.1:5173' ||
        normalized === 'http://localhost:5050'
      ) {
        return callback(null, true);
      }

      const corsErr = new Error(`CORS policy: origin "${origin}" is not allowed.`);
      corsErr.status = 403;
      return callback(corsErr);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'x-test-rate-limit'],
    exposedHeaders: ['X-Request-Id'],
  };

  app.use(cors(corsOptions));

  // 4. Request Body Size Limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Static Media Uploads Directory
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'public/uploads')));

  // 5. Logging
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // 6. Rate Limiting
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/admin/auth/login', authLimiter);

  // 7. Observability: Health and Readiness Endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'indulge-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: req.id,
    });
  });

  app.get('/api/ready', (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (!isDbConnected) {
      return res.status(503).json({
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        error: 'Database is not connected.',
      });
    }
    res.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: req.id,
    });
  });

  // 8. Domain Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/negotiations', negotiationRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/procurement-orders', procurementOrderRoutes);
  app.use('/api/capacity-recovery', capacityRecoveryRoutes);
  app.use('/api/contribution', contributionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  // Admin sign-in must be mounted before the console, whose router requires an
  // admin token on every path beneath /api/admin.
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/logistics', logisticsRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/billing', billingRoutes);

  // 9. Error Handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
