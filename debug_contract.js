const { ethers } = require('ethers');

async function decodeContractError() {
  console.log('Attempting to decode contract error...');

  const errorData = '0xe2517d3f000000000000000000000000000000000000000000000000000000000000000056b6ce1324370b67cbc1a933ee009d0ab282f42f62987146897481e1b8a655a2';

  // The first 4 bytes are the error selector
  const errorSelector = errorData.slice(0, 10); // 0xe2517d3f
  console.log('Error selector:', errorSelector);

  // Try to decode as a custom error
  const iface = new ethers.Interface([
    'error CustomError(bytes32 data)'
  ]);

  try {
    const decoded = iface.decodeErrorResult('CustomError', errorData);
    console.log('Decoded error:', decoded);
  } catch (e) {
    console.log('Could not decode as CustomError');
  }

  // Check if it's a common error
  if (errorSelector === '0x08c379a0') {
    console.log('This is a standard Error(string) revert');
    const errorMessage = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + errorData.slice(10))[0];
    console.log('Error message:', errorMessage);
  } else {
    console.log('Unknown error selector - might be a custom contract error');
  }
}

async function checkContractFunctions() {
  console.log('\nChecking contract for other functions...');

  const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
  const contractAddress = '0x482E69701c96E600e524d55ae15904142f63691b';

  // Try to call some common view functions
  const commonFunctions = [
    'function owner() view returns (address)',
    'function getPackCost(uint8) view returns (uint256)',
    'function isActive() view returns (bool)',
    'function packs(uint8) view returns (tuple)'
  ];

  for (const func of commonFunctions) {
    try {
      const contract = new ethers.Contract(contractAddress, [func], provider);
      const functionName = func.split(' ')[1].split('(')[0];

      if (func.includes('view')) {
        console.log(`Trying ${functionName}...`);
        // This would be a view function call
        // We'll skip actual calls for now to avoid more errors
      }
    } catch (e) {
      // Function doesn't exist, continue
    }
  }
}

decodeContractError();
checkContractFunctions();
