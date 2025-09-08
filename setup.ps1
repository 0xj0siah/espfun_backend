# ESPFun Backend Development Setup Script for Windows

Write-Host "🚀 Setting up ESPFun Backend Development Environment" -ForegroundColor Green

# Check if .env exists
if (!(Test-Path ".env")) {
    Write-Host "📝 Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "⚠️  Please edit .env file with your configuration before continuing!" -ForegroundColor Red
    Write-Host "Press any key to continue..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
npm install

Write-Host "🗄️  Setting up database..." -ForegroundColor Blue
npx prisma generate
Write-Host "📊 Database client generated successfully!" -ForegroundColor Green

Write-Host "🏗️  Building the project..." -ForegroundColor Blue
npm run build

Write-Host "✅ Setup complete! You can now:" -ForegroundColor Green
Write-Host "   • Start development server: npm run dev" -ForegroundColor White
Write-Host "   • Run database migrations: npm run migrate" -ForegroundColor White
Write-Host "   • Seed database: npm run seed" -ForegroundColor White
Write-Host "   • View API docs: http://localhost:3000/api-docs" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Don't forget to:" -ForegroundColor Yellow
Write-Host "   • Set up PostgreSQL database" -ForegroundColor White
Write-Host "   • Configure Redis (optional but recommended)" -ForegroundColor White
Write-Host "   • Update .env with your Monad RPC endpoint" -ForegroundColor White
Write-Host "   • Set your admin wallet address" -ForegroundColor White
