import { getDatabase } from '../config/database';

export interface PointUpdate {
  userId: string;
  pointType: 'TOURNAMENT' | 'SKILL';
  amount: number;
  reason: string;
  transactionType: 'EARNED' | 'SPENT' | 'REWARD';
}

export class PointsService {
  private prisma = getDatabase();

  async updatePoints(update: PointUpdate): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: update.userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const fieldName = update.pointType === 'TOURNAMENT' ? 'tournamentPoints' : 'skillPoints';
    const currentBalance = update.pointType === 'TOURNAMENT' ? user.tournamentPoints : user.skillPoints;

    let newBalance: number;
    let change: number;

    if (update.transactionType === 'SPENT') {
      if (currentBalance < update.amount) {
        throw new Error('Insufficient points');
      }
      newBalance = currentBalance - update.amount;
      change = -update.amount;
    } else {
      newBalance = currentBalance + update.amount;
      change = update.amount;
    }

    await this.prisma.$transaction(async (tx) => {
      // Update user points
      await tx.user.update({
        where: { id: update.userId },
        data: {
          [fieldName]: newBalance
        }
      });

      // Record transaction
      await tx.transaction.create({
        data: {
          userId: update.userId,
          type: update.transactionType,
          amount: update.amount,
          pointType: update.pointType,
          description: update.reason
        }
      });

      // Record point history
      await tx.pointHistory.create({
        data: {
          userId: update.userId,
          pointType: update.pointType,
          change,
          previousBalance: currentBalance,
          newBalance,
          reason: update.reason
        }
      });
    });
  }

  async getUserPoints(userId: string): Promise<{ tournamentPoints: number; skillPoints: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        tournamentPoints: true,
        skillPoints: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      tournamentPoints: user.tournamentPoints,
      skillPoints: user.skillPoints
    };
  }

  async getPointHistory(
    userId: string, 
    pointType?: 'TOURNAMENT' | 'SKILL',
    limit: number = 50,
    offset: number = 0
  ) {
    const whereClause: any = { userId };
    
    if (pointType) {
      whereClause.pointType = pointType;
    }

    return await this.prisma.pointHistory.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }
}

export const pointsService = new PointsService();
