# ESP Fun Backend Guide - SQLite & EIP712 Signature Management

## 🎯 Overview

This guide covers implementing a backend service that manages EIP712 signatures for the ESP Fun `buyTokens` function. The backend will sign transactions on behalf of users using authorized txSigner wallets, while users interact through their own frontend wallets.

## 🏗️ Architecture

```
Frontend User Wallet → Backend API → TxSigner Wallet → Smart Contract
     (Initiates)      (Signs EIP712)    (Authorized)     (Validates)
```

## 📦 Setup & Dependencies

```bash
npm init -y
npm install express sqlite3 ethers@6 dotenv cors helmet express-rate-limit
npm install --save-dev nodemon
```

## 🗃️ Database Schema

```sql
-- users.sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- nonces.sql  
CREATE TABLE IF NOT EXISTS nonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_address TEXT NOT NULL,
    current_nonce INTEGER NOT NULL DEFAULT 0,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_address)
);

-- transactions.sql
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_address TEXT NOT NULL,
    tx_hash TEXT,
    nonce_used INTEGER NOT NULL,
    player_token_ids TEXT NOT NULL, -- JSON array
    amounts TEXT NOT NULL, -- JSON array  
    max_currency_spend TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    signature TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, confirmed, failed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    FOREIGN KEY (user_address) REFERENCES users(wallet_address)
);

-- tx_signers.sql
CREATE TABLE IF NOT EXISTS tx_signers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signer_address TEXT UNIQUE NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);
```

## ⚙️ Environment Configuration

