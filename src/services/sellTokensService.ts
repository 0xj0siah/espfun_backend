import { ethers } from 'ethers';
import { getDatabase } from '../config/database';
import { eip712SellTokensService } from './eip712SellTokensService';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface SellTokensRequest {
  playerTokenIds: number[];
  amounts: number[];
  minCurrencyToReceive: number;
  deadline: number;
}

export interface SellTokensSignatureResponse {
  success: boolean;
  signature?: string;
  transactionId?: string;
  error?: string;
  contractAddress?: string;
  txSignerAddress?: string;
}

export interface SellTokensNonceResponse {
  success: boolean;
  nonce?: number;
  error?: string;
}

export interface SellTokensTransaction {
  id: string;
  userAddress: string;
  playerTokenIds: number[];
  amounts: number[];
  minCurrencyToReceive: number;
  deadline: number;
  nonce: number;
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SellTokensService {
  /**
   * Get the current nonce for a user
   */
  async getNonce(userAddress: string): Promise<SellTokensNonceResponse> {
    try {
      const nonce = await eip712SellTokensService.getOnChainNonce(userAddress);
      
      return {
        success: true,
        nonce
      };
    } catch (error) {
      logger.error('Error getting sellTokens nonce:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get nonce'
      };
    }
  }

  /**
   * Prepare a sellTokens signature
   */
  async prepareSellTokensSignature(
    userAddress: string,
    request: SellTokensRequest
  ): Promise<SellTokensSignatureResponse> {
    try {
      // Validate the request
      if (!request.playerTokenIds || request.playerTokenIds.length === 0) {
        return {
          success: false,
          error: 'playerTokenIds is required and cannot be empty'
        };
      }

      if (!request.amounts || request.amounts.length === 0) {
        return {
          success: false,
          error: 'amounts is required and cannot be empty'
        };
      }

      if (request.playerTokenIds.length !== request.amounts.length) {
        return {
          success: false,
          error: 'playerTokenIds and amounts arrays must have the same length'
        };
      }

      if (request.minCurrencyToReceive < 0) {
        return {
          success: false,
          error: 'minCurrencyToReceive must be non-negative'
        };
      }

      if (request.deadline <= Math.floor(Date.now() / 1000)) {
        return {
          success: false,
          error: 'deadline must be in the future'
        };
      }

      // Validate all amounts are positive
      for (const amount of request.amounts) {
        if (amount <= 0) {
          return {
            success: false,
            error: 'All amounts must be positive'
          };
        }
      }

      // Get the next nonce
      const nonce = await eip712SellTokensService.getOnChainNonce(userAddress);

      // Prepare the signature data
      const sellTokensData = {
        from: userAddress,
        playerTokenIds: request.playerTokenIds.map(id => BigInt(id)),
        amounts: request.amounts.map(amt => BigInt(amt)),
        minCurrencyToReceive: BigInt(request.minCurrencyToReceive),
        deadline: BigInt(request.deadline),
        nonce: BigInt(nonce)
      };

      // Create the signature
      const signatureResult = await eip712SellTokensService.createSellTokensSignature(sellTokensData);

      // Store the transaction in the database
      const transactionId = `sell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const prisma = getDatabase();
      await prisma.sellTokensTransaction.create({
        data: {
          id: transactionId,
          userAddress,
          playerTokenIds: JSON.stringify(request.playerTokenIds),
          amounts: JSON.stringify(request.amounts),
          minCurrencyToReceive: request.minCurrencyToReceive,
          deadline: request.deadline,
          nonce,
          signature: signatureResult.signature,
          status: 'pending'
        }
      });

      logger.info(`SellTokens signature prepared for user ${userAddress}, transaction ${transactionId}`);

      return {
        success: true,
        signature: signatureResult.signature,
        transactionId,
        contractAddress: eip712SellTokensService.getPlayerContractAddress(),
        txSignerAddress: eip712SellTokensService.getTxSignerAddress()
      };
    } catch (error) {
      logger.error('Error preparing sellTokens signature:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare signature'
      };
    }
  }

  /**
   * Get all sellTokens transactions for a user
   */
  async getUserTransactions(userAddress: string): Promise<SellTokensTransaction[]> {
    try {
      const prisma = getDatabase();
      const transactions = await prisma.sellTokensTransaction.findMany({
        where: { userAddress },
        orderBy: { createdAt: 'desc' }
      });

      return transactions.map(tx => ({
        id: tx.id,
        userAddress: tx.userAddress,
        playerTokenIds: JSON.parse(tx.playerTokenIds),
        amounts: JSON.parse(tx.amounts),
        minCurrencyToReceive: tx.minCurrencyToReceive,
        deadline: tx.deadline,
        nonce: tx.nonce,
        signature: tx.signature,
        status: tx.status as 'pending' | 'confirmed' | 'failed',
        txHash: tx.txHash || undefined,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt
      }));
    } catch (error) {
      logger.error('Error getting user sellTokens transactions:', error);
      return [];
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'confirmed' | 'failed',
    txHash?: string
  ): Promise<boolean> {
    try {
      const prisma = getDatabase();
      await prisma.sellTokensTransaction.update({
        where: { id: transactionId },
        data: {
          status,
          txHash,
          updatedAt: new Date()
        }
      });

      logger.info(`SellTokens transaction ${transactionId} status updated to ${status}`);
      return true;
    } catch (error) {
      logger.error('Error updating sellTokens transaction status:', error);
      return false;
    }
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(transactionId: string): Promise<SellTokensTransaction | null> {
    try {
      const prisma = getDatabase();
      const tx = await prisma.sellTokensTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!tx) {
        return null;
      }

      return {
        id: tx.id,
        userAddress: tx.userAddress,
        playerTokenIds: JSON.parse(tx.playerTokenIds),
        amounts: JSON.parse(tx.amounts),
        minCurrencyToReceive: tx.minCurrencyToReceive,
        deadline: tx.deadline,
        nonce: tx.nonce,
        signature: tx.signature,
        status: tx.status as 'pending' | 'confirmed' | 'failed',
        txHash: tx.txHash || undefined,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt
      };
    } catch (error) {
      logger.error('Error getting sellTokens transaction:', error);
      return null;
    }
  }
}

export const sellTokensService = new SellTokensService();
