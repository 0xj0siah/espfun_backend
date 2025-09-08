import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { monadBlockchain } from '../utils/blockchain';
import { asyncHandler } from '../middleware/errorHandler';
import { playerService, PlayerManagementRequest } from '../services/playerService';

const router = express.Router();

/**
 * @swagger
 * /api/players/sync:
 *   post:
 *     summary: Sync NFT players from blockchain
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contractAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Players synced successfully
 */
router.post('/sync', authenticateToken, [
  body('contractAddress').isString().notEmpty()
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { contractAddress } = req.body;
  const prisma = getDatabase();

  try {
    // Fetch NFTs from blockchain
    const nfts = await monadBlockchain.getPlayerNFTs(req.user!.walletAddress, contractAddress);
    
    const syncedPlayers = [];

    for (const nft of nfts) {
      // Check if player already exists
      let player = await prisma.player.findUnique({
        where: { nftTokenId: nft.tokenId }
      });

      if (!player) {
        // Create new player
        player = await prisma.player.create({
          data: {
            nftTokenId: nft.tokenId,
            contractAddress,
            ownerId: req.user!.id,
            name: `Player #${nft.tokenId}`,
            isBenched: true
          }
        });
      } else if (player.ownerId !== req.user!.id) {
        // Update ownership if it changed
        player = await prisma.player.update({
          where: { id: player.id },
          data: { ownerId: req.user!.id }
        });
      }

      syncedPlayers.push(player);
    }

    res.json({
      message: 'Players synced successfully',
      syncedCount: syncedPlayers.length,
      players: syncedPlayers
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to sync players from blockchain' });
  }
}));

/**
 * @swagger
 * /api/players:
 *   get:
 *     summary: Get user's players
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Players retrieved successfully
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const prisma = getDatabase();
  
  const players = await prisma.player.findMany({
    where: { ownerId: req.user!.id },
    orderBy: { createdAt: 'desc' }
  });

  res.json({ players });
}));

/**
 * @swagger
 * /api/players/{playerId}/unbench:
 *   post:
 *     summary: Unbench a player
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Player unbenched successfully
 */
router.post('/:playerId/unbench', authenticateToken, [
  param('playerId').isUUID()
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid player ID', details: errors.array() });
  }

  const { playerId } = req.params;
  const prisma = getDatabase();

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      ownerId: req.user!.id
    }
  });

  if (!player) {
    return res.status(404).json({ error: 'Player not found or not owned by user' });
  }

  if (!player.isBenched) {
    return res.status(400).json({ error: 'Player is already active' });
  }

  // Check if user has enough skill points to unbench (cost: 10 skill points)
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });

  const UNBENCH_COST = 10;
  if (user!.skillPoints < UNBENCH_COST) {
    return res.status(400).json({ 
      error: 'Insufficient skill points',
      required: UNBENCH_COST,
      current: user!.skillPoints
    });
  }

  // Perform the unbench operation in a transaction
  await prisma.$transaction(async (tx) => {
    // Deduct skill points
    await tx.user.update({
      where: { id: req.user!.id },
      data: {
        skillPoints: {
          decrement: UNBENCH_COST
        }
      }
    });

    // Unbench the player
    await tx.player.update({
      where: { id: playerId },
      data: { isBenched: false }
    });

    // Record the transaction
    await tx.transaction.create({
      data: {
        userId: req.user!.id,
        type: 'SPENT',
        amount: UNBENCH_COST,
        pointType: 'SKILL',
        description: `Unbenched player ${player.name || player.nftTokenId}`
      }
    });

    // Record point history
    await tx.pointHistory.create({
      data: {
        userId: req.user!.id,
        pointType: 'SKILL',
        change: -UNBENCH_COST,
        previousBalance: user!.skillPoints,
        newBalance: user!.skillPoints - UNBENCH_COST,
        reason: `Unbenched player ${player.name || player.nftTokenId}`
      }
    });
  });

  res.json({
    message: 'Player unbenched successfully',
    pointsSpent: UNBENCH_COST,
    remainingSkillPoints: user!.skillPoints - UNBENCH_COST
  });
}));

