export interface ExternalRiskResult {
  providerName: string;
  contractAddress: string;
  chainId: number;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'MOCK_FIXTURE';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  isHoneypot?: boolean;
  isVerifiedContract?: boolean;
  hasBlacklistMethod?: boolean;
  reputationScore?: number;
  riskSignals: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  limitations: string;
  error?: string;
}

export interface SecurityIntelligenceProvider {
  readonly name: string;
  checkContractRisk(contractAddress: string, chainId: number): Promise<ExternalRiskResult>;
}

/**
 * Fixture-based intelligence provider for deterministic local testing and competition demonstrations.
 */
export class FixtureSecurityIntelligenceProvider implements SecurityIntelligenceProvider {
  readonly name = 'fixture-intelligence';

  constructor(
    private readonly customFindings?: Partial<ExternalRiskResult>
  ) {}

  async checkContractRisk(contractAddress: string, chainId: number): Promise<ExternalRiskResult> {
    if (this.customFindings) {
      return {
        providerName: this.name,
        contractAddress,
        chainId,
        status: 'MOCK_FIXTURE',
        riskLevel: this.customFindings.riskLevel ?? 'LOW',
        isHoneypot: this.customFindings.isHoneypot ?? false,
        isVerifiedContract: this.customFindings.isVerifiedContract ?? true,
        hasBlacklistMethod: this.customFindings.hasBlacklistMethod ?? false,
        riskSignals: this.customFindings.riskSignals ?? [],
        confidence: this.customFindings.confidence ?? 'HIGH',
        limitations: 'Simulated security intelligence from controlled test fixture.',
        ...this.customFindings,
      };
    }

    // Default fixture for known Sepolia test tokens
    return {
      providerName: this.name,
      contractAddress,
      chainId,
      status: 'MOCK_FIXTURE',
      riskLevel: 'LOW',
      isHoneypot: false,
      isVerifiedContract: true,
      hasBlacklistMethod: false,
      reputationScore: 95,
      riskSignals: ['Verified open-source standard token contract on Sepolia.'],
      confidence: 'HIGH',
      limitations: 'Fixture-backed baseline for testnet demonstration.',
    };
  }
}

/**
 * External provider implementation (GoPlus / Public API) with graceful fallback and no false safety claims.
 */
export class GoPlusSecurityIntelligenceProvider implements SecurityIntelligenceProvider {
  readonly name = 'goplus-security';

  async checkContractRisk(contractAddress: string, chainId: number): Promise<ExternalRiskResult> {
    // GoPlus primarily indexes mainnet and major L2s. Sepolia testnet contracts are generally unindexed.
    if (chainId === 11155111) {
      return {
        providerName: this.name,
        contractAddress,
        chainId,
        status: 'UNAVAILABLE',
        riskLevel: 'UNKNOWN',
        riskSignals: [],
        confidence: 'NONE',
        limitations: 'GoPlus token security API does not index Ethereum Sepolia Testnet contracts.',
        error: 'TESTNET_NOT_INDEXED: Sepolia contracts are not covered by external mainnet risk databases.',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4_000);

      const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${contractAddress.toLowerCase()}`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const json = await response.json();
      const contractData = json?.result?.[contractAddress.toLowerCase()];

      if (!contractData) {
        return {
          providerName: this.name,
          contractAddress,
          chainId,
          status: 'UNAVAILABLE',
          riskLevel: 'UNKNOWN',
          riskSignals: [],
          confidence: 'LOW',
          limitations: 'Contract address not found in external security registry.',
        };
      }

      const isHoneypot = contractData.is_honeypot === '1';
      const hasBlacklist = contractData.is_blacklisted === '1';
      const riskSignals: string[] = [];

      if (isHoneypot) riskSignals.push('Honeypot behavior detected in token contract.');
      if (hasBlacklist) riskSignals.push('Token contract contains address blacklisting function.');

      return {
        providerName: this.name,
        contractAddress,
        chainId,
        status: 'AVAILABLE',
        riskLevel: isHoneypot ? 'CRITICAL' : hasBlacklist ? 'MEDIUM' : 'LOW',
        isHoneypot,
        hasBlacklistMethod: hasBlacklist,
        riskSignals,
        confidence: 'MEDIUM',
        limitations: 'External heuristics supplement deterministic policy; not a guarantee of safety.',
      };
    } catch (err: unknown) {
      return {
        providerName: this.name,
        contractAddress,
        chainId,
        status: 'UNAVAILABLE',
        riskLevel: 'UNKNOWN',
        riskSignals: [],
        confidence: 'NONE',
        limitations: 'External security provider could not be reached.',
        error: err instanceof Error ? err.message : 'REQUEST_FAILED',
      };
    }
  }
}

/**
 * Factory for resolving security intelligence provider.
 */
export function getSecurityIntelligenceProvider(): SecurityIntelligenceProvider {
  if (process.env.SECURITY_INTEL_PROVIDER === 'goplus') {
    return new GoPlusSecurityIntelligenceProvider();
  }
  return new FixtureSecurityIntelligenceProvider();
}
