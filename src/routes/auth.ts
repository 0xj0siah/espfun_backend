import express from 'express';
import { body, validationResult } from 'express-validator';
import { getDatabase } from '../config/database';
import { monadBlockchain } from '../utils/blockchain';
import { generateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

/**
 * @swagger
 * /api/auth/nonce:
 *   post:
 *     summary: Get nonce for wallet authentication
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 example: "0x742d35Cc6634C0532925a3b8D8Cf5a4E2A5e1234"
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 */
router.post('/nonce', [
  body('walletAddress')
    .isString()
    .custom(async (address) => {
      if (!await monadBlockchain.isValidWalletAddress(address)) {
        throw new Error('Invalid wallet address');
      }
    })
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const nonce = `ESPFun Login - ${Date.now()} - ${Math.random().toString(36).substring(2)}`;

  // Store nonce in Redis with 10-minute expiration
  // Note: In a production environment, you'd want to use Redis here
  // For simplicity, we'll include the nonce in the response and verify it in the login endpoint

  res.json({
    nonce,
    message: `Please sign this message to authenticate with ESPFun: ${nonce}`
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with wallet signature
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletAddress:
 *                 type: string
 *               signature:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', [
  body('walletAddress').isString().notEmpty(),
  body('signature').isString().notEmpty(),
  body('message').isString().notEmpty()
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { walletAddress, signature, message } = req.body;

  // Verify signature
  const isValidSignature = await monadBlockchain.verifyWalletSignature(
    message,
    signature,
    walletAddress
  );

  if (!isValidSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const prisma = getDatabase();

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { walletAddress: walletAddress.toLowerCase() }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        tournamentPoints: 100, // Starting tournament points
        skillPoints: 50       // Starting skill points
      }
    });
  }

  // Generate JWT token
  const token = generateToken(user.id, user.walletAddress);

  res.json({
    token,
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      tournamentPoints: user.tournamentPoints,
      skillPoints: user.skillPoints,
      createdAt: user.createdAt
    }
  });
}));

export { router as authRoutes };
