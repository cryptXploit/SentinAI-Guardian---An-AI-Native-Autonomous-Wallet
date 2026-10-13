import { z } from 'zod';
import { isValidEvmAddress } from '../utils/address';

export const IntentActionSchema = z.enum([
  'TRANSFER',
  'APPROVE',
  'SWAP',
  'QUERY_BALANCE',
  'QUERY_NETWORK',
  'UNKNOWN',
]);

export const ParsedIntentSchema = z.object({
  action: IntentActionSchema,
  asset: z.string().toUpperCase(),
  amount: z.union([z.string(), z.literal('UNLIMITED')]),
  recipientAlias: z.string(),
});

export const ProposalProvenanceSchema = z.enum([
  'LIVE_VERIFIED',
  'MOCK_SIMULATION',
  'SECURITY_FIXTURE',
  'UNVERIFIED',
]);

export const TokenApprovalPolicySchema = z.object({
  chainId: z.number().int().positive(),
  tokenContractAddress: z.string().refine(isValidEvmAddress, { message: 'Invalid token contract address' }),
  tokenSymbol: z.string().optional(),
  tokenDecimals: z.number().int().min(0).max(18).default(18),
  maxApprovalAmountBaseUnits: z.string(), // BigInt serialized as string
  allowedSpenders: z.array(z.string().refine(isValidEvmAddress, { message: 'Invalid spender address' })),
  allowUnlimited: z.boolean().default(false),
});

export const UserPolicySchema = z.object({
  maxTransferAmountETH: z.string(),
  allowUnlimitedApproval: z.boolean(),
  trustedContacts: z.record(
    z.string(),
    z.string().refine(isValidEvmAddress, { message: 'Invalid EVM address' })
  ),
  tokenApprovalPolicies: z.record(z.string(), TokenApprovalPolicySchema).optional(),
});

export type IntentAction = z.infer<typeof IntentActionSchema>;
export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;
export type ProposalProvenance = z.infer<typeof ProposalProvenanceSchema>;
export type TokenApprovalPolicy = z.infer<typeof TokenApprovalPolicySchema>;
export type UserPolicy = z.infer<typeof UserPolicySchema>;

export function isReadOnlyAction(action: IntentAction): boolean {
  return action === 'QUERY_BALANCE' || action === 'QUERY_NETWORK';
}

export function formatTokenPolicyKey(chainId: number, tokenContractAddress: string): string {
  return `${chainId}:${tokenContractAddress.toLowerCase()}`;
}

export function findTokenApprovalPolicy(
  policy: UserPolicy,
  chainId: number,
  tokenContractAddress: string
): TokenApprovalPolicy | undefined {
  if (!policy.tokenApprovalPolicies) return undefined;
  const key = formatTokenPolicyKey(chainId, tokenContractAddress);
  return policy.tokenApprovalPolicies[key];
}

export type { IntentIntegrityProof } from '../security/iip';
