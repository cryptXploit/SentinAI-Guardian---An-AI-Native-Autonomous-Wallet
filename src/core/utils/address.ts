import { isAddress } from 'viem';

export function isValidEvmAddress(address: string): boolean {
  return isAddress(address);
}
