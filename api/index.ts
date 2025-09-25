import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import expressWinston from 'express-winston';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

import { authRoutes } from '../src/routes/auth';
import { userRoutes } from '../src/routes/users';
import { playerRoutes } from '../src/routes/players';
import { pointsRoutes } from '../src/routes/points';
import { packRoutes } from '../src/routes/packs';
import { adminRoutes } from '../src/routes/admin';
import { buyTokensRoutes } from '../src/routes/buyTokens';
import sellTokensRoutes from '../src/routes/sellTokens';
import { errorHandler } from '../src/middleware/errorHandler';
import { validateEnvironment } from '../src/config/environment';
import { initializeDatabase } from '../src/config/database';
import { initializeRedis } from '../src/config/redis';

dotenv.config();

// Validate environment variables
validateEnvironment();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://your-frontend-domain.vercel.app'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting (reduced for serverless)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '50'), // Reduced for serverless
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Logging middleware (simplified for serverless)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'espfun-backend' },
  transports: [
    new winston.transports.Console(), // Only console logging for Vercel
  ],
});

app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false,
}));

// Swagger documentation (only in development)
if (process.env.NODE_ENV !== 'production') {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ESPFun Backend API',
        version: '1.0.0',
        description: 'Fantasy Esports API for Monad Blockchain',
      },
      servers: [
        {
          url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
          description: 'API Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    apis: ['./src/routes/*.ts'],
  };

  const specs = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/packs', packRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/buyTokens', buyTokensRoutes);
app.use('/api/sell-tokens', sellTokensRoutes);

// Error handling middleware
app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));
app.use(errorHandler);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Vercel serverless function export
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Initialize database connection (only once)
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Initialize Redis connection (optional)
    try {
      if (process.env.REDIS_URL) {
        await initializeRedis();
        logger.info('Redis connected successfully');
      } else {
        logger.warn('Redis not configured - using in-memory storage');
      }
    } catch (error) {
      logger.warn('Redis connection failed, continuing without caching:', error);
    }

    // Handle the request with Express
    return app(req, res);
  } catch (error) {
    logger.error('Failed to handle request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}