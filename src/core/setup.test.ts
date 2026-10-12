import { describe, it, expect } from 'vitest';
import { APP_CONFIG } from './config';

describe('Project M0 Foundation', () => {
  it('should have Vitest properly configured', () => {
    expect(true).toBe(true);
  });

  it('should enforce Sepolia testnet as default configuration', () => {
    expect(APP_CONFIG.chainId).toBe(11155111);
    expect(APP_CONFIG.isMainnet).toBe(false);
  });
});
