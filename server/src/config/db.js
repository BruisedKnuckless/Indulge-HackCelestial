import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * Uses MONGO_URI when provided (local mongod or Atlas). When it is absent we
 * spin up an in-memory MongoDB instead, so the prototype boots on a machine
 * with no Mongo installed. In-memory data is wiped on restart, which is why
 * server.js re-seeds automatically in that mode.
 */
export async function connectDB() {
  let uri = env.mongoUri;
  let ephemeral = false;

  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
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

  return { ephemeral };
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
