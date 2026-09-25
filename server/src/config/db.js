import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * In production:
 *   - MONGODB_URI (or MONGO_URI) is strictly mandatory.
 *   - The process throws and terminates immediately if missing.
 *   - Memory server is never loaded or initialized.
 *
 * In development / test:
 *   - Uses MONGODB_URI/MONGO_URI if provided (local or remote).
 *   - Spins up ephemeral mongodb-memory-server if unset.
 */
export async function connectDB({ forceProductionCheck = false } = {}) {
  let uri = env.mongoUri;
  const isProd = env.isProduction || forceProductionCheck;
  let ephemeral = false;

  if (isProd && !uri) {
    throw new Error(
      'FATAL: MONGODB_URI (or MONGO_URI) is required in production. In-memory MongoDB fallback is strictly prohibited in production.'
    );
  }

  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const path = await import('path');
    const fs = await import('fs');

    let createOpts = {};
    try {
      const preferredDir = process.platform === 'win32' && process.cwd().startsWith('D:') ? 'D:\\temp' : null;
      if (preferredDir) {
        if (!fs.existsSync(preferredDir)) fs.mkdirSync(preferredDir, { recursive: true });
        const dbPath = path.join(preferredDir, `mongo-mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        fs.mkdirSync(dbPath, { recursive: true });
        createOpts = { instance: { dbPath } };
      }
    } catch {
      // fallback to default
    }

    memoryServer = await MongoMemoryServer.create(createOpts);
    uri = memoryServer.getUri('indulge');
    ephemeral = true;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  console.log(
    ephemeral
      ? '✓ MongoDB (in-memory) connected — data resets on restart'
      : `✓ MongoDB connected — ${uri.replace(/\/\/.*@/, '//<credentials>@')}`
  );

  return { ephemeral, uri };
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    try {
      await memoryServer.stop();
    } catch {
      // ignore memory-server shutdown errors on Windows
    }
    memoryServer = null;
  }
}
