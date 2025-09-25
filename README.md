# ESPFun Backend - Fantasy Esports API

A secure backend API for fantasy esports gaming on the Monad blockchain. This system manages wallet addresses, NFT player collections, and off-chain point balances for tournament and skill points.

## Features

- 🔐 **Secure Wallet Authentication** - Web3 signature-based authentication
- 🏆 **NFT Player Management** - Sync and manage player NFTs from Monad blockchain
- 💰 **Dual Point System** - Tournament points and skill points with transaction history
- 📦 **Player Pack System** - Purchase and open player packs using tournament points on Monad blockchain
- 🛡️ **Security Features** - Rate limiting, input validation, CORS protection
- 📊 **Admin Dashboard** - Administrative tools for platform management
- 📖 **API Documentation** - Swagger/OpenAPI documentation

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis
- **Blockchain**: Monad (Ethers.js)
- **Authentication**: JWT tokens
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- Monad blockchain access

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/espfun_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
MONAD_RPC_URL="https://your-monad-rpc-endpoint.com"
MONAD_CHAIN_ID=10143
ADMIN_WALLET_ADDRESS="0x..."
```

3. **Set up the database**:
```bash
npx prisma migrate dev
npx prisma generate
npm run seed  # Optional: Add sample data
```

4. **Start the development server**:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`
API documentation at `http://localhost:3000/api-docs`

## API Endpoints

### Authentication
- `POST /api/auth/nonce` - Get authentication nonce
- `POST /api/auth/login` - Login with wallet signature

### Users
- `GET /api/users/profile` - Get current user profile
- `GET /api/users/:walletAddress` - Get user by wallet address
- `GET /api/users/leaderboard` - Get points leaderboard

### Players (NFTs)
- `POST /api/players/sync` - Sync NFT players from blockchain
- `GET /api/players` - Get user's players

### Points System
- `GET /api/points/balance` - Get point balances
- `GET /api/points/history` - Get point transaction history
- `POST /api/points/award` - Award points to user

### Player Packs
- `GET /api/packs` - Get available packs
- `POST /api/packs/:packId/purchase` - Purchase a pack
- `POST /api/packs/create` - Create new pack (admin)

### Admin
- `GET /api/admin/stats` - Platform statistics
- `POST /api/admin/users/:userId/adjust-points` - Adjust user points
- `POST /api/admin/events` - Create game events

## Database Schema

### Core Models

**Users**
- Wallet address (unique identifier)
- Tournament points and skill points balances
- Creation/update timestamps

**Players** 
- NFT token ID and contract address
- Owner relationship
- Bench status and metadata
- Stats and position information

**Transactions**
- Point transactions with types (EARNED, SPENT, REWARD)
- Amount, point type, and descriptions
- Optional blockchain transaction references

**Point History**
- Detailed audit trail of all point changes
- Previous/new balances and reasons

## Security Features

- **Input Validation**: Comprehensive request validation using express-validator
- **Rate Limiting**: API endpoint protection against abuse
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers and protection middleware  
- **JWT Authentication**: Secure token-based authentication
- **Signature Verification**: Web3 signature validation for wallet authentication
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **Error Handling**: Centralized error handling with sanitized responses

## Point System

### Tournament Points
- Used for purchasing tournament-related packs
- Earned through gameplay and events
- Required for competitive features

### Skill Points  
- Used for skill packs and player promotions
- Earned through achievements and challenges

### Transaction Types
- `EARNED`: Points gained through gameplay
- `SPENT`: Points used for purchases
- `TRANSFERRED`: Points moved between accounts
- `PACK_PURCHASE`: Points spent on player packs
- `REWARD`: Points awarded by admins

## Blockchain Integration

### Monad Blockchain Features
- NFT ownership verification
- Player collection synchronization
- Smart contract interaction
- Transaction receipt validation

### Supported Operations
- Verify wallet signatures for authentication
- Fetch owned NFT collections
- Validate NFT ownership on-chain
- Monitor blockchain transactions

## Development

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

### Database Migrations
```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset

# Deploy to production
npx prisma migrate deploy
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode  
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Pack Purchase API

The backend now supports purchasing player packs directly on the Monad blockchain using tournament points.

### Pack Types and Costs
- **PRO Pack**: 100 tournament points
- **EPIC Pack**: 250 tournament points  
- **LEGENDARY Pack**: 500 tournament points

### API Endpoint
```
POST /api/packs/{packType}/purchase
Authorization: Bearer {jwt_token}
```

**Path Parameters:**
- `packType`: `PRO`, `EPIC`, or `LEGENDARY`

**Response:**
```json
{
  "message": "Pack purchased successfully",
  "pack": {
    "type": "PRO",
    "cost": 100,
    "pointType": "TOURNAMENT"
  },
  "transaction": {
    "txHash": "0x...",
    "playerIds": [1, 2, 3, 4],
    "shares": ["10000000000000000000", "20000000000000000000", ...]
  },
  "remainingPoints": 900
}
```

### Environment Setup
Add the pack issuer private key to your `.env`:
```env
PACK_ISSUER_PRIVATE_KEY="your-pack-issuer-private-key-here"
```

The pack issuer wallet must have the `PACK_ISSUER_ROLE` on the PlayerPack contract.

## Deployment

### Local Development
```bash
npm run dev
```

### Vercel Deployment (Recommended)

The backend is configured for serverless deployment on Vercel:

**Production URL**: https://espfun-backend-l3ro9a6xj-0xj0siahs-projects.vercel.app

1. **Prerequisites**:
   - Vercel account
   - PostgreSQL database (Neon, Supabase, or Railway recommended)

2. **Deploy**:
   ```bash
   # Install dependencies
   npm install
   
   # Deploy to Vercel
   npm run vercel:deploy
   ```

3. **Environment Variables**:
   Set the following in Vercel dashboard:
   ```env
   DATABASE_URL=postgresql://...
   JWT_SECRET=your-secure-jwt-key
   MONAD_RPC_URL=https://testnet-rpc.monad.xyz
   TX_SIGNER_PRIVATE_KEY=your-key
   PACK_ISSUER_PRIVATE_KEY=your-key
   ```

4. **Database Setup**:
   ```bash
   npx prisma db push
   ```

See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for detailed instructions.

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring and Logging

- **Winston Logging**: Structured logging with multiple transports
- **Request Logging**: HTTP request/response logging
- **Error Tracking**: Centralized error handling and logging
- **Health Check**: `/health` endpoint for monitoring

## API Rate Limits

- Default: 100 requests per 15 minutes per IP
- Configurable via environment variables
- Different limits can be set per endpoint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting and tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the API documentation at `/api-docs`
- Review this README
- Check the GitHub issues page
