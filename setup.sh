#!/bin/bash

# ESPFun Backend Development Setup Script

set -e

echo "🚀 Setting up ESPFun Backend Development Environment"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before continuing!"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Setting up database..."
npx prisma generate
echo "📊 Database client generated successfully!"

echo "🏗️  Building the project..."
npm run build

echo "✅ Setup complete! You can now:"
echo "   • Start development server: npm run dev"
echo "   • Run database migrations: npm run migrate"
echo "   • Seed database: npm run seed"
echo "   • View API docs: http://localhost:3000/api-docs"
echo ""
echo "🔧 Don't forget to:"
echo "   • Set up PostgreSQL database"
echo "   • Configure Redis (optional but recommended)"
echo "   • Update .env with your Monad RPC endpoint"
echo "   • Set your admin wallet address"
