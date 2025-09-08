export function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  JWT_SECRET should be at least 32 characters long for better security');
  }

  // Validate database URL format
  if (process.env.DATABASE_URL) {
    const isPostgres = process.env.DATABASE_URL.startsWith('postgresql://');
    const isSQLite = process.env.DATABASE_URL.startsWith('file:');
    
    if (!isPostgres && !isSQLite) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL (postgresql://) or SQLite (file:) connection string');
    }

    if (isSQLite) {
      console.log('🔧 Using SQLite database for development');
    }
  }

  // Warn about missing optional but recommended variables
  if (!process.env.MONAD_RPC_URL) {
    console.warn('⚠️  MONAD_RPC_URL not set - blockchain features will not work properly');
  }

  if (!process.env.REDIS_URL) {
    console.warn('⚠️  REDIS_URL not set - using in-memory storage (not recommended for production)');
  }
}