```bash
# .env
PORT=3000
NODE_ENV=development

# Monad Network
RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=10143

# ESP Fun Contracts
PLAYER_CONTRACT=0x35163e4FA25c05E756aA8012a33827bE60aC0D52
FDFPAIR_CONTRACT=0xA160B769d12A0F3B932113BB4F181544Af5Ee68d
FEEMANAGER_CONTRACT=0x419297541e3Da2493f77ADd65216F1431A890b78
TESTUSD_CONTRACT=0xbAa8EF1B3e1384F1F67e208eEE64c01b42D8aB0E

# TxSigner (Your authorized wallet)
TX_SIGNER_PRIVATE_KEY=your_private_key_here
TX_SIGNER_ADDRESS=0xeCC4da76C47dc134754199820f764180fd56ed2E

# Security
ENCRYPTION_KEY=your_32_byte_encryption_key_here
JWT_SECRET=your_jwt_secret_here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🗄️ Database Manager

```javascript
// database/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseManager {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'espfun.db'));
        this.initTables();
    }

    initTables() {
        const schemas = [
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS nonces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_address TEXT NOT NULL,
                current_nonce INTEGER NOT NULL DEFAULT 0,
                last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_address)
            )`,
            `CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_address TEXT NOT NULL,
                tx_hash TEXT,
                nonce_used INTEGER NOT NULL,
                player_token_ids TEXT NOT NULL,
                amounts TEXT NOT NULL,
                max_currency_spend TEXT NOT NULL,
                deadline INTEGER NOT NULL,
                signature TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                confirmed_at DATETIME,
                FOREIGN KEY (user_address) REFERENCES users(wallet_address)
            )`
        ];

        schemas.forEach(schema => {
            this.db.run(schema, (err) => {
                if (err) console.error('Error creating table:', err);
            });
        });
    }

    // User Management
    async createUser(walletAddress) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR IGNORE INTO users (wallet_address) VALUES (?)
            `);
            stmt.run([walletAddress], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
            stmt.finalize();
        });
    }

    async getUser(walletAddress) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM users WHERE wallet_address = ?`,
                [walletAddress],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Nonce Management
    async getCurrentNonce(userAddress) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT current_nonce FROM nonces WHERE user_address = ?`,
                [userAddress],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.current_nonce : 0);
                }
            );
        });
    }

    async incrementNonce(userAddress) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO nonces (user_address, current_nonce, last_used_at)
                VALUES (?, COALESCE((SELECT current_nonce FROM nonces WHERE user_address = ?), 0) + 1, CURRENT_TIMESTAMP)
            `);
            stmt.run([userAddress, userAddress], function(err) {
                if (err) reject(err);
                else {
                    // Get the new nonce value
                    resolve(this.changes > 0);
                }
            });
            stmt.finalize();
        });
    }

    // Transaction Management
    async saveTransaction(txData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO transactions 
                (user_address, nonce_used, player_token_ids, amounts, max_currency_spend, deadline, signature)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run([
                txData.userAddress,
                txData.nonce,
                JSON.stringify(txData.playerTokenIds),
                JSON.stringify(txData.amounts),
                txData.maxCurrencySpend,
                txData.deadline,
                txData.signature
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
            stmt.finalize();
        });
    }

    async updateTransactionStatus(txId, status, txHash = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE transactions 
                SET status = ?, tx_hash = ?, confirmed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            stmt.run([status, txHash, txId], function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            });
            stmt.finalize();
        });
    }

    async getUserTransactions(userAddress, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM transactions WHERE user_address = ? ORDER BY created_at DESC LIMIT ?`,
                [userAddress, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = DatabaseManager;
```

## 🔐 EIP712 Signature Service

```javascript
// services/signatureService.js
const { ethers } = require('ethers');

class SignatureService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.txSigner = new ethers.Wallet(process.env.TX_SIGNER_PRIVATE_KEY, this.provider);
        
        // EIP712 Domain for FDFPair contract
        this.domain = {
            name: "FDF Pair",
            version: "1",
            chainId: parseInt(process.env.CHAIN_ID),
            verifyingContract: process.env.FDFPAIR_CONTRACT
        };

        // EIP712 Types for buyTokens
        this.types = {
            BuyTokens: [
                { name: 'buyer', type: 'address' },
                { name: 'playerTokenIds', type: 'uint256[]' },
                { name: 'amounts', type: 'uint256[]' },
                { name: 'maxCurrencySpend', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
                { name: 'nonce', type: 'uint256' }
            ]
        };
    }

    async createBuyTokensSignature(buyTokensData) {
        try {
            // Prepare the message exactly as the contract expects
            const message = {
                buyer: buyTokensData.buyer,
                playerTokenIds: buyTokensData.playerTokenIds,
                amounts: buyTokensData.amounts,
                maxCurrencySpend: buyTokensData.maxCurrencySpend,
                deadline: buyTokensData.deadline,
                nonce: buyTokensData.nonce
            };

            // Sign the typed data
            const signature = await this.txSigner.signTypedData(
                this.domain,
                this.types,
                message
            );

            return {
                signature,
                signer: this.txSigner.address,
                message,
                domain: this.domain
            };
        } catch (error) {
            console.error('Error creating signature:', error);
            throw new Error('Failed to create signature');
        }
    }

    async verifySignature(buyTokensData, signature) {
        try {
            const message = {
                buyer: buyTokensData.buyer,
                playerTokenIds: buyTokensData.playerTokenIds,
                amounts: buyTokensData.amounts,
                maxCurrencySpend: buyTokensData.maxCurrencySpend,
                deadline: buyTokensData.deadline,
                nonce: buyTokensData.nonce
            };

            const recoveredAddress = ethers.verifyTypedData(
                this.domain,
                this.types,
                message,
                signature
            );

            return recoveredAddress.toLowerCase() === this.txSigner.address.toLowerCase();
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    async getOnChainNonce(userAddress) {
        try {
            const fdfPairContract = new ethers.Contract(
                process.env.FDFPAIR_CONTRACT,
                ['function usedNonces(address) view returns (uint256)'],
                this.provider
            );
            
            const currentNonce = await fdfPairContract.usedNonces(userAddress);
            return Number(currentNonce) + 1; // Next nonce to use
        } catch (error) {
            console.error('Error getting on-chain nonce:', error);
            throw new Error('Failed to get nonce from contract');
        }
    }
}

module.exports = SignatureService;
```

## 🌐 API Routes

```javascript
// routes/buyTokens.js
const express = require('express');
const router = express.Router();
const DatabaseManager = require('../database/db');
const SignatureService = require('../services/signatureService');
const { body, validationResult } = require('express-validator');

const db = new DatabaseManager();
const signatureService = new SignatureService();

// Validation middleware
const validateBuyTokensRequest = [
    body('buyer').isEthereumAddress().withMessage('Invalid buyer address'),
    body('playerTokenIds').isArray({ min: 1 }).withMessage('Player token IDs must be non-empty array'),
    body('amounts').isArray({ min: 1 }).withMessage('Amounts must be non-empty array'),
    body('maxCurrencySpend').isNumeric().withMessage('Max currency spend must be numeric'),
    body('deadline').isInt({ min: 1 }).withMessage('Deadline must be valid timestamp')
];

// POST /api/buyTokens/prepare-signature
router.post('/prepare-signature', validateBuyTokensRequest, async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }

        const { buyer, playerTokenIds, amounts, maxCurrencySpend, deadline } = req.body;

        // Ensure user exists
        await db.createUser(buyer);

        // Get next nonce for the buyer
        const onChainNonce = await signatureService.getOnChainNonce(buyer);
        
        // Sync our database nonce with on-chain nonce
        const dbNonce = await db.getCurrentNonce(buyer);
        const nextNonce = Math.max(onChainNonce, dbNonce + 1);

        // Prepare signature data
        const buyTokensData = {
            buyer,
            playerTokenIds: playerTokenIds.map(id => BigInt(id)),
            amounts: amounts.map(amt => BigInt(amt)),
            maxCurrencySpend: BigInt(maxCurrencySpend),
            deadline: BigInt(deadline),
            nonce: BigInt(nextNonce)
        };

        // Create signature
        const signatureResult = await signatureService.createBuyTokensSignature(buyTokensData);

        // Save transaction to database
        const txId = await db.saveTransaction({
            userAddress: buyer,
            nonce: nextNonce,
            playerTokenIds,
            amounts,
            maxCurrencySpend: maxCurrencySpend.toString(),
            deadline,
            signature: signatureResult.signature
        });

        // Increment nonce in database
        await db.incrementNonce(buyer);

        res.json({
            success: true,
            data: {
                signature: signatureResult.signature,
                nonce: nextNonce,
                signer: signatureResult.signer,
                txId,
                validUntil: deadline
            }
        });

    } catch (error) {
        console.error('Error preparing signature:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to prepare signature',
            error: error.message
        });
    }
});

