import { getDatabase } from '../config/database';
import { eip712SignatureService, BuyTokensData } from './eip712SignatureService';

export interface BuyTokensRequest {
  buyer: string;
  playerTokenIds: number[];
  amounts: string[];
  maxCurrencySpend: string;
  deadline: number;
}

export interface BuyTokensTransaction {
  id: string;
  userId: string;
  nonce: number;
  playerTokenIds: number[];
  amounts: string[];
  maxCurrencySpend: string;
  deadline: number;
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

export class BuyTokensService {
  private get prisma() {
    return getDatabase();
  }

  async prepareSignature(request: BuyTokensRequest): Promise<{
    signature: string;
    nonce: number;
    signer: string;
    txId: string;
    validUntil: number;
  }> {
    // Ensure user exists
    let user = await this.prisma.user.findUnique({
      where: { walletAddress: request.buyer }
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          walletAddress: request.buyer,
          tournamentPoints: 100,
          skillPoints: 50
        }
      });
    }

    // Get next nonce - synchronize with on-chain state
    let nextNonce: number;
    try {
      const onChainNonce = await eip712SignatureService.getOnChainNonce(request.buyer);
      
      // Get the last nonce used in our database
      const lastTransaction = await this.prisma.$queryRaw<Array<{ nonce_used: number }>>`
        SELECT nonce_used FROM buy_tokens_transactions 
        WHERE user_id = ${user.id} 
        ORDER BY nonce_used DESC 
        LIMIT 1
      `;

      const lastDbNonce = lastTransaction.length > 0 ? lastTransaction[0].nonce_used : 0;
      nextNonce = Math.max(onChainNonce, lastDbNonce + 1);
    } catch (error) {
      // Fallback to database-only nonce if on-chain check fails
      const lastTransaction = await this.prisma.$queryRaw<Array<{ nonce_used: number }>>`
        SELECT nonce_used FROM buy_tokens_transactions 
        WHERE user_id = ${user.id} 
        ORDER BY nonce_used DESC 
        LIMIT 1
      `;

      nextNonce = lastTransaction.length > 0 ? lastTransaction[0].nonce_used + 1 : 1;
    }

    // Prepare EIP712 signature data
    const buyTokensData: BuyTokensData = {
      buyer: request.buyer,
      playerTokenIds: request.playerTokenIds.map(id => BigInt(id)),
      amounts: request.amounts.map(amt => BigInt(amt)),
      maxCurrencySpend: BigInt(request.maxCurrencySpend),
      deadline: BigInt(request.deadline),
      nonce: BigInt(nextNonce)
    };

    // Create signature
    const signatureResult = await eip712SignatureService.createBuyTokensSignature(buyTokensData);

    // Save transaction to database
    const transaction = await this.prisma.$executeRaw`
      INSERT INTO buy_tokens_transactions 
      (id, user_id, nonce_used, player_token_ids, amounts, max_currency_spend, deadline, signature, status, created_at)
      VALUES (
        ${this.generateId()},
        ${user.id},
        ${nextNonce},
        ${JSON.stringify(request.playerTokenIds)},
        ${JSON.stringify(request.amounts)},
        ${request.maxCurrencySpend},
        ${request.deadline},
        ${signatureResult.signature},
        'pending',
        ${new Date()}
      )
    `;

    const txId = this.generateId();

