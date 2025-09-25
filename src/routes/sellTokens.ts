import express from 'express';
import { sellTokensService, SellTokensRequest } from '../services/sellTokensService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SellTokensRequest:
 *       type: object
 *       required:
 *         - playerTokenIds
 *         - amounts
 *         - minCurrencyToReceive
 *         - deadline
 *       properties:
 *         playerTokenIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of player token IDs to sell
 *           example: [1, 2, 3]
 *         amounts:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of amounts to sell for each token
 *           example: [100, 200, 150]
 *         minCurrencyToReceive:
 *           type: integer
 *           description: Minimum amount of currency to receive
 *           example: 1000
 *         deadline:
 *           type: integer
 *           description: Unix timestamp when the signature expires
 *           example: 1704067200
 *     
 *     SellTokensSignatureResponse:
 *       type: object
 *       properties:
 *         signature:
 *           type: string
 *           description: EIP712 signature for the sell transaction
 *         transactionId:
 *           type: string
 *           description: Unique transaction identifier
 *         contractAddress:
 *           type: string
 *           description: Player contract address
 *         txSignerAddress:
 *           type: string
 *           description: Address of the transaction signer
 *     
 *     SellTokensNonceResponse:
 *       type: object
 *       properties:
 *         nonce:
 *           type: integer
 *           description: Next available nonce for the user
 *         address:
 *           type: string
 *           description: User wallet address
 *     
 *     SellTokensTransaction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userAddress:
 *           type: string
 *         playerTokenIds:
 *           type: array
 *           items:
 *             type: integer
 *         amounts:
 *           type: array
 *           items:
 *             type: integer
 *         minCurrencyToReceive:
 *           type: integer
 *         deadline:
 *           type: integer
 *         nonce:
 *           type: integer
 *         signature:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, confirmed, failed]
 *         txHash:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/sell-tokens/prepare-signature:
 *   post:
 *     summary: Prepare EIP712 signature for selling player tokens
 *     tags: [SellTokens]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SellTokensRequest'
 *     responses:
 *       200:
 *         description: Signature prepared successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SellTokensSignatureResponse'
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error
 */
router.post('/prepare-signature', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userAddress = req.user!.walletAddress;
    const sellTokensRequest: SellTokensRequest = req.body;

    logger.info(`Preparing sellTokens signature for user: ${userAddress}`);

    const result = await sellTokensService.prepareSellTokensSignature(userAddress, sellTokensRequest);

    if (result.success) {
      // Remove the success wrapper to match buyTokens pattern
      const { success, ...responseData } = result;
      res.json(responseData);
    } else {
      res.status(400).json({
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in prepare-signature endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/sell-tokens/nonce:
 *   get:
 *     summary: Get the current nonce for the user
 *     tags: [SellTokens]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Nonce retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SellTokensNonceResponse'
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error
 */
router.get('/nonce', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userAddress = req.user!.walletAddress;

    logger.info(`Getting nonce for user: ${userAddress}`);

    const result = await sellTokensService.getNonce(userAddress);

    if (result.success) {
      // Remove the success wrapper to match buyTokens pattern
      res.json({
        nonce: result.nonce,
        address: userAddress
      });
    } else {
      res.status(500).json({
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in nonce endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/sell-tokens/transactions:
 *   get:
 *     summary: Get all sellTokens transactions for the user
 *     tags: [SellTokens]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SellTokensTransaction'
 *                 count:
 *                   type: integer
 *                   description: Number of transactions returned
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error
 */
router.get('/transactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userAddress = req.user!.walletAddress;

    logger.info(`Getting transactions for user: ${userAddress}`);

    const transactions = await sellTokensService.getUserTransactions(userAddress);

    res.json({
      transactions,
      count: transactions.length
    });
  } catch (error) {
    logger.error('Error in transactions endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/sell-tokens/transaction/{id}/confirm:
 *   post:
 *     summary: Confirm a sellTokens transaction with blockchain transaction hash
 *     tags: [SellTokens]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID to confirm
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 description: Blockchain transaction hash
 *               status:
 *                 type: string
 *                 enum: [confirmed, failed]
 *                 default: confirmed
 *                 description: The transaction status
 *     responses:
 *       200:
 *         description: Transaction confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 transaction:
 *                   $ref: '#/components/schemas/SellTokensTransaction'
 *       400:
 *         description: Invalid request parameters or transaction not found
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
router.post('/transaction/:id/confirm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const transactionId = req.params.id;
    const { txHash, status = 'confirmed' } = req.body;
    const userAddress = req.user!.walletAddress;

    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({
        error: 'Transaction hash is required'
      });
    }

    if (!['confirmed', 'failed'].includes(status)) {
      return res.status(400).json({
        error: 'status must be either "confirmed" or "failed"'
      });
    }

    logger.info(`Confirming sellTokens transaction: ${transactionId} with hash: ${txHash}`);

    // Verify the transaction exists and belongs to the user
    const transaction = await sellTokensService.getTransaction(transactionId);
    
    if (!transaction) {
      return res.status(400).json({
        error: 'Transaction not found or access denied'
      });
    }

    if (transaction.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    const updated = await sellTokensService.updateTransactionStatus(transactionId, status, txHash);

    if (!updated) {
      return res.status(500).json({
        error: 'Failed to update transaction status'
      });
    }

    // Get the updated transaction to return
    const updatedTransaction = await sellTokensService.getTransaction(transactionId);

    res.json({
      message: 'Transaction confirmed successfully',
      transaction: updatedTransaction
    });
  } catch (error) {
    logger.error('Error in confirm endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/sell-tokens/transaction/{id}:
 *   get:
 *     summary: Get a specific sellTokens transaction by ID
 *     tags: [SellTokens]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transaction:
 *                   $ref: '#/components/schemas/SellTokensTransaction'
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       403:
 *         description: Access denied - transaction belongs to another user
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get('/transaction/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userAddress = req.user!.walletAddress;

    logger.info(`Getting transaction ${id} for user: ${userAddress}`);

    const transaction = await sellTokensService.getTransaction(id);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    if (transaction.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      transaction
    });
  } catch (error) {
    logger.error('Error in transaction endpoint:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;
