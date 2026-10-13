/**
 * Runtime Environment Configuration & Validation (Milestone R5E)
 *
 * Separates execution-critical configuration from optional configuration.
 * Missing live execution credentials fail closed.
 */

export type RuntimeConfigSummary = {
  hasGeminiKey: boolean;
  geminiModel: string;
  hasRpcUrl: boolean;
  hasPrivateKey: boolean;
  hasOperatorPassword: boolean;
  dbPath: string;
  nodeEnv: string;
};

export type ConfigValidationResult = {
  validForExecution: boolean;
  validForWeb: boolean;
  missingExecutionKeys: string[];
  missingWebKeys: string[];
  summary: RuntimeConfigSummary;
};

export function validateRuntimeConfig(): ConfigValidationResult {
  const missingExecutionKeys: string[] = [];
  const missingWebKeys: string[] = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const operatorPassword = process.env.OPERATOR_PASSWORD;

  if (!geminiKey) {
    missingExecutionKeys.push('GEMINI_API_KEY');
  }

  if (!rpcUrl) {
    missingExecutionKeys.push('RPC_URL');
  }

  if (!privateKey) {
    missingExecutionKeys.push('AGENT_PRIVATE_KEY');
  } else if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    missingExecutionKeys.push('AGENT_PRIVATE_KEY (must be a valid 32-byte 0x-prefixed hex string)');
  }

  if (!operatorPassword) {
    missingWebKeys.push('OPERATOR_PASSWORD');
  }

  const summary: RuntimeConfigSummary = {
    hasGeminiKey: Boolean(geminiKey),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    hasRpcUrl: Boolean(rpcUrl),
    hasPrivateKey: Boolean(privateKey && privateKey.startsWith('0x') && privateKey.length === 66),
    hasOperatorPassword: Boolean(operatorPassword),
    dbPath: process.env.SENTINAI_DB_PATH || 'sentinai.db',
    nodeEnv: process.env.NODE_ENV || 'development',
  };

  return {
    validForExecution: missingExecutionKeys.length === 0,
    validForWeb: missingWebKeys.length === 0,
    missingExecutionKeys,
    missingWebKeys,
    summary,
  };
}

export function assertExecutionCredentials(): { rpcUrl: string; privateKey: string } {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error(
      `MISSING_CREDENTIALS: Real execution requires configured private key and RPC URL. Missing: ${[
        !rpcUrl && 'RPC_URL',
        !privateKey && 'AGENT_PRIVATE_KEY',
      ]
        .filter(Boolean)
        .join(', ')}`
    );
  }

  return { rpcUrl, privateKey };
}
