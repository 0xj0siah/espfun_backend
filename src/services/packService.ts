import { ethers } from 'ethers';
import winston from 'winston';
import { getDatabase } from '../config/database';
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface PackPurchaseRequest {
  packType: 'PRO' | 'EPIC' | 'LEGENDARY';
  buyerAddress: string;
}

export interface PackPurchaseResult {
  success: boolean;
  txHash?: string;
  playerIds?: number[];
  shares?: string[];
  error?: string;
}

export class PackService {
  private provider: ethers.JsonRpcProvider | null;
  private packIssuer: ethers.Wallet | null;

  constructor() {
    this.initializeProvider();
  }

  private initializeProvider() {
    if (process.env.MONAD_RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);

      if (process.env.PACK_ISSUER_PRIVATE_KEY) {
        this.packIssuer = new ethers.Wallet(process.env.PACK_ISSUER_PRIVATE_KEY, this.provider);
        logger.info(`PackIssuer initialized: ${this.packIssuer.address}`);
      } else {
        this.packIssuer = null;
        logger.warn('PACK_ISSUER_PRIVATE_KEY not configured - pack purchase features disabled');
      }
    } else {
      this.provider = null;
      this.packIssuer = null;
      logger.warn('MONAD_RPC_URL not configured - pack purchase features disabled');
    }
  }

  private checkPackIssuer() {
    if (!this.packIssuer) {
      throw new Error('PackIssuer not configured - set PACK_ISSUER_PRIVATE_KEY and MONAD_RPC_URL environment variables');
    }
  }

  async checkUserTournamentPoints(walletAddress: string, requiredPoints: number): Promise<boolean> {
    const prisma = getDatabase();

    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() }
    });

    if (!user) {
      return false;
    }

    return user.tournamentPoints >= requiredPoints;
  }

  async deductTournamentPoints(walletAddress: string, points: number): Promise<void> {
    const prisma = getDatabase();

    await prisma.user.update({
      where: { walletAddress: walletAddress.toLowerCase() },
      data: {
        tournamentPoints: {
          decrement: points
        }
      }
    });

    // Record the transaction
    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() }
    });

    if (user) {
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'PACK_PURCHASE',
          amount: points,
          pointType: 'TOURNAMENT',
          description: `Purchased ${points} point pack`
        }
      });

      await prisma.pointHistory.create({
        data: {
          userId: user.id,
          pointType: 'TOURNAMENT',
          change: -points,
          previousBalance: user.tournamentPoints,
          newBalance: user.tournamentPoints - points,
          reason: `Purchased pack for ${points} tournament points`
        }
      });
    }
  }

  async purchasePack(request: PackPurchaseRequest): Promise<PackPurchaseResult> {
    this.checkPackIssuer();

    try {
      // Get pack cost based on type
      const packCost = this.getPackCost(request.packType);

      // Check if user has enough tournament points
      const hasEnoughPoints = await this.checkUserTournamentPoints(request.buyerAddress, packCost);
      if (!hasEnoughPoints) {
        return {
          success: false,
          error: `Insufficient tournament points. Required: ${packCost}`
        };
      }

      // Convert pack type to contract enum
      const packTypeEnum = this.getPackTypeEnum(request.packType);

      // Get PlayerPack contract
      const playerPackAbi = [
        'function openPlayerPack(uint8 _packType, address _packBuyerAddress) external',
        'event PackOpened(address indexed destinationAddress, uint256[] playerIds, uint256[] amounts, uint256[] randomNumbers)'
      ];

      const playerPackContract = new ethers.Contract(
        CONTRACT_ADDRESSES.playerPack,
        playerPackAbi,
        this.packIssuer!
      );

      logger.info(`Purchasing ${request.packType} pack for ${request.buyerAddress}`);
      logger.info(`Pack type enum: ${packTypeEnum}, Buyer address: ${request.buyerAddress}`);
      logger.info(`PlayerPack contract address: ${CONTRACT_ADDRESSES.playerPack}`);
      logger.info(`PackIssuer address: ${this.packIssuer?.address}`);

      // Execute the pack purchase
      const tx = await playerPackContract.openPlayerPack(packTypeEnum, request.buyerAddress);
      logger.info(`Pack purchase transaction sent: ${tx.hash}`);
      logger.info(`Transaction details:`, {
        to: tx.to,
        from: tx.from,
        data: tx.data,
        value: tx.value?.toString()
      });

      // Wait for confirmation
      const receipt = await tx.wait();
      logger.info(`Pack purchase confirmed: ${receipt.transactionHash}`);

      // Parse the PackOpened event to get the player IDs and shares
      const packOpenedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = playerPackContract.interface.parseLog(log);
          return parsed.name === 'PackOpened';
        } catch {
          return false;
        }
      });

      let playerIds: number[] = [];
      let shares: string[] = [];

      if (packOpenedEvent) {
        const parsed = playerPackContract.interface.parseLog(packOpenedEvent);
        playerIds = parsed.args.playerIds.map((id: bigint) => Number(id));
        shares = parsed.args.amounts.map((amount: bigint) => amount.toString());
      }

      // Deduct tournament points
      await this.deductTournamentPoints(request.buyerAddress, packCost);

      return {
        success: true,
        txHash: receipt.transactionHash,
        playerIds,
        shares
      };

    } catch (error) {
      logger.error('Error purchasing pack:', error);
      logger.error('Buyer address used:', request.buyerAddress);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private getPackCost(packType: string): number {
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

  private getPackTypeEnum(packType: string): number {
    switch (packType) {
      case 'PRO':
        return 1; // PackType.PRO = 1
      case 'EPIC':
        return 2; // PackType.EPIC = 2
      case 'LEGENDARY':
        return 3; // PackType.LEGENDARY = 3
      default:
        throw new Error(`Unknown pack type: ${packType}`);
    }
  }

  getPackIssuerAddress(): string | null {
    return this.packIssuer?.address || null;
  }
}

export const packService = new PackService();
