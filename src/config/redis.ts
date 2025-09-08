import { createClient, RedisClientType } from 'redis';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

let redis: RedisClientType;

export async function initializeRedis() {
  try {
    redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redis.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    await redis.connect();
    logger.info('Successfully connected to Redis');
    
    return redis;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedis() {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
}

export async function disconnectRedis() {
  if (redis) {
    await redis.disconnect();
    logger.info('Disconnected from Redis');
  }
}
