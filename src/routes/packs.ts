import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { packService, PackPurchaseRequest } from '../services/packService';

const router = express.Router();

/**
 * @swagger
 * /api/packs:
 *   get:
 *     summary: Get available player packs
 *     tags: [Packs]
 *     responses:
 *       200:
 *         description: Available packs retrieved successfully
 */
router.get('/', asyncHandler(async (req, res) => {
  const prisma = getDatabase();
  
  const packs = await prisma.playerPack.findMany({
    where: { isActive: true },
    orderBy: { cost: 'asc' }
  });

  res.json({ packs });
}));

/**
 * @swagger
 * /api/packs/{packType}/purchase:
 *   post:
 *     summary: Purchase a player pack using tournament points
 *     tags: [Packs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PRO, EPIC, LEGENDARY]
 *         description: The type of pack to purchase
 *     responses:
 *       200:
 *         description: Pack purchased successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 pack:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     cost:
 *                       type: integer
 *                     pointType:
 *                       type: string
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     txHash:
 *                       type: string
 *                     playerIds:
 *                       type: array
 *                       items:
 *                         type: integer
 *                     shares:
 *                       type: array
 *                       items:
 *                         type: string
 *                 remainingPoints:
 *                   type: integer
 *       400:
 *         description: Insufficient points or invalid pack type
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/:packType/purchase', authenticateToken, [
  param('packType').isIn(['PRO', 'EPIC', 'LEGENDARY'])
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid pack type', details: errors.array() });
  }

  const { packType } = req.params;
  const buyerAddress = req.user!.walletAddress;

  if (!buyerAddress) {
    return res.status(400).json({ error: 'User wallet address not found' });
  }

  // Check if user has enough tournament points
  const packCost = getPackCost(packType);
  const hasEnoughPoints = await packService.checkUserTournamentPoints(buyerAddress, packCost);

  if (!hasEnoughPoints) {
    const prisma = getDatabase();
    const user = await prisma.user.findUnique({
      where: { walletAddress: buyerAddress.toLowerCase() }
    });

    return res.status(400).json({
      error: 'Insufficient tournament points',
      required: packCost,
      current: user?.tournamentPoints || 0,
      packType: packType
    });
  }

  // Purchase the pack
  const purchaseRequest: PackPurchaseRequest = {
    packType: packType as 'PRO' | 'EPIC' | 'LEGENDARY',
    buyerAddress
  };

  const result = await packService.purchasePack(purchaseRequest);

  if (!result.success) {
    return res.status(500).json({
      error: 'Pack purchase failed',
      details: result.error
    });
  }

  res.json({
    message: 'Pack purchased successfully',
    pack: {
      type: packType,
      cost: packCost,
      pointType: 'TOURNAMENT'
    },
    transaction: {
      txHash: result.txHash,
      playerIds: result.playerIds,
      shares: result.shares
    },
    remainingPoints: await getUserTournamentPoints(buyerAddress) - packCost
  });
}));

/**
 * @swagger
 * /api/packs/create:
 *   post:
 *     summary: Create a new player pack (admin only)
 *     tags: [Packs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               cost:
 *                 type: integer
 *               pointType:
 *                 type: string
 *                 enum: [tournament, skill]
 *               rarity:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pack created successfully
 */
router.post('/create', authenticateToken, [
  body('name').isString().notEmpty(),
  body('description').optional().isString(),
  body('cost').isInt({ min: 1 }),
  body('pointType').isIn(['tournament', 'skill']),
  body('rarity').isString().notEmpty()
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  // TODO: Add admin check here
  
  const { name, description, cost, pointType, rarity } = req.body;
  const prisma = getDatabase();

  const pack = await prisma.playerPack.create({
    data: {
      name,
      description,
      cost,
      pointType: pointType.toUpperCase(),
      rarity
    }
  });

  res.status(201).json({
    message: 'Pack created successfully',
    pack
  });
}));

// Helper functions
function getPackCost(packType: string): number {
  switch (packType) {
    case 'PRO':
      return 0; // 0 tournament points for testing
    case 'EPIC':
      return 0; // 0 tournament points for testing
    case 'LEGENDARY':
      return 0; // 0 tournament points for testing
    default:
      throw new Error(`Unknown pack type: ${packType}`);
  }
}

async function getUserTournamentPoints(walletAddress: string): Promise<number> {
  const prisma = getDatabase();
  const user = await prisma.user.findUnique({
    where: { walletAddress: walletAddress.toLowerCase() }
  });
  return user?.tournamentPoints || 0;
}

export { router as packRoutes };