    return {
      signature: signatureResult.signature,
      nonce: nextNonce,
      signer: signatureResult.signer,
      txId,
      validUntil: request.deadline
    };
  }

  async getUserNonce(address: string): Promise<{
    onChainNonce?: number;
    dbNonce: number;
    nextNonce: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress: address }
    });

    if (!user) {
      return {
        dbNonce: 0,
        nextNonce: 1
      };
    }

    // Get database nonce
    const lastTransaction = await this.prisma.$queryRaw<Array<{ nonce_used: number }>>`
      SELECT nonce_used FROM buy_tokens_transactions 
      WHERE user_id = ${user.id} 
      ORDER BY nonce_used DESC 
      LIMIT 1
    `;

    const dbNonce = lastTransaction.length > 0 ? lastTransaction[0].nonce_used : 0;

    try {
      // Try to get on-chain nonce
      const onChainNonce = await eip712SignatureService.getOnChainNonce(address);
      return {
        onChainNonce,
        dbNonce,
        nextNonce: Math.max(onChainNonce, dbNonce + 1)
      };
    } catch (error) {
      // Return database nonce if on-chain fails
      return {
        dbNonce,
        nextNonce: dbNonce + 1
      };
    }
  }

  async updateTransactionStatus(
    txId: string, 
    status: 'pending' | 'confirmed' | 'failed', 
    txHash?: string
  ): Promise<boolean> {
    try {
      const result = await this.prisma.$executeRaw`
        UPDATE buy_tokens_transactions 
        SET status = ${status}, 
            tx_hash = ${txHash || null}, 
            confirmed_at = ${status === 'confirmed' ? new Date() : null}
        WHERE id = ${txId}
      `;

      return result > 0;
    } catch (error) {
      console.error('Error updating transaction status:', error);
      return false;
    }
  }

  async getUserTransactions(address: string, limit: number = 50): Promise<any[]> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress: address }
    });

    if (!user) {
      return [];
    }

    const transactions = await this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM buy_tokens_transactions 
      WHERE user_id = ${user.id} 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `;

    return transactions.map(tx => ({
      ...tx,
      playerTokenIds: JSON.parse(tx.player_token_ids),
      amounts: JSON.parse(tx.amounts)
    }));
  }

  private generateId(): string {
    return 'bt_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async createTransaction(
    userId: string,
    nonce: number,
    playerTokenIds: string[],
    amounts: string[],
    maxCurrencySpend: string,
    deadline: number,
    signature: string
  ): Promise<BuyTokensTransaction> {
    const transaction = await this.prisma.buyTokensTransaction.create({
      data: {
        userId,
        nonceUsed: nonce,
        playerTokenIds: JSON.stringify(playerTokenIds),
        amounts: JSON.stringify(amounts),
        maxCurrencySpend,
        deadline,
        signature,
        status: 'pending'
      }
    });

    return {
      id: transaction.id,
      userId: transaction.userId,
      nonce: transaction.nonceUsed,
      playerTokenIds: JSON.parse(transaction.playerTokenIds),
      amounts: JSON.parse(transaction.amounts),
      maxCurrencySpend: transaction.maxCurrencySpend,
      deadline: transaction.deadline,
      signature: transaction.signature,
      status: transaction.status as 'pending' | 'confirmed' | 'failed',
      txHash: transaction.txHash || undefined,
      createdAt: transaction.createdAt,
      confirmedAt: transaction.confirmedAt || undefined
    };
  }

  async getTransactionsByAddress(
    address: string,
    status?: string,
    limit: number = 50
  ): Promise<BuyTokensTransaction[]> {
    // Find user by address
    const user = await this.prisma.user.findUnique({
      where: { walletAddress: address }
    });

    if (!user) {
      return [];
    }

    const where: any = { userId: user.id };
    if (status) {
      where.status = status;
    }

    const transactions = await this.prisma.buyTokensTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return transactions.map(tx => ({
      id: tx.id,
      userId: tx.userId,
      nonce: tx.nonceUsed,
      playerTokenIds: JSON.parse(tx.playerTokenIds),
      amounts: JSON.parse(tx.amounts),
      maxCurrencySpend: tx.maxCurrencySpend,
      deadline: tx.deadline,
      signature: tx.signature,
      status: tx.status as 'pending' | 'confirmed' | 'failed',
      txHash: tx.txHash || undefined,
      createdAt: tx.createdAt,
      confirmedAt: tx.confirmedAt || undefined
    }));
  }

  async confirmTransaction(
    transactionId: string,
    userId: string,
    txHash: string
  ): Promise<BuyTokensTransaction | null> {
    // Find and update the transaction
    const transaction = await this.prisma.buyTokensTransaction.findFirst({
      where: {
        id: transactionId,
        userId: userId,
        status: 'pending'
      }
    });

    if (!transaction) {
      return null;
    }

    const updatedTransaction = await this.prisma.buyTokensTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'confirmed',
        txHash,
        confirmedAt: new Date()
      }
    });

    return {
      id: updatedTransaction.id,
      userId: updatedTransaction.userId,
      nonce: updatedTransaction.nonceUsed,
      playerTokenIds: JSON.parse(updatedTransaction.playerTokenIds),
      amounts: JSON.parse(updatedTransaction.amounts),
      maxCurrencySpend: updatedTransaction.maxCurrencySpend,
      deadline: updatedTransaction.deadline,
      signature: updatedTransaction.signature,
      status: updatedTransaction.status as 'pending' | 'confirmed' | 'failed',
      txHash: updatedTransaction.txHash || undefined,
      createdAt: updatedTransaction.createdAt,
      confirmedAt: updatedTransaction.confirmedAt || undefined
    };
  }
}

export const buyTokensService = new BuyTokensService();
