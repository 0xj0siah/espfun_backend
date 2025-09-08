export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTokenId(tokenId: string): boolean {
  return /^[0-9]+$/.test(tokenId);
}

export function sanitizeWalletAddress(address: string): string {
  return address.toLowerCase().trim();
}

export function validatePointAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0 && amount <= 1000000;
}

export function validateSignatureMessage(message: string): boolean {
  return message.includes('ESPFun Login') && message.length < 500;
}

export interface ValidationError {
  field: string;
  message: string;
}

export function createValidationError(field: string, message: string): ValidationError {
  return { field, message };
}