// GET /api/buyTokens/nonce/:address
router.get('/nonce/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        if (!ethers.isAddress(address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address format'
            });
        }

        const onChainNonce = await signatureService.getOnChainNonce(address);
        const dbNonce = await db.getCurrentNonce(address);

        res.json({
            success: true,
            data: {
                onChainNonce,
                dbNonce,
                nextNonce: Math.max(onChainNonce, dbNonce + 1)
            }
        });

    } catch (error) {
        console.error('Error getting nonce:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get nonce',
            error: error.message
        });
    }
});

// GET /api/buyTokens/transactions/:address
router.get('/transactions/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address format'
            });
        }

        const transactions = await db.getUserTransactions(address, limit);

        res.json({
            success: true,
            data: transactions.map(tx => ({
                ...tx,
                playerTokenIds: JSON.parse(tx.player_token_ids),
                amounts: JSON.parse(tx.amounts)
            }))
        });

    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get transactions',
            error: error.message
        });
    }
});

// POST /api/buyTokens/update-status
router.post('/update-status', [
    body('txId').isInt().withMessage('Transaction ID must be integer'),
    body('status').isIn(['pending', 'confirmed', 'failed']).withMessage('Invalid status'),
    body('txHash').optional().isLength({ min: 66, max: 66 }).withMessage('Invalid transaction hash')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }

        const { txId, status, txHash } = req.body;

        const updated = await db.updateTransactionStatus(txId, status, txHash);

        if (updated) {
            res.json({
                success: true,
                message: 'Transaction status updated'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update transaction status',
            error: error.message
        });
    }
});

module.exports = router;
```

## 🚀 Main Server Application

```javascript
// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const buyTokensRoutes = require('./routes/buyTokens');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-frontend-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/buyTokens', buyTokensRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'ESP Fun Backend API is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ESP Fun Backend API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Chain ID: ${process.env.CHAIN_ID}`);
    console.log(`📝 TxSigner: ${process.env.TX_SIGNER_ADDRESS}`);
});
```

## 🎯 Frontend Integration Example

```javascript
// Frontend integration example
class ESPFunAPI {
    constructor(baseURL = 'http://localhost:3000/api') {
        this.baseURL = baseURL;
    }

