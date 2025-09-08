import { ethers } from 'ethers';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export class MonadBlockchain {
  private provider: ethers.JsonRpcProvider | null;

  constructor() {
    if (process.env.MONAD_RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
    } else {
      this.provider = null;
      logger.warn('MONAD_RPC_URL not configured - blockchain features disabled');
    }
  }

  private checkProvider() {
    if (!this.provider) {
      throw new Error('Blockchain provider not configured - set MONAD_RPC_URL environment variable');
    }
  }

  async verifyWalletSignature(
    message: string,
    signature: string,
    expectedAddress: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      logger.error('Signature verification failed:', error);
      return false;
    }
  }

  async isValidWalletAddress(address: string): Promise<boolean> {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  async getPlayerNFTs(walletAddress: string, contractAddress: string): Promise<any[]> {
    this.checkProvider();
    try {
      // ERC-721 ABI for balanceOf and tokenOfOwnerByIndex
      const erc721ABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
        'function tokenURI(uint256 tokenId) view returns (string)'
      ];

      const contract = new ethers.Contract(contractAddress, erc721ABI, this.provider);
      
      const balance = await contract.balanceOf(walletAddress);
      const tokens = [];

      for (let i = 0; i < balance; i++) {
        try {
          const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
          const tokenURI = await contract.tokenURI(tokenId);
          
          tokens.push({
            tokenId: tokenId.toString(),
            tokenURI,
            contractAddress
          });
        } catch (error) {
          logger.warn(`Failed to fetch token at index ${i}:`, error);
        }
      }

      return tokens;
    } catch (error) {
      logger.error('Failed to fetch NFTs:', error);
      throw new Error('Failed to fetch player NFTs from blockchain');
    }
  }

  async verifyNFTOwnership(
    walletAddress: string,
    contractAddress: string,
    tokenId: string
  ): Promise<boolean> {
    this.checkProvider();
    try {
      const erc721ABI = [
        'function ownerOf(uint256 tokenId) view returns (address)'
      ];

      const contract = new ethers.Contract(contractAddress, erc721ABI, this.provider);
      const owner = await contract.ownerOf(tokenId);
      
      return owner.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      logger.error('NFT ownership verification failed:', error);
      return false;
    }
  }

  async getBlockNumber(): Promise<number> {
    this.checkProvider();
    try {
      return await this.provider!.getBlockNumber();
    } catch (error) {
      logger.error('Failed to get block number:', error);
      throw error;
    }
  }

  async getTransactionReceipt(txHash: string) {
    this.checkProvider();
    try {
      return await this.provider!.getTransactionReceipt(txHash);
    } catch (error) {
      logger.error('Failed to get transaction receipt:', error);
      throw error;
    }
  }
}

export const monadBlockchain = new MonadBlockchain();
