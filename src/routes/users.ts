import express from 'express';
import { param } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
router.get('/profile', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const prisma = getDatabase();
  
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      players: true,
      _count: {
        select: {
          players: true,
          transactions: true
        }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    walletAddress: user.walletAddress,
    tournamentPoints: user.tournamentPoints,
    skillPoints: user.skillPoints,
    playersCount: user._count.players,
    transactionsCount: user._count.transactions,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });
}));

/**
 * @swagger
 * /api/users/{walletAddress}:
 *   get:
 *     summary: Get user by wallet address
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User found
 */
router.get('/:walletAddress', [
  param('walletAddress').isString().isLength({ min: 42, max: 42 })
], asyncHandler(async (req, res) => {
  const { walletAddress } = req.params;
  const prisma = getDatabase();

  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: {
      id: true,
      walletAddress: true,
      createdAt: true,
      _count: {
        select: {
          players: true
        }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    walletAddress: user.walletAddress,
    playersCount: user._count.players,
    createdAt: user.createdAt
  });
}));

/**
 * @swagger
 * /api/users/leaderboard:
 *   get:
 *     summary: Get points leaderboard
 *     tags: [Users]
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
 *     responses:
 *       200:
 *         description: Leaderboard retrieved successfully
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const pointType = req.query.pointType as string || 'tournament';
  const limit = parseInt(req.query.limit as string) || 10;

  if (limit > 100) {
    return res.status(400).json({ error: 'Limit cannot exceed 100' });
  }

  const prisma = getDatabase();

  const orderBy = pointType === 'skill' 
    ? { skillPoints: 'desc' as const }
    : { tournamentPoints: 'desc' as const };

  const users = await prisma.user.findMany({
    take: limit,
    orderBy,
    select: {
      walletAddress: true,
      tournamentPoints: true,
      skillPoints: true,
      _count: {
        select: {
          players: true
        }
      }
    }
  });

  res.json({
    pointType,
    leaderboard: users.map((user, index) => ({
      rank: index + 1,
      walletAddress: user.walletAddress,
      points: pointType === 'skill' ? user.skillPoints : user.tournamentPoints,
      playersCount: user._count.players
    }))
  });
}));

export { router as userRoutes };
