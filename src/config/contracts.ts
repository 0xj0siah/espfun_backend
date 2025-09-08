export const CONTRACT_ADDRESSES = {
  player: '0x35163e4FA25c05E756aA8012a33827bE60aC0D52',
  fdfPair: '0xA160B769d12A0F3B932113BB4F181544Af5Ee68d',
  feeManager: '0x419297541e3Da2493f77ADd65216F1431A890b78',
  testERC20: '0xbAa8EF1B3e1384F1F67e208eEE64c01b42D8aB0E',
  playerPack: '0x482E69701c96E600e524d55ae15904142f63691b',
  developmentPlayers: '0xCEa8bC8F79C3af4Db7D4c7b09C851FAc6128F202',
  playerContracts: '0x3f87a9376ec29426d0367fa6eA2E39bD12e1A1aA'
};

export const NETWORK_CONFIG = {
  chainId: 10143,
  name: 'Monad Testnet',
  rpcUrl: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
  blockExplorer: 'https://testnet-explorer.monad.xyz'
};
