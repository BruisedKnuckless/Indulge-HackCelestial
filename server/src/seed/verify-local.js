// Set before importing dotenv/configuration: verification re-seeds its database.
// Never let a developer's .env point this destructive suite at persistent data.
process.env.MONGO_URI = '';
process.env.MONGODB_URI = '';
process.env.NODE_ENV = 'test';
process.env.IN_VERIFY = 'true';
await import('./verify.js');
