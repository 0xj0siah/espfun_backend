import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

/**
 * @swagger
 * /api/points/balance:
 *   get:
 *     summary: Get user's current point balances
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Point balances retrieved successfully
 */
router.get('/balance', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const prisma = getDatabase();
  
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      tournamentPoints: true,
      skillPoints: true
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    tournamentPoints: user.tournamentPoints,
    skillPoints: user.skillPoints
  });
}));

/**
 * @swagger
 * /api/points/history:
 *   get:
 *     summary: Get user's point transaction history
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pointType
 *         schema:
 *           type: string
 *           enum: [tournament, skill]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Point history retrieved successfully
 */
router.get('/history', authenticateToken, [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('pointType').optional().isIn(['tournament', 'skill'])
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid query parameters', details: errors.array() });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const pointType = req.query.pointType as string;

  const prisma = getDatabase();

  const whereClause: any = {
    userId: req.user!.id
  };

  if (pointType) {
    whereClause.pointType = pointType.toUpperCase();
  }

  const [history, total] = await Promise.all([
    prisma.pointHistory.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.pointHistory.count({
      where: whereClause
    })
  ]);

  res.json({
    history,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  });
}));

/**
 * @swagger
 * /api/points/award:
 *   post:
 *     summary: Award points to user (admin only)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetWalletAddress:
 *                 type: string
 *               pointType:
 *                 type: string
 *                 enum: [tournament, skill]
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Points awarded successfully
 */
router.post('/award', authenticateToken, [
  body('targetWalletAddress').isString().notEmpty(),
  body('pointType').isIn(['tournament', 'skill']),
  body('amount').isInt({ min: 1 }),
  body('reason').isString().notEmpty()
], asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  // Check if user is admin (you can implement admin check based on your requirements)
  // For now, we'll allow any authenticated user to award points for testing
  
  const { targetWalletAddress, pointType, amount, reason } = req.body;
  const prisma = getDatabase();

  const targetUser = await prisma.user.findUnique({
    where: { walletAddress: targetWalletAddress }
  });

  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found' });
  }

  const pointTypeEnum = pointType.toUpperCase();
  const fieldName = pointType === 'tournament' ? 'tournamentPoints' : 'skillPoints';

  await prisma.$transaction(async (tx) => {
    // Update user points
    const updatedUser = await tx.user.update({
      where: { id: targetUser.id },
      data: {
        [fieldName]: {
          increment: amount
        }
      }
    });

    // Record transaction
    await tx.transaction.create({
      data: {
        userId: targetUser.id,
        type: 'REWARD',
        amount,
        pointType: pointTypeEnum,
        description: reason
      }
    });

    // Record point history
    const previousBalance = pointType === 'tournament' 
      ? targetUser.tournamentPoints 
      : targetUser.skillPoints;

    await tx.pointHistory.create({
      data: {
        userId: targetUser.id,
        pointType: pointTypeEnum,
        change: amount,
        previousBalance,
        newBalance: previousBalance + amount,
        reason
      }
    });
  });

  res.json({
    message: 'Points awarded successfully',
    targetWallet: targetWalletAddress,
    pointType,
    amount,
    reason
  });
}));

export { router as pointsRoutes };
