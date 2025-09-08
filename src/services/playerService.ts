import { getDatabase } from '../config/database';
import { monadBlockchain } from '../utils/blockchain';
import { ethers } from 'ethers';
import winston from 'winston';
import { CONTRACT_ADDRESSES } from '../config/contracts';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface PlayerNFT {
  tokenId: string;
  contractAddress: string;
  tokenURI?: string;
  metadata?: any;
}

export interface PlayerManagementRequest {
  playerIds: number[];
  shares: number[];
  userAddress: string;
}

export interface PlayerManagementResult {
  success: boolean;
  txHash?: string;
  pointsEarned?: number;
  pointsSpent?: number;
  error?: string;
}

export class PlayerService {
  private prisma: any = null;
  private provider: ethers.JsonRpcProvider | null;
  private packIssuer: ethers.Wallet | null;

  constructor() {
    this.initializeProvider();
  }

  private getPrisma() {
    if (!this.prisma) {
      const { getDatabase } = require('../config/database');
      this.prisma = getDatabase();
    }
    return this.prisma;
  }

  private initializeProvider() {
    if (process.env.MONAD_RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);

      if (process.env.PACK_ISSUER_PRIVATE_KEY) {
        this.packIssuer = new ethers.Wallet(process.env.PACK_ISSUER_PRIVATE_KEY, this.provider);
        logger.info(`PackIssuer initialized: ${this.packIssuer.address}`);
      } else {
        this.packIssuer = null;
        logger.warn('PACK_ISSUER_PRIVATE_KEY not configured - player management features disabled');
      }
    } else {
      this.provider = null;
      this.packIssuer = null;
      logger.warn('MONAD_RPC_URL not configured - player management features disabled');
    }
  }

  private checkPackIssuer() {
    if (!this.packIssuer) {
      throw new Error('PackIssuer not configured - set PACK_ISSUER_PRIVATE_KEY and MONAD_RPC_URL environment variables');
    }
  }

  async syncPlayerNFTs(userId: string, walletAddress: string, contractAddress: string): Promise<any[]> {
    try {
      // Fetch NFTs from blockchain
      const nfts = await monadBlockchain.getPlayerNFTs(walletAddress, contractAddress);
      
      const syncedPlayers = [];

      for (const nft of nfts) {
        // Check if player already exists
        let player = await this.getPrisma().player.findUnique({
          where: { nftTokenId: nft.tokenId }
        });

        if (!player) {
          // Create new player
          player = await this.getPrisma().player.create({
            data: {
              nftTokenId: nft.tokenId,
              contractAddress,
              ownerId: userId,
              name: `Player #${nft.tokenId}`,
              isBenched: true
            }
          });
        } else if (player.ownerId !== userId) {
          // Update ownership if it changed
          player = await this.getPrisma().player.update({
            where: { id: player.id },
            data: { ownerId: userId }
          });
        }

        syncedPlayers.push(player);
      }

      return syncedPlayers;
    } catch (error) {
      throw new Error('Failed to sync players from blockchain');
    }
  }

  async verifyPlayerOwnership(playerId: string, userId: string): Promise<boolean> {
    const player = await this.getPrisma().player.findFirst({
      where: {
        id: playerId,
        ownerId: userId
      }
    });

    if (!player) {
      return false;
    }

    // Verify on blockchain as well
    const user = await this.getPrisma().user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return false;
    }

    return await monadBlockchain.verifyNFTOwnership(
      user.walletAddress,
      player.contractAddress,
      player.nftTokenId
    );
  }

  async getPlayersByUser(userId: string) {
    return await this.getPrisma().player.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updatePlayerStatus(playerId: string, userId: string, isBenched: boolean) {
    const player = await this.getPrisma().player.findFirst({
      where: {
        id: playerId,
        ownerId: userId
      }
    });

    if (!player) {
      throw new Error('Player not found or not owned by user');
    }

    return await this.getPrisma().player.update({
      where: { id: playerId },
      data: { isBenched }
    });
  }

  async checkUserSkillPoints(walletAddress: string, requiredPoints: number): Promise<boolean> {
    const user = await this.getPrisma().user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() }
    });

    if (!user) {
      return false;
    }

    return user.skillPoints >= requiredPoints;
  }

  async deductSkillPoints(walletAddress: string, points: number): Promise<void> {
    await this.getPrisma().user.update({
      where: { walletAddress: walletAddress.toLowerCase() },
      data: {
        skillPoints: {
          decrement: points
        }
      }
    });

    // Record the transaction
    const user = await this.getPrisma().user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() }
    });

    if (user) {
      await this.getPrisma().transaction.create({
        data: {
          userId: user.id,
          type: 'PLAYER_PROMOTION',
          amount: points,
          pointType: 'SKILL',
          description: `Promoted players for ${points} skill points`
        }
      });

      await this.getPrisma().pointHistory.create({
        data: {
          userId: user.id,
          pointType: 'SKILL',
          change: -points,
          previousBalance: user.skillPoints,
          newBalance: user.skillPoints - points,
          reason: `Promoted players for ${points} skill points`
        }
      });
    }
  }

  async addTournamentPoints(walletAddress: string, points: number): Promise<void> {
    await this.getPrisma().user.update({
      where: { walletAddress: walletAddress.toLowerCase() },
      data: {
        tournamentPoints: {
          increment: points
        }
      }
    });

    // Record the transaction
    const user = await this.getPrisma().user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() }
    });

    if (user) {
      await this.getPrisma().transaction.create({
        data: {
          userId: user.id,
          type: 'PLAYER_CUT',
          amount: points,
          pointType: 'TOURNAMENT',
          description: `Cut players and earned ${points} tournament points`
        }
      });

      await this.getPrisma().pointHistory.create({
        data: {
          userId: user.id,
          pointType: 'TOURNAMENT',
          change: points,
          previousBalance: user.tournamentPoints,
          newBalance: user.tournamentPoints + points,
          reason: `Cut players and earned ${points} tournament points`
        }
      });
    }
  }

  async cutPlayers(request: PlayerManagementRequest): Promise<PlayerManagementResult> {
    this.checkPackIssuer();

    try {
      // Validate input arrays have same length (contract requires this)
      if (request.playerIds.length !== request.shares.length) {
        return {
          success: false,
          error: 'Player IDs and shares arrays must have the same length'
        };
      }

      // Validate that we have at least one player to cut (contract checks this)
      if (request.playerIds.length === 0) {
        return {
          success: false,
          error: 'At least one player must be specified for cutting'
        };
      }

      // Get DevelopmentPlayers contract
      const developmentPlayersAbi = [
        'function cutPlayers(address _user, uint256[] memory _idsToCut, uint256[] memory _numShares) external',
        'event PlayersCut(address indexed userAddress, uint256[] playerIds)'
      ];

      const developmentPlayersContract = new ethers.Contract(
        CONTRACT_ADDRESSES.developmentPlayers,
        developmentPlayersAbi,
        this.packIssuer!
      );

      logger.info(`Cutting players for ${request.userAddress}: ${request.playerIds.join(', ')} with shares: ${request.shares.join(', ')}`);

      // Execute the cut players transaction
      const tx = await developmentPlayersContract.cutPlayers(request.userAddress, request.playerIds, request.shares);
      logger.info(`Cut players transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      logger.info(`Cut players confirmed: ${receipt.transactionHash}`);

      // For now, we'll use a simple calculation for points earned
      // In a real implementation, you might want to get this from the contract or calculate based on player values
      const POINTS_PER_SHARE = 10;
      const pointsEarned = request.shares.reduce((sum, shares) => sum + (shares * POINTS_PER_SHARE), 0);

      // Add tournament points to user
      await this.addTournamentPoints(request.userAddress, pointsEarned);

      return {
        success: true,
        txHash: receipt.transactionHash,
        pointsEarned
      };

    } catch (error) {
      logger.error('Error cutting players:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getPromotionCost(playerIds: number[], shares: number[]): Promise<number> {
    // Backend-calculated promotion cost based on our points economy
    // This is separate from the blockchain contract which has free promotions
    
    if (playerIds.length !== shares.length) {
      throw new Error('Player IDs and shares arrays must have the same length');
    }

    // Calculate cost: base cost per player + additional cost per share
    const BASE_COST_PER_PLAYER = 50; // Base skill points per player
    const COST_PER_SHARE = 25; // Additional skill points per share
    
    let totalCost = 0;
    for (let i = 0; i < playerIds.length; i++) {
      const playerCost = BASE_COST_PER_PLAYER + (shares[i] * COST_PER_SHARE);
      totalCost += playerCost;
    }

    return totalCost;
  }

  async promotePlayers(request: PlayerManagementRequest): Promise<PlayerManagementResult> {
    this.checkPackIssuer();

    try {
      // Validate input arrays have same length
      if (request.playerIds.length !== request.shares.length) {
        return {
          success: false,
          error: 'Player IDs and shares arrays must have the same length'
        };
      }

      // Get DevelopmentPlayers contract
      const developmentPlayersAbi = [
        'function promotePlayers(address _user, uint256[] memory _playerIds, uint256[] memory _numShares) external',
        'event PlayerSharesPromoted(address indexed userAddress, uint256[] playerIds, uint256[] numShares)'
      ];

      const developmentPlayersContract = new ethers.Contract(
        CONTRACT_ADDRESSES.developmentPlayers,
        developmentPlayersAbi,
        this.packIssuer!
      );

      logger.info(`Promoting players for ${request.userAddress}: ${request.playerIds.join(', ')} with shares: ${request.shares.join(', ')}`);
      
      // Calculate promotion cost using our backend points economy
      const pointsRequired = await this.getPromotionCost(request.playerIds, request.shares);
      logger.info(`Promotion cost: ${pointsRequired} skill points`);

      // Check if user has enough skill points
      const hasEnoughPoints = await this.checkUserSkillPoints(request.userAddress, pointsRequired);
      if (!hasEnoughPoints) {
        return {
          success: false,
          error: `Insufficient skill points. Required: ${pointsRequired}`
        };
      }

      // Execute the promote players transaction
      const tx = await developmentPlayersContract.promotePlayers(request.userAddress, request.playerIds, request.shares);
      logger.info(`Promote players transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      logger.info(`Promote players confirmed: ${receipt.transactionHash}`);

      // Deduct skill points from user based on our backend calculation
      await this.deductSkillPoints(request.userAddress, pointsRequired);

      return {
        success: true,
        txHash: receipt.transactionHash,
        pointsSpent: pointsRequired
      };

    } catch (error) {
      logger.error('Error promoting players:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export const playerService = new PlayerService();
