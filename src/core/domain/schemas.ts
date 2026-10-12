import { z } from 'zod';
import { isValidEvmAddress } from '../utils/address';

export const IntentActionSchema = z.enum(["TRANSFER", "APPROVE", "SWAP", "UNKNOWN"]);

export const ParsedIntentSchema = z.object({
  action: IntentActionSchema,
  asset: z.string().toUpperCase(),
  amount: z.union([z.string(), z.literal('UNLIMITED')]),
  recipientAlias: z.string(),
});

export const UserPolicySchema = z.object({
  maxTransferAmountETH: z.string(),
  allowUnlimitedApproval: z.boolean(),
  trustedContacts: z.record(
    z.string(), 
    z.string().refine(isValidEvmAddress, { message: "Invalid EVM address" })
  ),
});

export type IntentAction = z.infer<typeof IntentActionSchema>;
export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;
export type UserPolicy = z.infer<typeof UserPolicySchema>;
