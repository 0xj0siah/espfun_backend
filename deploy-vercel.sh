#!/bin/bash

echo "🚀 ESPFun Backend - Vercel Deployment Script"
echo "==========================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "🔐 Please login to Vercel:"
    vercel login
fi

# Check for required environment variables
echo "🔍 Checking environment variables..."

required_vars=("DATABASE_URL" "JWT_SECRET" "MONAD_RPC_URL" "TX_SIGNER_PRIVATE_KEY" "PACK_ISSUER_PRIVATE_KEY")

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "⚠️  Missing environment variables:"
    printf '   - %s\n' "${missing_vars[@]}"
    echo ""
    echo "Please set these in your .env file or Vercel dashboard"
    echo "Continuing with deployment anyway..."
fi

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Build the project
echo "🔨 Building TypeScript..."
npm run build

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Vercel dashboard if not done"
echo "2. Run database migrations: npx prisma db push"
echo "3. Update your frontend to use the new API URL"
echo "4. Test the deployment with: curl https://your-app.vercel.app/api/health"