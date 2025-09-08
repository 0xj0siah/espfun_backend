import express from 'express';
import { EIP712SignatureService } from '../services/eip712SignatureService';
import { BuyTokensService } from '../services/buyTokensService';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();
const eip712Service = new EIP712SignatureService();
const buyTokensService = new BuyTokensService();

// Validation schemas
const prepareSignatureSchema = z.object({
  playerTokenIds: z.array(z.string()),
  amounts: z.array(z.string()),
  maxCurrencySpend: z.string(),
  deadline: z.number().int()
});

/**
 * @swagger
 * /api/buyTokens/prepare-signature:
 *   post:
 *     summary: Prepare EIP712 signature for buyTokens transaction
 *     tags: [BuyTokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - playerTokenIds
 *               - amounts
 *               - maxCurrencySpend
 *               - deadline
 *             properties:
 *               playerTokenIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of player token IDs to purchase
 *               amounts:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of amounts corresponding to each token
 *               maxCurrencySpend:
 *                 type: string
 *                 description: Maximum currency willing to spend
 *               deadline:
 *                 type: integer
 *                 description: Transaction deadline timestamp
 *     responses:
 *       200:
 *         description: Signature prepared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signature:
 *                   type: string
 *                   description: EIP712 signature for the transaction
 *                 txData:
 *                   type: object
 *                   description: Transaction data that was signed
 *                 transactionId:
 *                   type: string
 *                   description: Database transaction ID for tracking
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.post('/prepare-signature', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const validatedData = prepareSignatureSchema.parse(req.body);
    const userId = req.user!.id;
    const userAddress = req.user!.walletAddress;

    // Get the next nonce for this user
    const nonce = await eip712Service.getOnChainNonce(userAddress);

    // Prepare the transaction data - convert to correct format
    const buyTokensData = {
      buyer: userAddress,
      nonce: BigInt(nonce),
      playerTokenIds: validatedData.playerTokenIds.map(id => BigInt(id)),
      amounts: validatedData.amounts.map(amt => BigInt(amt)),
      maxCurrencySpend: BigInt(validatedData.maxCurrencySpend),
      deadline: BigInt(validatedData.deadline)
    };

    // Generate the signature
    const signatureResult = await eip712Service.createBuyTokensSignature(buyTokensData);

    // Store the transaction in the database
    const transaction = await buyTokensService.createTransaction(
      userId,
      nonce,
      validatedData.playerTokenIds,
      validatedData.amounts,
      validatedData.maxCurrencySpend,
      validatedData.deadline,
      signatureResult.signature
    );

    res.json({
      signature: signatureResult.signature,
      txData: {
        nonce,
        playerTokenIds: validatedData.playerTokenIds,
        amounts: validatedData.amounts,
        maxCurrencySpend: validatedData.maxCurrencySpend,
        deadline: validatedData.deadline
      },
      transactionId: transaction.id
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors
      });
    }

    console.error('Error preparing signature:', error);
    res.status(500).json({
      error: 'Failed to prepare signature'
    });
  }
});

/**
 * @swagger
 * /api/buyTokens/nonce/{address}:
 *   get:
 *     summary: Get the current nonce for an address
 *     tags: [BuyTokens]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address to get nonce for
 *     responses:
 *       200:
 *         description: Current nonce for the address
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: integer
 *                   description: Current nonce value
 *                 address:
 *                   type: string
 *                   description: The wallet address
 *       400:
 *         description: Invalid address format
 */
router.get('/nonce/:address', async (req, res) => {
  try {
    const address = req.params.address;
    
    // Basic address validation
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: 'Invalid address format'
      });
    }

    const nonce = await eip712Service.getOnChainNonce(address);

    res.json({
      nonce,
      address
    });

  } catch (error) {
    console.error('Error getting nonce:', error);
    res.status(500).json({
      error: 'Failed to get nonce'
    });
  }
});

/**
 * @swagger
 * /api/buyTokens/transactions/{address}:
 *   get:
 *     summary: Get buyTokens transactions for an address
 *     tags: [BuyTokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Wallet address to get transactions for
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, failed]
 *         description: Filter by transaction status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of transactions to return
 *     responses:
 *       200:
 *         description: List of buyTokens transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nonceUsed:
 *                         type: integer
 *                       playerTokenIds:
 *                         type: array
 *                         items:
 *                           type: string
 *                       amounts:
 *                         type: array
 *                         items:
 *                           type: string
 *                       maxCurrencySpend:
 *                         type: string
 *                       deadline:
 *                         type: integer
 *                       status:
 *                         type: string
 *                       txHash:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       confirmedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied - can only view own transactions
 */
router.get('/transactions/:address', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const address = req.params.address;
    const userAddress = req.user!.walletAddress;

    // Users can only view their own transactions
    if (address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Access denied - can only view own transactions'
      });
    }

    // Basic address validation
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: 'Invalid address format'
      });
    }

    const status = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const transactions = await buyTokensService.getTransactionsByAddress(
      address,
      status,
      limit
    );

    res.json({
      transactions,
      count: transactions.length
    });

  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({
      error: 'Failed to get transactions'
    });
  }
});

/**
 * @swagger
 * /api/buyTokens/transaction/{id}/confirm:
 *   post:
 *     summary: Confirm a buyTokens transaction with tx hash
 *     tags: [BuyTokens]
 *     security:
 *       - bearerAuth: []
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
 *                   type: object
 *       400:
 *         description: Invalid request or transaction not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.post('/transaction/:id/confirm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const transactionId = req.params.id;
    const { txHash } = req.body;
    const userId = req.user!.id;

    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({
        error: 'Transaction hash is required'
      });
    }

    const transaction = await buyTokensService.confirmTransaction(
      transactionId,
      userId,
      txHash
    );

    if (!transaction) {
      return res.status(400).json({
        error: 'Transaction not found or access denied'
      });
    }

    res.json({
      message: 'Transaction confirmed successfully',
      transaction
    });

  } catch (error) {
    console.error('Error confirming transaction:', error);
    res.status(500).json({
      error: 'Failed to confirm transaction'
    });
  }
});

export { router as buyTokensRoutes };
export default router;
