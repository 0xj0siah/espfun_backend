import { ethers } from 'ethers';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface SellTokensData {
  from: string;
  playerTokenIds: bigint[];
  amounts: bigint[];
  minCurrencyToReceive: bigint;
  deadline: bigint;
  nonce: bigint;
}

export interface SellTokensSignatureResult {
  signature: string;
  domain: any;
  types: any;
  value: any;
}

export class EIP712SellTokensService {
  private provider: ethers.JsonRpcProvider | null;
  private txSigner: ethers.Wallet | null;
  private playerContractAddress: string;
  private chainId: number;

  constructor() {
    this.playerContractAddress = process.env.PLAYER_CONTRACT_ADDRESS || '0x35163e4FA25c05E756aA8012a33827bE60aC0D52';
    this.chainId = parseInt(process.env.MONAD_CHAIN_ID || '10143');
    
    this.initializeProvider();
  }

  private initializeProvider() {
    if (process.env.MONAD_RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);

      if (process.env.TX_SIGNER_PRIVATE_KEY) {
        this.txSigner = new ethers.Wallet(process.env.TX_SIGNER_PRIVATE_KEY, this.provider);
        logger.info(`SellTokens TxSigner initialized: ${this.txSigner.address}`);
      } else {
        this.txSigner = null;
        logger.warn('TX_SIGNER_PRIVATE_KEY not configured - sellTokens signature generation disabled');
      }
    } else {
      this.provider = null;
      this.txSigner = null;
      logger.warn('MONAD_RPC_URL not configured - sellTokens signature generation disabled');
    }
  }

  private checkTxSigner() {
    if (!this.txSigner) {
      throw new Error('TxSigner not configured - set TX_SIGNER_PRIVATE_KEY and MONAD_RPC_URL environment variables');
    }
  }

  /**
   * Get the EIP712 domain for the Player contract
   */
  private getDomain() {
    return {
      name: 'FDF Player',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.playerContractAddress
    };
  }

  /**
   * Get the EIP712 types for SellTokens
   */
  private getTypes() {
    return {
      SellTokens: [
        { name: 'from', type: 'address' },
        { name: 'playerTokenIds', type: 'uint256[]' },
        { name: 'amounts', type: 'uint256[]' },
        { name: 'minCurrencyToReceive', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
      ]
    };
  }

  /**
   * Get the current nonce for a user from the Player contract
   */
  async getOnChainNonce(userAddress: string): Promise<number> {
    if (!this.provider) {
      throw new Error('Provider not configured');
    }

    try {
      const playerAbi = [
        'function getCurrentNonce(address _user) external view returns (uint256)'
      ];

      const playerContract = new ethers.Contract(
        this.playerContractAddress,
        playerAbi,
        this.provider
      );

      const currentNonce = await playerContract.getCurrentNonce(userAddress);
      const nextNonce = Number(currentNonce) + 1;

      logger.info(`Current nonce for ${userAddress}: ${currentNonce}, next nonce: ${nextNonce}`);
      
      return nextNonce;
    } catch (error) {
      logger.error('Error getting nonce from Player contract:', error);
      throw new Error('Failed to get nonce from Player contract');
    }
  }

  /**
   * Create an EIP712 signature for sellTokens
   */
  async createSellTokensSignature(sellTokensData: SellTokensData): Promise<SellTokensSignatureResult> {
    this.checkTxSigner();

    try {
      const domain = this.getDomain();
      const types = this.getTypes();
      
      // Convert the data to the format expected by ethers
      const value = {
        from: sellTokensData.from,
        playerTokenIds: sellTokensData.playerTokenIds.map(id => id.toString()),
        amounts: sellTokensData.amounts.map(amt => amt.toString()),
        minCurrencyToReceive: sellTokensData.minCurrencyToReceive.toString(),
        deadline: sellTokensData.deadline.toString(),
        nonce: sellTokensData.nonce.toString()
      };

      logger.info('Creating sellTokens signature for:', {
        from: value.from,
        playerTokenIds: value.playerTokenIds,
        amounts: value.amounts,
        minCurrencyToReceive: value.minCurrencyToReceive,
        deadline: value.deadline,
        nonce: value.nonce
      });

      // Sign the structured data
      const signature = await this.txSigner!.signTypedData(domain, types, value);

      logger.info('SellTokens signature created successfully');

      return {
        signature,
        domain,
        types,
        value
      };
    } catch (error) {
      logger.error('Error creating sellTokens signature:', error);
      throw new Error('Failed to create sellTokens signature');
    }
  }

  /**
   * Verify a sellTokens signature
   */
  async verifySellTokensSignature(
    sellTokensData: SellTokensData,
    signature: string
  ): Promise<boolean> {
    try {
      const domain = this.getDomain();
      const types = this.getTypes();
      
      const value = {
        from: sellTokensData.from,
        playerTokenIds: sellTokensData.playerTokenIds.map(id => id.toString()),
        amounts: sellTokensData.amounts.map(amt => amt.toString()),
        minCurrencyToReceive: sellTokensData.minCurrencyToReceive.toString(),
        deadline: sellTokensData.deadline.toString(),
        nonce: sellTokensData.nonce.toString()
      };

      const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
      
      // Check if the recovered address matches our tx signer
      const isValid = this.txSigner && recoveredAddress.toLowerCase() === this.txSigner.address.toLowerCase();
      
      logger.info(`Signature verification result: ${isValid}`);
      return !!isValid;
    } catch (error) {
      logger.error('Error verifying sellTokens signature:', error);
      return false;
    }
  }

  /**
   * Get the tx signer address
   */
  getTxSignerAddress(): string | null {
    return this.txSigner?.address || null;
  }

  /**
   * Get the Player contract address
   */
  getPlayerContractAddress(): string {
    return this.playerContractAddress;
  }
}

export const eip712SellTokensService = new EIP712SellTokensService();
