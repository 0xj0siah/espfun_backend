import { Request, Response, NextFunction } from 'express';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  error: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    details: error.details
  });

  // Default error status
  let status = error.statusCode || 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
  } else if (error.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError') {
    status = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError') {
    status = 404;
    message = 'Resource not found';
  } else if (error.statusCode === 409) {
    message = 'Conflict';
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && status === 500) {
    message = 'Internal server error';
  } else if (process.env.NODE_ENV !== 'production') {
    message = error.message;
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { details: error.details })
  });
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
