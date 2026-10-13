import { describe, it, expect, beforeEach } from 'vitest';
import { validateRuntimeConfig, assertExecutionCredentials } from '../env';

describe('R5E — Runtime Environment Configuration Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('C1: Returns validForExecution=true when all execution credentials are set', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.RPC_URL = 'https://eth-sepolia.test.com';
    process.env.AGENT_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.OPERATOR_PASSWORD = 'strong-password';

    const result = validateRuntimeConfig();
    expect(result.validForExecution).toBe(true);
    expect(result.validForWeb).toBe(true);
    expect(result.missingExecutionKeys).toHaveLength(0);
    expect(result.missingWebKeys).toHaveLength(0);
  });

  it('C2: Detects missing RPC_URL and AGENT_PRIVATE_KEY', () => {
    delete process.env.RPC_URL;
    delete process.env.AGENT_PRIVATE_KEY;

    const result = validateRuntimeConfig();
    expect(result.validForExecution).toBe(false);
    expect(result.missingExecutionKeys).toContain('RPC_URL');
  });

  it('C3: Detects malformed private key (not 66 hex characters)', () => {
    process.env.AGENT_PRIVATE_KEY = 'short-key';
    const result = validateRuntimeConfig();
    expect(result.validForExecution).toBe(false);
  });

  it('C4: assertExecutionCredentials throws MISSING_CREDENTIALS when missing', () => {
    delete process.env.AGENT_PRIVATE_KEY;
    expect(() => assertExecutionCredentials()).toThrow('MISSING_CREDENTIALS');
  });
});
