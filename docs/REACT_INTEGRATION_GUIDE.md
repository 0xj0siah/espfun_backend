# React Frontend Integration Guide for EIP712 BuyTokens

This guide demonstrates how to integrate EIP712 signature functionality with a React frontend to interact with the buyTokens smart contract function through our backend API.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment Setup](#environment-setup)
4. [Wallet Connection](#wallet-connection)
5. [API Service](#api-service)
6. [React Components](#react-components)
7. [Complete Integration Example](#complete-integration-example)
8. [Error Handling](#error-handling)
9. [Testing](#testing)

## Prerequisites

- React 18+
- Node.js 18+
- MetaMask or compatible wallet
- Ethers.js v6
- Backend API running on `http://localhost:5000`

## Installation

First, install the required dependencies:

```bash
npm install ethers axios @types/node
# or
yarn add ethers axios @types/node
```

## Environment Setup

Create a `.env.local` file in your React project root:

```env
# React Environment Variables
REACT_APP_API_BASE_URL=http://localhost:5000
REACT_APP_MONAD_CHAIN_ID=10143
REACT_APP_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
REACT_APP_FDF_PAIR_CONTRACT=0xA160B769d12A0F3B932113BB4F181544Af5Ee68d
```

## Wallet Connection

### `hooks/useWallet.ts`

```typescript
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  isConnected: boolean;
  chainId: number | null;
}

export const useWallet = () => {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null,
    isConnected: false,
    chainId: null,
  });

  const connectWallet = async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setWallet({
        address: accounts[0],
        provider,
        signer,
        isConnected: true,
        chainId: Number(network.chainId),
      });

      return accounts[0];
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  };

  const switchToMonad = async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(process.env.REACT_APP_MONAD_CHAIN_ID).toString(16)}` }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        // Chain not added to MetaMask
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${Number(process.env.REACT_APP_MONAD_CHAIN_ID).toString(16)}`,
            chainName: 'Monad Testnet',
            nativeCurrency: {
              name: 'MON',
              symbol: 'MON',
              decimals: 18,
            },
            rpcUrls: [process.env.REACT_APP_MONAD_RPC_URL],
            blockExplorerUrls: ['https://testnet-explorer.monad.xyz/'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  };

  const disconnect = () => {
    setWallet({
      address: null,
      provider: null,
      signer: null,
      isConnected: false,
      chainId: null,
    });
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          connectWallet();
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }
    };
  }, []);

  return {
    ...wallet,
    connectWallet,
    switchToMonad,
    disconnect,
  };
};
```

## API Service

### `services/apiService.ts`

```typescript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

export interface BuyTokensRequest {
  playerTokenIds: string[];
  amounts: string[];
  maxCurrencySpend: string;
  deadline: number;
}

export interface SignatureResponse {
  signature: string;
  txData: {
    nonce: number;
    playerTokenIds: string[];
    amounts: string[];
    maxCurrencySpend: string;
    deadline: number;
  };
  transactionId: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    walletAddress: string;
    tournamentPoints: number;
    skillPoints: number;
  };
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('authToken');
  }

  setAuthToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  clearAuthToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Authentication
  async getNonce(address: string): Promise<{ nonce: string; message: string }> {
    const response = await axios.post(`${API_BASE_URL}/api/auth/nonce`, {
      walletAddress: address
    });
    return response.data;
  }

  async login(address: string, signature: string, message: string): Promise<AuthResponse> {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      walletAddress: address,
      signature,
      message
    });
    return response.data;
  }

  // BuyTokens EIP712 Signature
  async prepareSignature(request: BuyTokensRequest): Promise<SignatureResponse> {
    const response = await axios.post(
      `${API_BASE_URL}/api/buyTokens/prepare-signature`,
      request,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getBuyTokensNonce(address: string): Promise<{ nonce: number; address: string }> {
    const response = await axios.get(`${API_BASE_URL}/api/buyTokens/nonce/${address}`);
    return response.data;
  }

  async getTransactions(address: string, status?: string): Promise<any> {
    const params = status ? `?status=${status}` : '';
    const response = await axios.get(
      `${API_BASE_URL}/api/buyTokens/transactions/${address}${params}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async confirmTransaction(transactionId: string, txHash: string): Promise<any> {
    const response = await axios.post(
      `${API_BASE_URL}/api/buyTokens/transaction/${transactionId}/confirm`,
      { txHash },
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export const apiService = new ApiService();
```

### `services/authService.ts`

```typescript
import { ethers } from 'ethers';
import { apiService } from './apiService';

export const authenticateWallet = async (
  address: string,
  signer: ethers.JsonRpcSigner
): Promise<string> => {
  try {
    // Get nonce from backend
    const { nonce, message } = await apiService.getNonce(address);
    
    // Sign the message provided by the backend
    const signature = await signer.signMessage(message);
    
    // Login with signature and original message
    const authResponse = await apiService.login(address, signature, message);
    
    // Store token
    apiService.setAuthToken(authResponse.token);
    
    return authResponse.token;
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
};
```

## React Components

### `components/WalletConnect.tsx`

```typescript
import React, { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { authenticateWallet } from '../services/authService';

export const WalletConnect: React.FC = () => {
  const { address, isConnected, connectWallet, switchToMonad, chainId, signer } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const connectedAddress = await connectWallet();
      
      // Check if on correct chain
      const targetChainId = Number(process.env.REACT_APP_MONAD_CHAIN_ID);
      if (chainId !== targetChainId) {
        await switchToMonad();
      }

      // Authenticate with backend
      if (signer) {
        await authenticateWallet(connectedAddress, signer);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <button 
        onClick={handleConnect} 
        disabled={isLoading}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm text-gray-600">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      {isAuthenticated && (
        <span className="text-green-500 text-sm">✓ Authenticated</span>
      )}
    </div>
  );
};
```

### `components/BuyTokensForm.tsx`

```typescript
import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { apiService } from '../services/apiService';

interface TokenPurchase {
  tokenId: string;
  amount: string;
}

export const BuyTokensForm: React.FC = () => {
  const { address, signer, provider } = useWallet();
  const [purchases, setPurchases] = useState<TokenPurchase[]>([
    { tokenId: '', amount: '' }
  ]);
  const [maxSpend, setMaxSpend] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const addPurchase = () => {
    setPurchases([...purchases, { tokenId: '', amount: '' }]);
  };

  const removePurchase = (index: number) => {
    setPurchases(purchases.filter((_, i) => i !== index));
  };

  const updatePurchase = (index: number, field: keyof TokenPurchase, value: string) => {
    const updated = [...purchases];
    updated[index][field] = value;
    setPurchases(updated);
  };

  const handleBuyTokens = async () => {
    if (!address || !signer || !provider) {
      alert('Please connect your wallet first');
      return;
    }

    // Validate inputs
    const validPurchases = purchases.filter(p => p.tokenId && p.amount);
    if (validPurchases.length === 0 || !maxSpend) {
      alert('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      // Prepare request data
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const playerTokenIds = validPurchases.map(p => p.tokenId);
      const amounts = validPurchases.map(p => ethers.parseEther(p.amount).toString());
      const maxCurrencySpend = ethers.parseEther(maxSpend).toString();

      // Get signature from backend
      const signatureData = await apiService.prepareSignature({
        playerTokenIds,
        amounts,
        maxCurrencySpend,
        deadline
      });

      console.log('Signature prepared:', signatureData);

      // Create contract instance
      const contractAddress = process.env.REACT_APP_FDF_PAIR_CONTRACT!;
      
      // ABI for buyTokens function
      const contractABI = [
        {
          "name": "buyTokens",
          "type": "function",
          "inputs": [
            {"name": "buyer", "type": "address"},
            {"name": "playerTokenIds", "type": "uint256[]"},
            {"name": "amounts", "type": "uint256[]"},
            {"name": "maxCurrencySpend", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
            {"name": "nonce", "type": "uint256"},
            {"name": "signature", "type": "bytes"}
          ],
          "outputs": [],
          "stateMutability": "nonpayable"
        }
      ];

      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      // Execute transaction
      const tx = await contract.buyTokens(
        address,
        playerTokenIds.map(id => BigInt(id)),
        amounts.map(amt => BigInt(amt)),
        BigInt(maxCurrencySpend),
        BigInt(deadline),
        BigInt(signatureData.txData.nonce),
        signatureData.signature
      );

      console.log('Transaction sent:', tx.hash);
      setTxHash(tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      // Confirm transaction with backend
      await apiService.confirmTransaction(signatureData.transactionId, tx.hash);

      alert('Tokens purchased successfully!');
      
      // Reset form
      setPurchases([{ tokenId: '', amount: '' }]);
      setMaxSpend('');

    } catch (error) {
      console.error('Failed to buy tokens:', error);
      alert(`Failed to buy tokens: ${error.message || error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Buy Player Tokens</h2>
      
      {purchases.map((purchase, index) => (
        <div key={index} className="mb-4 p-4 border rounded">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">Token {index + 1}</h3>
            {purchases.length > 1 && (
              <button
                onClick={() => removePurchase(index)}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
          
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Token ID
            </label>
            <input
              type="text"
              value={purchase.tokenId}
              onChange={(e) => updatePurchase(index, 'tokenId', e.target.value)}
              placeholder="Enter token ID"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Amount (ETH)
            </label>
            <input
              type="text"
              value={purchase.amount}
              onChange={(e) => updatePurchase(index, 'amount', e.target.value)}
              placeholder="0.0"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
      ))}
      
      <button
        onClick={addPurchase}
        className="mb-4 text-blue-500 hover:text-blue-700"
      >
        + Add Another Token
      </button>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700">
          Max Currency Spend (ETH)
        </label>
        <input
          type="text"
          value={maxSpend}
          onChange={(e) => setMaxSpend(e.target.value)}
          placeholder="Maximum amount willing to spend"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>
      
      <button
        onClick={handleBuyTokens}
        disabled={isLoading}
        className="w-full bg-green-500 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded"
      >
        {isLoading ? 'Processing...' : 'Buy Tokens'}
      </button>
      
      {txHash && (
        <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="text-sm">
            Transaction Hash: 
            <br />
            <code className="break-all">{txHash}</code>
          </p>
        </div>
      )}
    </div>
  );
};
```

## Complete Integration Example

### `App.tsx`

```typescript
import React from 'react';
import { WalletConnect } from './components/WalletConnect';
import { BuyTokensForm } from './components/BuyTokensForm';
import { useWallet } from './hooks/useWallet';

function App() {
  const { isConnected } = useWallet();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              ESP Fun - Fantasy Esports
            </h1>
            <WalletConnect />
          </div>
        </div>
      </header>

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {isConnected ? (
            <BuyTokensForm />
          ) : (
            <div className="text-center">
              <p className="text-xl text-gray-600 mb-8">
                Connect your wallet to buy player tokens
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
```

## Error Handling

### `utils/errorHandler.ts`

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const handleApiError = (error: any): string => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
};

export const handleWeb3Error = (error: any): string => {
  if (error.code === 4001) {
    return 'Transaction was rejected by user';
  }
  
  if (error.code === -32603) {
    return 'Internal error occurred';
  }
  
  if (error.reason) {
    return error.reason;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'Transaction failed';
};
```

## Testing

### Example Test: `__tests__/BuyTokensForm.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BuyTokensForm } from '../components/BuyTokensForm';
import { useWallet } from '../hooks/useWallet';
import { apiService } from '../services/apiService';

// Mock the hooks and services
jest.mock('../hooks/useWallet');
jest.mock('../services/apiService');

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('BuyTokensForm', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      signer: {} as any,
      provider: {} as any,
      isConnected: true,
      chainId: 10143,
      connectWallet: jest.fn(),
      switchToMonad: jest.fn(),
      disconnect: jest.fn(),
    });
  });

  test('renders form correctly', () => {
    render(<BuyTokensForm />);
    
    expect(screen.getByText('Buy Player Tokens')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter token ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.0')).toBeInTheDocument();
    expect(screen.getByText('Buy Tokens')).toBeInTheDocument();
  });

  test('adds and removes token purchases', () => {
    render(<BuyTokensForm />);
    
    // Add another token
    fireEvent.click(screen.getByText('+ Add Another Token'));
    expect(screen.getAllByText(/Token \d+/)).toHaveLength(2);
    
    // Remove a token
    fireEvent.click(screen.getAllByText('Remove')[0]);
    expect(screen.getAllByText(/Token \d+/)).toHaveLength(1);
  });
});
```

## Troubleshooting

### Authentication Issues

If you encounter "Access token required" errors, here are the common solutions:

#### 1. **Ensure Proper Authentication Flow**

Make sure the user is authenticated before calling `prepareSignature`:

```typescript
// In your component, check authentication state
const [isAuthenticated, setIsAuthenticated] = useState(false);

useEffect(() => {
  // Check if user has a valid token
  const token = localStorage.getItem('authToken');
  if (token) {
    setIsAuthenticated(true);
  }
}, []);

const handleBuyTokens = async () => {
  if (!isAuthenticated) {
    // Force re-authentication
    if (signer && address) {
      try {
        await authenticateWallet(address, signer);
        setIsAuthenticated(true);
      } catch (error) {
        alert('Please authenticate first');
        return;
      }
    } else {
      alert('Please connect your wallet first');
      return;
    }
  }
  
  // Continue with token purchase...
};
```

#### 2. **Add Token Validation**

Update your `ApiService` to handle token expiration:

```typescript
class ApiService {
  // ... existing code ...

  async makeAuthenticatedRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    data?: any
  ): Promise<T> {
    try {
      const response = await axios({
        method,
        url,
        data,
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired or invalid
        this.clearAuthToken();
        throw new Error('Authentication required. Please reconnect your wallet.');
      }
      throw error;
    }
  }

  async prepareSignature(request: BuyTokensRequest): Promise<SignatureResponse> {
    if (!this.token) {
      throw new Error('Authentication required. Please connect your wallet first.');
    }
    
    return this.makeAuthenticatedRequest<SignatureResponse>(
      'POST',
      `${API_BASE_URL}/api/buyTokens/prepare-signature`,
      request
    );
  }
}
```

#### 3. **Complete Authentication Component**

Here's an improved wallet connection component that handles authentication properly:

```typescript
export const WalletConnect: React.FC = () => {
  const { address, isConnected, connectWallet, switchToMonad, chainId, signer } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token && isConnected) {
      setIsAuthenticated(true);
    }
  }, [isConnected]);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const connectedAddress = await connectWallet();
      
      // Check if on correct chain
      const targetChainId = Number(process.env.REACT_APP_MONAD_CHAIN_ID);
      if (chainId !== targetChainId) {
        await switchToMonad();
      }

      // Authenticate with backend
      if (signer) {
        await authenticateWallet(connectedAddress, signer);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert(`Connection failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReauth = async () => {
    if (!signer || !address) return;
    
    setIsLoading(true);
    try {
      await authenticateWallet(address, signer);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Re-authentication failed:', error);
      alert(`Authentication failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <button 
        onClick={handleConnect} 
        disabled={isLoading}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm text-gray-600">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      {isAuthenticated ? (
        <span className="text-green-500 text-sm">✓ Authenticated</span>
      ) : (
        <button
          onClick={handleReauth}
          disabled={isLoading}
          className="bg-yellow-500 hover:bg-yellow-700 text-white text-sm px-2 py-1 rounded"
        >
          {isLoading ? 'Auth...' : 'Authenticate'}
        </button>
      )}
    </div>
  );
};
```

#### 4. **Debug API Calls**

Add logging to debug authentication issues:

```typescript
// Enhanced authService.ts with debugging
export const authenticateWallet = async (
  address: string,
  signer: ethers.JsonRpcSigner
): Promise<string> => {
  try {
    console.log('🔐 Starting authentication with address:', address);
    
    // Get nonce from backend
    console.log('🔐 Requesting nonce from backend...');
    const { nonce, message } = await apiService.getNonce(address);
    console.log('🔐 Received nonce:', nonce);
    console.log('🔐 Message to sign:', message);
    
    // Sign the message provided by the backend
    console.log('🔐 Signing message...');
    const signature = await signer.signMessage(message);
    console.log('🔐 Signature created:', signature);
    
    // Login with signature and original message
    console.log('🔐 Sending login request...');
    const authResponse = await apiService.login(address, signature, message);
    console.log('🔐 Authentication successful!', authResponse);
    
    // Store token
    apiService.setAuthToken(authResponse.token);
    
    return authResponse.token;
  } catch (error) {
    console.error('🔐 Authentication failed:', error);
    
    // More detailed error logging
    if (error.response) {
      console.error('🔐 Backend error response:', error.response.data);
      console.error('🔐 Status code:', error.response.status);
    } else if (error.request) {
      console.error('🔐 Network error - no response received');
    } else {
      console.error('🔐 Error details:', error.message);
    }
    
    throw new Error(`Authentication failed: ${error.response?.data?.error || error.message}`);
  }
};

// Debug version of ApiService methods
class ApiService {
  // ... existing code ...

  async getNonce(address: string): Promise<{ nonce: string; message: string }> {
    console.log('📡 Requesting nonce for address:', address);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/nonce`, {
        walletAddress: address
      });
      console.log('📡 Nonce response:', response.data);
      return response.data;
    } catch (error) {
      console.error('📡 Nonce request failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async login(address: string, signature: string, message: string): Promise<AuthResponse> {
    console.log('📡 Sending login request for address:', address);
    console.log('📡 Login payload:', { walletAddress: address, signature, message });
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        walletAddress: address,
        signature,
        message
      });
      console.log('📡 Login successful:', response.data);
      return response.data;
    } catch (error) {
      console.error('📡 Login failed:', error.response?.data || error.message);
      if (error.response?.status === 400) {
        console.error('📡 Bad Request - Check payload format');
      }
      throw error;
    }
  }
}
```

#### 5. **Backend Server Status Check**

Make sure your backend is running and accessible:

```typescript
// Add this utility function to check backend connectivity
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    console.log('🏥 Backend health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('🏥 Backend health check failed:', error);
    return false;
  }
};

// Use it before authentication
const handleConnect = async () => {
  // Check backend first
  const isBackendHealthy = await checkBackendHealth();
  if (!isBackendHealthy) {
    alert('Backend server is not responding. Please check if it\'s running on port 5000.');
    return;
  }
  
  // Continue with wallet connection...
};
```

### Common Error Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Access token required" | User not authenticated or token missing | Ensure user is authenticated and token is stored |
| "Request failed with status code 400" | Invalid request payload format | Check that you're sending `walletAddress`, `signature`, and `message` fields |
| "Invalid signature" | Signature verification failed | Ensure you're signing the exact message from `/api/auth/nonce` |
| "Invalid input" | Missing required fields | Verify all required fields are present and properly formatted |
| "Network error" | Backend not accessible | Check if backend is running on correct port (5000) |
| "Chain mismatch" | User on wrong blockchain network | Ensure user is on Monad network |
| CORS errors from privy.io | Unrelated third-party service | These can be ignored - they don't affect your authentication |

### Step-by-Step Debugging

1. **Check Backend Health**:
   ```bash
   curl http://localhost:5000/health
   ```

2. **Test Nonce Endpoint**:
   ```bash
   curl -X POST http://localhost:5000/api/auth/nonce \
     -H "Content-Type: application/json" \
     -d '{"walletAddress":"0x46527D3DC1f448033ee880417B9404c076Cc3E9C"}'
   ```

3. **Verify Request Format**:
   Your login request should look like this:
   ```json
   {
     "walletAddress": "0x46527D3DC1f448033ee880417B9404c076Cc3E9C",
     "signature": "0x...",
     "message": "Please sign this message to authenticate with ESPFun: ESPFun Login - 1725475200000 - abc123"
   }
   ```

4. **Check Console Logs**:
   Look for the debug messages in your browser console to trace where the authentication fails.

## Key Points

1. **Authentication Flow**: Users must connect wallet → sign authentication message → receive JWT token
2. **EIP712 Signatures**: Backend generates structured signatures that frontend uses in contract calls
3. **Transaction Flow**: Prepare signature → Execute contract call → Confirm with backend
4. **Error Handling**: Comprehensive error handling for both API and Web3 interactions
5. **Security**: JWT tokens, signature verification, and nonce management prevent replay attacks

## Backend API Endpoints Used

- `GET /api/auth/nonce/:address` - Get authentication nonce
- `POST /api/auth/login` - Authenticate with wallet signature
- `POST /api/buyTokens/prepare-signature` - Get EIP712 signature for buyTokens
- `GET /api/buyTokens/nonce/:address` - Get current nonce for address
- `GET /api/buyTokens/transactions/:address` - List user transactions
- `POST /api/buyTokens/transaction/:id/confirm` - Confirm transaction completion

This guide provides a complete integration for using EIP712 signatures with your React frontend and the ESP Fun backend API.
