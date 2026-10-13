import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockIntentProvider,
  GeminiIntentProvider,
  getIntentProvider,
  MAX_COMMAND_LENGTH,
} from '../provider';
import { isReadOnlyAction } from '../../domain/schemas';

describe('R6 AI Provider Abstraction Suite', () => {
  beforeEach(() => {
    delete process.env.AI_PROVIDER;
  });

  describe('MockIntentProvider', () => {
    const provider = new MockIntentProvider();

    it('P1: Parses native ETH transfer correctly', async () => {
      const intent = await provider.parseIntent('Send 0.05 ETH to alice');
      expect(intent.action).toBe('TRANSFER');
      expect(intent.amount).toBe('0.05');
      expect(intent.asset).toBe('ETH');
      expect(intent.recipientAlias).toBe('alice');
      expect(isReadOnlyAction(intent.action)).toBe(false);
    });

    it('P2: Parses ERC-20 token transfer correctly', async () => {
      const intent = await provider.parseIntent('Send 100 USDC to bob');
      expect(intent.action).toBe('TRANSFER');
      expect(intent.amount).toBe('100');
      expect(intent.asset).toBe('USDC');
      expect(intent.recipientAlias).toBe('bob');
    });

    it('P3: Parses ERC-20 approval with unlimited amount', async () => {
      const intent = await provider.parseIntent('Approve unlimited DAI for uniswap');
      expect(intent.action).toBe('APPROVE');
      expect(intent.amount).toBe('UNLIMITED');
      expect(intent.asset).toBe('DAI');
      expect(intent.recipientAlias).toBe('uniswap');
    });

    it('P4: Parses read-only balance inquiry correctly', async () => {
      const intent = await provider.parseIntent('Show my wallet balance');
      expect(intent.action).toBe('QUERY_BALANCE');
      expect(isReadOnlyAction(intent.action)).toBe(true);
    });

    it('P5: Parses read-only token-specific balance inquiry correctly', async () => {
      const intent = await provider.parseIntent('How much USDC do I have?');
      expect(intent.action).toBe('QUERY_BALANCE');
      expect(intent.asset).toBe('USDC');
      expect(isReadOnlyAction(intent.action)).toBe(true);
    });

    it('P6: Parses read-only network inquiry correctly', async () => {
      const intent = await provider.parseIntent('What network am I connected to?');
      expect(intent.action).toBe('QUERY_NETWORK');
      expect(isReadOnlyAction(intent.action)).toBe(true);
    });

    it('P7: Classifies conversational or ambiguous prompts as UNKNOWN', async () => {
      const intent = await provider.parseIntent('Good morning guardian, how are you?');
      expect(intent.action).toBe('UNKNOWN');
    });

    it('P8: Enforces maximum command length (500 chars)', async () => {
      const longCommand = 'send '.padEnd(MAX_COMMAND_LENGTH + 10, 'x');
      await expect(provider.parseIntent(longCommand)).rejects.toThrow('INPUT_TOO_LONG');
    });

    it('P9: Enforces non-empty string input', async () => {
      await expect(provider.parseIntent('')).rejects.toThrow('INVALID_INPUT');
    });
  });

  describe('GeminiIntentProvider Guards', () => {
    it('P10: Rejects initialization when API key is missing', () => {
      expect(() => new GeminiIntentProvider('')).toThrow('CONFIG_ERROR');
    });

    it('P11: Rejects input exceeding maximum length before making network call', async () => {
      const gemini = new GeminiIntentProvider('mock-key-for-guard');
      const longCommand = 'send '.padEnd(MAX_COMMAND_LENGTH + 5, 'y');
      await expect(gemini.parseIntent(longCommand)).rejects.toThrow('INPUT_TOO_LONG');
    });
  });

  describe('getIntentProvider explicit selection', () => {
    it('P12: Returns MockIntentProvider when AI_PROVIDER=mock', () => {
      process.env.AI_PROVIDER = 'mock';
      const provider = getIntentProvider();
      expect(provider.name).toBe('mock');
    });

    it('P13: Returns GeminiIntentProvider when AI_PROVIDER=gemini and key is present', () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'test-key-selection';
      const provider = getIntentProvider();
      expect(provider.name).toBe('gemini');
    });

    it('P14: Throws when AI_PROVIDER=gemini but key is missing', () => {
      process.env.AI_PROVIDER = 'gemini';
      delete process.env.GEMINI_API_KEY;
      expect(() => getIntentProvider()).toThrow('CONFIG_ERROR');
    });
  });

  describe('R7.3 AI Error Classification Suite (8 Categories)', () => {
    it('E1: Maps HTTP 401 / unauthenticated to AUTHENTICATION_FAILED', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('API_KEY_INVALID: 401 unauthenticated request');
      const res = classifyAiError(err);
      expect(res.classification).toBe('AUTHENTICATION_FAILED');
      expect(res.httpStatus).toBe(401);
    });

    it('E2: Maps HTTP 403 / permission denied to PERMISSION_DENIED', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('PERMISSION_DENIED: User not allowed to access this resource');
      const res = classifyAiError(err);
      expect(res.classification).toBe('PERMISSION_DENIED');
      expect(res.httpStatus).toBe(403);
    });

    it('E3: Maps HTTP 404 / model not found to MODEL_NOT_FOUND', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('404 NOT_FOUND: models/gemini-legacy is no longer available');
      const res = classifyAiError(err);
      expect(res.classification).toBe('MODEL_NOT_FOUND');
      expect(res.httpStatus).toBe(404);
    });

    it('E4: Maps HTTP 429 / resource exhausted to RATE_LIMITED', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded');
      const res = classifyAiError(err);
      expect(res.classification).toBe('RATE_LIMITED');
      expect(res.httpStatus).toBe(429);
    });

    it('E5: Maps HTTP 503 / high demand to SERVICE_UNAVAILABLE', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand","status":"UNAVAILABLE"}}');
      const res = classifyAiError(err);
      expect(res.classification).toBe('SERVICE_UNAVAILABLE');
      expect(res.httpStatus).toBe(503);
    });

    it('E6: Maps AbortController signal / timeout to REQUEST_TIMEOUT', async () => {
      const { classifyAiError } = await import('../provider');
      const res = classifyAiError(new Error('Operation cancelled'), true);
      expect(res.classification).toBe('REQUEST_TIMEOUT');
      expect(res.httpStatus).toBe(408);
    });

    it('E7: Maps network disconnect / ECONNRESET to PROVIDER_UNAVAILABLE', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('fetch failed: ECONNRESET connection reset by peer');
      const res = classifyAiError(err);
      expect(res.classification).toBe('PROVIDER_UNAVAILABLE');
    });

    it('E8: Maps malformed JSON or unexpected schema to INVALID_RESPONSE', async () => {
      const { classifyAiError } = await import('../provider');
      const err = new Error('SyntaxError: Unexpected token < in JSON at position 0');
      const res = classifyAiError(err);
      expect(res.classification).toBe('INVALID_RESPONSE');
    });
  });
});
