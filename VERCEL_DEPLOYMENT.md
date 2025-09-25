# Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **PostgreSQL Database**: Use a hosted PostgreSQL service (recommended: [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app))
3. **Domain**: Optional, but recommended for production

## Step 1: Database Setup

### Option A: Neon (Recommended)
1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string (it looks like: `postgresql://user:password@host/database?sslmode=require`)

### Option B: Supabase
1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > Database > Connection string
4. Copy the URI

## Step 2: Deploy to Vercel

### Method 1: Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (first time)
vercel

# Follow the prompts:
# - Link to existing project or create new? → Create new
# - Project name → espfun-backend
# - Directory → ./
```

### Method 2: GitHub Integration

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Connect your GitHub repository
5. Vercel will auto-detect the configuration

## Step 3: Environment Variables

Set these environment variables in Vercel dashboard (Project Settings > Environment Variables):

### Required Variables
```env
# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# JWT
JWT_SECRET=your-super-secure-jwt-key-at-least-32-characters-long
JWT_EXPIRES_IN=24h

# Blockchain
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143

# EIP712
FDF_PAIR_CONTRACT_ADDRESS=0xA160B769d12A0F3B932113BB4F181544Af5Ee68d
TX_SIGNER_PRIVATE_KEY=your_tx_signer_private_key_here

# Private Keys (⚠️ Use different keys for production!)
PACK_ISSUER_PRIVATE_KEY=your_pack_issuer_private_key_here

# API Configuration
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=50

# Logging
LOG_LEVEL=info

# Admin
ADMIN_WALLET_ADDRESS=0xeCC4da76C47dc134754199820f764180fd56ed2E
```

## Step 4: Database Migration

After deployment, run the database migration:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Optional: Seed initial data
npx prisma db seed
```

## Step 5: Update Frontend

Update your frontend to use the new Vercel API URL:

```javascript
// Before
const API_BASE = 'http://localhost:5000/api';

// After
const API_BASE = 'https://your-project-name.vercel.app/api';
```

## Step 6: Testing

Test your deployment:

```bash
# Health check
curl https://your-project-name.vercel.app/api/health

# API documentation (if enabled)
open https://your-project-name.vercel.app/api-docs
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Ensure DATABASE_URL is correct
   - Check if database allows external connections
   - Verify SSL mode is set to `require`

2. **Prisma Client Error**
   - Run `npx prisma generate` after deployment
   - Ensure schema.prisma is committed

3. **Cold Start Issues**
   - Vercel serverless functions have cold starts (~1-3 seconds)
   - This is normal for serverless deployments

4. **Environment Variables Not Working**
   - Variables are case-sensitive
   - Restart deployment after adding new variables

### Logs

Check Vercel function logs in the dashboard:
- Go to your project
- Click "Functions" tab
- Click on the function to see logs

## Production Considerations

1. **Security**:
   - Use strong, unique private keys for production
   - Enable CORS only for your domain
   - Use HTTPS (Vercel provides this automatically)

2. **Performance**:
   - Consider Redis for caching (optional)
   - Monitor function execution times
   - Use Vercel's analytics

3. **Database**:
   - Set up database backups
   - Monitor connection limits
   - Consider connection pooling

4. **Monitoring**:
   - Set up error tracking (e.g., Sentry)
   - Monitor API usage
   - Set up alerts for failures

## Cost Optimization

- Vercel Hobby plan: 100GB bandwidth, 100 hours execution time/month
- Database costs vary by provider
- Monitor usage to avoid unexpected bills

## Rollback

If you need to rollback:

```bash
# Via Vercel CLI
vercel rollback

# Or via dashboard
# Go to Deployments > Click three dots > Rollback
```