/**
 * @swagger
 * /api/players/{playerId}/bench:
 *   post:
 *     summary: Bench a player
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Player benched successfully
 */
router.post('/:playerId/bench', authenticateToken, [
  param('playerId').isUUID()
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid player ID', details: errors.array() });
  }

  const { playerId } = req.params;
  const prisma = getDatabase();

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      ownerId: req.user!.id
    }
  });

  if (!player) {
    return res.status(404).json({ error: 'Player not found or not owned by user' });
  }

  if (player.isBenched) {
    return res.status(400).json({ error: 'Player is already benched' });
  }

  await prisma.player.update({
    where: { id: playerId },
    data: { isBenched: true }
  });

  res.json({
    message: 'Player benched successfully'
  });
}));

/**
 * @swagger
 * /api/players/cut:
 *   post:
 *     summary: Cut players and earn tournament points
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               playerIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of player IDs to cut
 *               shares:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of share amounts to cut for each player ID
 *             required:
 *               - playerIds
 *               - shares
 *     responses:
 *       200:
 *         description: Players cut successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     txHash:
 *                       type: string
 *                     pointsEarned:
 *                       type: integer
 *       400:
 *         description: Invalid input or insufficient permissions
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/cut', authenticateToken, [
  body('playerIds').isArray({ min: 1 }),
  body('playerIds.*').isInt({ min: 1 }),
  body('shares').isArray({ min: 1 }),
  body('shares.*').isInt({ min: 1 })
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { playerIds, shares } = req.body;
  const userAddress = req.user!.walletAddress;

  if (!userAddress) {
    return res.status(400).json({ error: 'User wallet address not found' });
  }

  // Validate arrays have same length
  if (playerIds.length !== shares.length) {
    return res.status(400).json({ error: 'Player IDs and shares arrays must have the same length' });
  }

  // Cut the players
  const cutRequest: PlayerManagementRequest = {
    playerIds,
    shares,
    userAddress
  };

  const result = await playerService.cutPlayers(cutRequest);

  if (!result.success) {
    return res.status(500).json({
      error: 'Player cut failed',
      details: result.error
    });
  }

  res.json({
    message: 'Players cut successfully',
    transaction: {
      txHash: result.txHash,
      pointsEarned: result.pointsEarned
    }
  });
}));

/**
 * @swagger
 * /api/players/promote:
 *   post:
 *     summary: Promote players using skill points
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               playerIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of player IDs to promote
 *               shares:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of share amounts to promote for each player ID
 *             required:
 *               - playerIds
 *               - shares
 *     responses:
 *       200:
 *         description: Players promoted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     txHash:
 *                       type: string
 *                     pointsSpent:
 *                       type: integer
 *       400:
 *         description: Invalid input or insufficient skill points
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/promote', authenticateToken, [
  body('playerIds').isArray({ min: 1 }),
  body('playerIds.*').isInt({ min: 1 }),
  body('shares').isArray({ min: 1 }),
  body('shares.*').isInt({ min: 1 })
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { playerIds, shares } = req.body;
  const userAddress = req.user!.walletAddress;

  if (!userAddress) {
    return res.status(400).json({ error: 'User wallet address not found' });
  }

  // Validate arrays have same length
  if (playerIds.length !== shares.length) {
    return res.status(400).json({ error: 'Player IDs and shares arrays must have the same length' });
  }

  // Promote the players
  const promoteRequest: PlayerManagementRequest = {
    playerIds,
    shares,
    userAddress
  };

  const result = await playerService.promotePlayers(promoteRequest);

  if (!result.success) {
    return res.status(500).json({
      error: 'Player promotion failed',
      details: result.error
    });
  }

  res.json({
    message: 'Players promoted successfully',
    transaction: {
      txHash: result.txHash,
      pointsSpent: result.pointsSpent
    }
  });
}));

/**
 * @swagger
 * /api/players/promotion-cost:
 *   post:
 *     summary: Get the promotion cost for players
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               playerIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of player IDs to check promotion cost for
 *               shares:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of share amounts for each player ID
 *             required:
 *               - playerIds
 *               - shares
 *     responses:
 *       200:
 *         description: Promotion cost retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 promotionCost:
 *                   type: integer
 *                 canAfford:
 *                   type: boolean
 *                 currentSkillPoints:
 *                   type: integer
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/promotion-cost', authenticateToken, [
  body('playerIds').isArray({ min: 1 }),
  body('playerIds.*').isInt({ min: 1 }),
  body('shares').isArray({ min: 1 }),
  body('shares.*').isInt({ min: 1 })
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { playerIds, shares } = req.body;
  const userAddress = req.user!.walletAddress;

  if (!userAddress) {
    return res.status(400).json({ error: 'User wallet address not found' });
  }

  // Validate arrays have same length
  if (playerIds.length !== shares.length) {
    return res.status(400).json({ error: 'Player IDs and shares arrays must have the same length' });
  }

  try {
    // Calculate promotion cost using our backend points economy
    const cost = await playerService.getPromotionCost(playerIds, shares);

    // Check if user can afford it
    const canAfford = await playerService.checkUserSkillPoints(userAddress, cost);

    // Get current skill points
    const prisma = getDatabase();
    const user = await prisma.user.findUnique({
      where: { walletAddress: userAddress.toLowerCase() }
    });

    res.json({
      promotionCost: cost,
      canAfford,
      currentSkillPoints: user?.skillPoints || 0
    });

  } catch (error) {
    console.error('Error getting promotion cost:', error);
    return res.status(500).json({
      error: 'Failed to get promotion cost',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

/**
 * @swagger
 * /api/players/cut-value:
 *   post:
 *     summary: Get the tournament points value for cutting players
 *     tags: [Players]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               playerIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of player IDs to check cut value for
 *               shares:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of share amounts for each player ID
 *             required:
 *               - playerIds
 *               - shares
 *     responses:
 *       200:
 *         description: Cut value retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cutValue:
 *                   type: integer
 *                   description: Tournament points that will be earned
 *                 totalShares:
 *                   type: integer
 *                   description: Total number of shares being cut
 *                 breakdown:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       playerId:
 *                         type: integer
 *                       shares:
 *                         type: integer
 *                       points:
 *                         type: integer
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/cut-value', authenticateToken, [
  body('playerIds').isArray({ min: 1 }),
  body('playerIds.*').isInt({ min: 1 }),
  body('shares').isArray({ min: 1 }),
  body('shares.*').isInt({ min: 1 })
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { playerIds, shares } = req.body;
  const userAddress = req.user!.walletAddress;

  if (!userAddress) {
    return res.status(400).json({ error: 'User wallet address not found' });
  }

  // Validate arrays have same length
  if (playerIds.length !== shares.length) {
    return res.status(400).json({ error: 'Player IDs and shares arrays must have the same length' });
  }

  try {
    // Calculate the cut value based on shares
    // Using the same logic as in the cutPlayers service method
    const POINTS_PER_SHARE = 10;
    let totalPoints = 0;
    const breakdown = [];

    for (let i = 0; i < playerIds.length; i++) {
      const points = shares[i] * POINTS_PER_SHARE;
      totalPoints += points;
      breakdown.push({
        playerId: playerIds[i],
        shares: shares[i],
        points: points
      });
    }

    const totalShares = shares.reduce((sum, shareAmount) => sum + shareAmount, 0);

    res.json({
      cutValue: totalPoints,
      totalShares: totalShares,
      breakdown: breakdown
    });

  } catch (error) {
    console.error('Error calculating cut value:', error);
    return res.status(500).json({
      error: 'Failed to calculate cut value',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export { router as playerRoutes };
