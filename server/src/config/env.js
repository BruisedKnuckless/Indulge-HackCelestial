import dotenv from 'dotenv';

dotenv.config();

/** Supported environments */
export const VALID_NODE_ENVS = ['development', 'test', 'production'];

/** Default insecure secret used only for local development/testing */
export const DEFAULT_DEV_JWT_SECRET = 'indulge-dev-secret-change-me';

/**
 * Parses a comma-separated list of origins into a clean array.
 */
export function parseOrigins(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Validates and normalizes runtime configuration.
 * Throws in production when critical settings are missing or insecure.
 */
export function validateEnv(customEnv = process.env, { requireDb = false, requireJwt = false } = {}) {
  const nodeEnv = (customEnv.NODE_ENV || 'development').trim().toLowerCase();

  if (!VALID_NODE_ENVS.includes(nodeEnv)) {
    throw new Error(
      `FATAL: Invalid NODE_ENV "${nodeEnv}". Must be one of: ${VALID_NODE_ENVS.join(', ')}.`
    );
  }

  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const isDevelopment = nodeEnv === 'development';

  const port = parseInt(customEnv.PORT || '5050', 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`FATAL: Invalid PORT "${customEnv.PORT}". Must be a valid port number (1-65535).`);
  }

  const mongoUri = (customEnv.MONGODB_URI || customEnv.MONGO_URI || '').trim();
  if (isProduction && requireDb && !mongoUri) {
    throw new Error(
      'FATAL: MONGODB_URI (or MONGO_URI) is required in production. In-memory MongoDB fallback is strictly prohibited in production.'
    );
  }

  const jwtSecret = (customEnv.JWT_SECRET || (isProduction && requireJwt ? '' : DEFAULT_DEV_JWT_SECRET)).trim();
  if (isProduction && requireJwt) {
    if (!jwtSecret) {
      throw new Error('FATAL: JWT_SECRET is required in production.');
    }
    if (jwtSecret === DEFAULT_DEV_JWT_SECRET) {
      throw new Error(
        'FATAL: JWT_SECRET cannot use the default development secret in production. Set a strong, unique secret.'
      );
    }
    if (jwtSecret.length < 16) {
      throw new Error('FATAL: JWT_SECRET must be at least 16 characters long in production.');
    }
  }

  const clientUrl = (customEnv.CLIENT_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
  const rawAllowedOrigins = customEnv.ALLOWED_ORIGINS || clientUrl;
  const allowedOrigins = parseOrigins(rawAllowedOrigins);

  if (isProduction && allowedOrigins.includes('*')) {
    throw new Error('FATAL: Permissive CORS origin "*" is strictly prohibited in production.');
  }

  return {
    nodeEnv,
    isProduction,
    isTest,
    isDevelopment,
    port,
    mongoUri,
    jwtSecret: jwtSecret || DEFAULT_DEV_JWT_SECRET,
    jwtExpires: customEnv.JWT_EXPIRES || '7d',
    clientUrl,
    allowedOrigins,
  };
}

// Initial default configuration
let currentConfig = validateEnv(process.env);

export const env = currentConfig;

/**
 * Re-reads and re-validates configuration (useful for test suites verifying fail-fast).
 */
export function reloadEnv(customEnv = process.env) {
  currentConfig = validateEnv(customEnv);
  Object.assign(env, currentConfig);
  return env;
}
