import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { ensureBootstrapAdmin, logAdminConfig } from './config/admin.js';
import { initSockets } from './sockets/index.js';
import { runSeed } from './seed/seed.js';
import { logger } from './utils/logger.js';

let server;

async function shutdown(signal) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await disconnectDB();
        logger.info('Database disconnected cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during database disconnect:', { error: err.message });
        process.exit(1);
      }
    });

    // Force exit if hanging connections take longer than 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main() {
  const { ephemeral } = await connectDB();

  // An in-memory database starts empty every boot, so seed it automatically —
  // otherwise the app would come up with nothing to show.
  if (ephemeral) {
    console.log('Seeding demo data…');
    await runSeed({ quiet: true });
  } else {
    const count = await mongoose.connection.db.collection('users').countDocuments();
    if (count === 0) {
      console.log('Empty database detected — seeding demo data…');
      await runSeed({ quiet: true });
    }
  }

  // ADMIN_EMAIL + ADMIN_PASSWORD give a deployment its administrator; upserted
  // on every boot, so it is idempotent and follows password rotation.
  const bootstrap = await ensureBootstrapAdmin();

  const app = createApp();
  server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    console.log(`\n  Indulge API  →  http://localhost:${env.port}`);
    console.log(`  Client origin →  ${env.clientUrl}`);
    // A locked admin console 404s every request by design, which looks exactly
    // like a bug from the outside. Say which it is, once, where a deployment
    // log will show it.
    logAdminConfig(bootstrap)
      .catch((err) => console.error('  ! Could not report admin status:', err.message))
      .finally(() => console.log(''));
  });
}

main().catch((err) => {
  console.error('Failed to start Indulge API:', err);
  process.exit(1);
});
