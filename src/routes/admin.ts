import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

// Simple admin check - in production, implement proper role-based access control
function isAdmin(req: AuthRequest): boolean {
  return req.user!.walletAddress === process.env.ADMIN_WALLET_ADDRESS;
}

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get platform statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const prisma = getDatabase();

  const [userCount, playerCount, totalTransactions] = await Promise.all([
    prisma.user.count(),
    prisma.player.count(),
    prisma.transaction.count()
  ]);

  const pointsDistribution = await prisma.user.aggregate({
    _sum: {
      tournamentPoints: true,
      skillPoints: true
    },
    _avg: {
      tournamentPoints: true,
      skillPoints: true
    }
  });

  res.json({
    users: userCount,
    players: playerCount,
    transactions: totalTransactions,
    pointsDistribution: {
      totalTournamentPoints: pointsDistribution._sum.tournamentPoints || 0,
      totalSkillPoints: pointsDistribution._sum.skillPoints || 0,
      avgTournamentPoints: pointsDistribution._avg.tournamentPoints || 0,
      avgSkillPoints: pointsDistribution._avg.skillPoints || 0
    }
  });
}));

/**
 * @swagger
 * /api/admin/users/{userId}/adjust-points:
 *   post:
 *     summary: Adjust user points (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pointType:
 *                 type: string
 *                 enum: [tournament, skill]
 *               adjustment:
 *                 type: integer
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Points adjusted successfully
 */
router.post('/users/:userId/adjust-points', authenticateToken, [
  body('pointType').isIn(['tournament', 'skill']),
  body('adjustment').isInt(),
  body('reason').isString().notEmpty()
], asyncHandler(async (req: AuthRequest, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { userId } = req.params;
  const { pointType, adjustment, reason } = req.body;
  const prisma = getDatabase();

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const pointTypeEnum = pointType.toUpperCase();
  const fieldName = pointType === 'tournament' ? 'tournamentPoints' : 'skillPoints';
  const currentPoints = pointType === 'tournament' ? user.tournamentPoints : user.skillPoints;

  // Ensure points don't go below 0
  const newBalance = Math.max(0, currentPoints + adjustment);
  const actualAdjustment = newBalance - currentPoints;

  await prisma.$transaction(async (tx) => {
    // Update user points
    await tx.user.update({
      where: { id: userId },
      data: {
        [fieldName]: newBalance
      }
    });

    // Record transaction
    await tx.transaction.create({
      data: {
        userId,
        type: adjustment > 0 ? 'EARNED' : 'SPENT',
        amount: Math.abs(actualAdjustment),
        pointType: pointTypeEnum,
        description: `Admin adjustment: ${reason}`
      }
    });

    // Record point history
    await tx.pointHistory.create({
      data: {
        userId,
        pointType: pointTypeEnum,
        change: actualAdjustment,
        previousBalance: currentPoints,
        newBalance,
        reason: `Admin adjustment: ${reason}`
      }
    });
  });

  res.json({
    message: 'Points adjusted successfully',
    user: {
      walletAddress: user.walletAddress,
      previousBalance: currentPoints,
      adjustment: actualAdjustment,
      newBalance
    }
  });
}));

/**
 * @swagger
 * /api/admin/events:
 *   post:
 *     summary: Create a game event
 *     tags: [Admin]
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
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               tournamentReward:
 *                 type: integer
 *               skillReward:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Event created successfully
 */
router.post('/events', authenticateToken, [
  body('name').isString().notEmpty(),
  body('description').optional().isString(),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('tournamentReward').optional().isInt({ min: 0 }),
  body('skillReward').optional().isInt({ min: 0 })
], asyncHandler(async (req: AuthRequest, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const {
    name,
    description,
    startDate,
    endDate,
    tournamentReward = 0,
    skillReward = 0
  } = req.body;

  const prisma = getDatabase();

  const event = await prisma.gameEvent.create({
    data: {
      name,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      tournamentReward,
      skillReward
    }
  });

  res.status(201).json({
    message: 'Event created successfully',
    event
  });
}));

export { router as adminRoutes };
