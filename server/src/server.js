import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { initSockets } from './sockets/index.js';
import { runSeed } from './seed/seed.js';

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

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    console.log(`\n  Indulge API  →  http://localhost:${env.port}`);
    console.log(`  Client origin →  ${env.clientUrl}\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start Indulge API:', err);
  process.exit(1);
});
