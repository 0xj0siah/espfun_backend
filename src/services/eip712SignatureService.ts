import { ethers } from 'ethers';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface BuyTokensData {
  buyer: string;
  playerTokenIds: bigint[];
  amounts: bigint[];
  maxCurrencySpend: bigint;
  deadline: bigint;
  nonce: bigint;
}

export interface SignatureResult {
  signature: string;
  signer: string;
  message: BuyTokensData;
  domain: any;
}

export class EIP712SignatureService {
  private provider: ethers.JsonRpcProvider | null;
  private txSigner: ethers.Wallet | null;
  private domain: any;
  private types: any;

  constructor() {
    this.initializeProvider();
    this.initializeDomain();
    this.initializeTypes();
  }

  private initializeProvider() {
    if (process.env.MONAD_RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
      
      if (process.env.TX_SIGNER_PRIVATE_KEY) {
        this.txSigner = new ethers.Wallet(process.env.TX_SIGNER_PRIVATE_KEY, this.provider);
        logger.info(`TxSigner initialized: ${this.txSigner.address}`);
      } else {
        this.txSigner = null;
        logger.warn('TX_SIGNER_PRIVATE_KEY not configured - signature features disabled');
      }
    } else {
      this.provider = null;
      this.txSigner = null;
      logger.warn('MONAD_RPC_URL not configured - signature features disabled');
    }
  }

  private initializeDomain() {
    this.domain = {
      name: "FDF Pair",
      version: "1",
      chainId: parseInt(process.env.MONAD_CHAIN_ID || '10143'),
      verifyingContract: process.env.FDFPAIR_CONTRACT || '0xA160B769d12A0F3B932113BB4F181544Af5Ee68d'
    };
  }

  private initializeTypes() {
    this.types = {
      BuyTokens: [
        { name: 'buyer', type: 'address' },
        { name: 'playerTokenIds', type: 'uint256[]' },
        { name: 'amounts', type: 'uint256[]' },
        { name: 'maxCurrencySpend', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
      ]
    };
  }

  private checkSigner() {
    if (!this.txSigner) {
      throw new Error('TxSigner not configured - set TX_SIGNER_PRIVATE_KEY and MONAD_RPC_URL environment variables');
    }
  }

  async createBuyTokensSignature(buyTokensData: BuyTokensData): Promise<SignatureResult> {
    this.checkSigner();
    
    try {
      // Prepare the message exactly as the contract expects
      const message = {
        buyer: buyTokensData.buyer,
        playerTokenIds: buyTokensData.playerTokenIds,
        amounts: buyTokensData.amounts,
        maxCurrencySpend: buyTokensData.maxCurrencySpend,
        deadline: buyTokensData.deadline,
        nonce: buyTokensData.nonce
      };

      // Sign the typed data
      const signature = await this.txSigner!.signTypedData(
        this.domain,
        this.types,
        message
      );

      logger.info(`Created EIP712 signature for buyer ${buyTokensData.buyer}, nonce ${buyTokensData.nonce}`);

      return {
        signature,
        signer: this.txSigner!.address,
        message,
        domain: this.domain
      };
    } catch (error) {
      logger.error('Error creating EIP712 signature:', error);
      throw new Error('Failed to create signature');
    }
  }

  async verifySignature(buyTokensData: BuyTokensData, signature: string): Promise<boolean> {
    try {
      const message = {
        buyer: buyTokensData.buyer,
        playerTokenIds: buyTokensData.playerTokenIds,
        amounts: buyTokensData.amounts,
        maxCurrencySpend: buyTokensData.maxCurrencySpend,
        deadline: buyTokensData.deadline,
        nonce: buyTokensData.nonce
      };

      const recoveredAddress = ethers.verifyTypedData(
        this.domain,
        this.types,
        message,
        signature
      );

      return recoveredAddress.toLowerCase() === this.txSigner?.address.toLowerCase();
    } catch (error) {
      logger.error('Error verifying signature:', error);
      return false;
    }
  }

  async getOnChainNonce(userAddress: string): Promise<number> {
    if (!this.provider) {
      throw new Error('Provider not configured');
    }

    try {
      const fdfPairContract = new ethers.Contract(
        this.domain.verifyingContract,
        ['function usedNonces(address) view returns (uint256)'],
        this.provider
      );
      
      const currentNonce = await fdfPairContract.usedNonces(userAddress);
      return Number(currentNonce) + 1; // Next nonce to use
    } catch (error) {
      logger.error('Error getting on-chain nonce:', error);
      throw new Error('Failed to get nonce from contract');
    }
  }

  getTxSignerAddress(): string | null {
    return this.txSigner?.address || null;
  }

  getDomain() {
    return this.domain;
  }

  getTypes() {
    return this.types;
  }
}

export const eip712SignatureService = new EIP712SignatureService();