    async prepareBuyTokensSignature(buyData) {
        const response = await fetch(`${this.baseURL}/buyTokens/prepare-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(buyData)
        });

        if (!response.ok) {
            throw new Error('Failed to prepare signature');
        }

        return response.json();
    }

    async getUserNonce(address) {
        const response = await fetch(`${this.baseURL}/buyTokens/nonce/${address}`);
        
        if (!response.ok) {
            throw new Error('Failed to get nonce');
        }

        return response.json();
    }

    async buyTokens(userWallet, playerTokenIds, amounts, maxSpend) {
        try {
            // 1. Prepare signature on backend
            const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            
            const signatureResult = await this.prepareBuyTokensSignature({
                buyer: userWallet.address,
                playerTokenIds,
                amounts,
                maxCurrencySpend: maxSpend.toString(),
                deadline
            });

            // 2. Execute transaction with backend signature
            const fdfPairContract = new ethers.Contract(
                CONTRACT_ADDRESSES.fdfPair,
                FDFPAIR_ABI,
                userWallet
            );

            const tx = await fdfPairContract.buyTokens(
                playerTokenIds,
                amounts,
                maxSpend,
                deadline,
                signatureResult.data.signature,
                signatureResult.data.nonce
            );

            // 3. Update transaction status
            await this.updateTransactionStatus(
                signatureResult.data.txId,
                'confirmed',
                tx.hash
            );

            return tx;

        } catch (error) {
            console.error('BuyTokens failed:', error);
            throw error;
        }
    }

    async updateTransactionStatus(txId, status, txHash = null) {
        const response = await fetch(`${this.baseURL}/buyTokens/update-status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ txId, status, txHash })
        });

        return response.json();
    }
}

// Usage in React component
const api = new ESPFunAPI();

const handleBuyTokens = async (playerIds, amounts, maxSpend) => {
    try {
        setLoading(true);
        
        const tx = await api.buyTokens(
            wallet, // User's connected wallet
            playerIds,
            amounts,
            maxSpend
        );
        
        await tx.wait();
        
        toast.success('Tokens purchased successfully!');
        
    } catch (error) {
        toast.error('Purchase failed: ' + error.message);
    } finally {
        setLoading(false);
    }
};
```

## 📋 Package.json Scripts

```json
{
  "name": "espfun-backend",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "init-db": "node scripts/initDatabase.js",
    "test": "jest",
    "lint": "eslint ."
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "ethers": "^6.8.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.54.0"
  }
}
```

## 🧪 Testing the System

```bash
# Start the backend
npm run dev

# Test nonce endpoint
curl http://localhost:3000/api/buyTokens/nonce/0x46527D3DC1f448033ee880417B9404c076Cc3E9C

# Test signature preparation
curl -X POST http://localhost:3000/api/buyTokens/prepare-signature \
  -H "Content-Type: application/json" \
  -d '{
    "buyer": "0x46527D3DC1f448033ee880417B9404c076Cc3E9C",
    "playerTokenIds": [1, 2],
    "amounts": [1000000000000000000, 2000000000000000000],
    "maxCurrencySpend": "10000000",
    "deadline": 1735689600
  }'
```

## 🔒 Security Best Practices

1. **Private Key Management**: Store encrypted private keys, never plain text
2. **Rate Limiting**: Implement per-user and global rate limits
3. **Input Validation**: Validate all inputs on both frontend and backend
4. **Nonce Synchronization**: Always sync with on-chain nonces
5. **Database Security**: Use parameterized queries to prevent SQL injection
6. **CORS Configuration**: Restrict origins in production
7. **Error Handling**: Don't expose sensitive information in error messages

## 🎯 Summary

This backend system provides:

- ✅ **SQLite database** for user and transaction management
- ✅ **EIP712 signature generation** using authorized txSigner
- ✅ **Proper nonce management** synchronized with on-chain state
- ✅ **RESTful API** for frontend integration
- ✅ **Transaction tracking** and status updates
- ✅ **Security features** including rate limiting and validation
- ✅ **Easy deployment** with minimal dependencies

The system allows users to interact with ESP Fun through their own wallets while leveraging backend-managed signatures for the `buyTokens` function, providing a seamless user experience while maintaining security and proper transaction ordering.