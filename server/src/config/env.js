import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // 5000 is taken by AirPlay Receiver on macOS, so default to 5050.
  port: process.env.PORT || 5050,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'indulge-dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
};
