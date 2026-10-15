import { randomUUID } from 'crypto';
import { UserPolicy, UserPolicySchema } from '../domain/schemas';
import { isValidEvmAddress } from '../utils/address';
import { getDb, ensurePolicyTables } from '../security/proposal';

/**
 * Addresses that are permanently forbidden from being configured as executable transfer recipients (CSF-02 Fix):
 * - Zero address (0x0000...0000)
 * - Burn address (0x0000...dEaD)
 * - Previously hardcoded third-party Vitalik address (0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
 */
export const FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES: ReadonlySet<string> = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
]);

export function isForbiddenRecipientAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return true;
  return FORBIDDEN_UNSAFE_RECIPIENT_ADDRESSES.has(address.trim().toLowerCase());
}

export const DEFAULT_TOKEN_APPROVAL_POLICIES: NonNullable<UserPolicy['tokenApprovalPolicies']> = {
  // Sepolia USDC (6 decimals, 100 USDC allowance ceiling)
  "11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": {
    chainId: 11155111,
    tokenContractAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    maxApprovalAmountBaseUnits: "100000000", // 100 USDC
    allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
    allowUnlimited: false,
  },
  // Sepolia DAI (18 decimals, 100 DAI allowance ceiling — verified deployed contract)
  "11155111:0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": {
    chainId: 11155111,
    tokenContractAddress: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
    tokenSymbol: "DAI",
    tokenDecimals: 18,
    maxApprovalAmountBaseUnits: "100000000000000000000", // 100 DAI
    allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
    allowUnlimited: false,
  },
  // Sepolia USDT (6 decimals, 100 USDT allowance ceiling — verified deployed contract)
  "11155111:0x7169d38820dfd117c3fa1f22a697dba58d90ba06": {
    chainId: 11155111,
    tokenContractAddress: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
    tokenSymbol: "USDT",
    tokenDecimals: 6,
    maxApprovalAmountBaseUnits: "100000000", // 100 USDT
    allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
    allowUnlimited: false,
  },
};

/**
 * Default Executable Policy (CSF-02 Fix):
 * - Contains NO hardcoded third-party transfer recipients (such as Vitalik's 0xd8dA...6045 or Bob's 0x1111...).
 * - Transfer recipients ('alice', etc.) MUST be explicitly configured by the operator via
 *   APPROVED_TEST_RECIPIENT_ADDRESS or the authenticated Policy Management store.
 * - Unconfigured contacts fail closed.
 */
export const DEFAULT_EXECUTABLE_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "uniswap": "0x1111111254fb6c44bac0bed2854e76f90643097d",
  },
  tokenApprovalPolicies: { ...DEFAULT_TOKEN_APPROVAL_POLICIES },
};

/**
 * Non-Executable Demonstration / Fixture Policy:
 * Used strictly for offline SECURITY_FIXTURE simulations and isolated unit test fixtures.
 * Never used to authorize or sign live transactions.
 */
export const MOCK_USER_POLICY: UserPolicy = {
  maxTransferAmountETH: "1.0",
  allowUnlimitedApproval: false,
  trustedContacts: {
    "alice": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "bob": "0x1111111254fb6c44bac0bed2854e76f90643097d",
    "uniswap": "0x1111111254fb6c44bac0bed2854e76f90643097d",
  },
  tokenApprovalPolicies: {
    ...DEFAULT_TOKEN_APPROVAL_POLICIES,
    "11155111:0x7169d3882044463f11a3e45775678b78d3845610": {
      chainId: 11155111,
      tokenContractAddress: "0x7169D3882044463f11A3E45775678B78d3845610",
      tokenSymbol: "USDT",
      tokenDecimals: 6,
      maxApprovalAmountBaseUnits: "100000000",
      allowedSpenders: ["0x1111111254fb6c44bac0bed2854e76f90643097d"],
      allowUnlimited: false,
    },
  },
};

export type PolicyAuditEntry = {
  id: string;
  ownerId: string;
  action: string;
  previousPolicy: UserPolicy;
  newPolicy: UserPolicy;
  createdAt: string;
};

/**
 * Checks whether an operator has a persisted SQLite policy row in `user_policies`.
 */
export function hasPersistedUserPolicy(ownerId: string = 'operator-1'): boolean {
  try {
    const db = getDb();
    ensurePolicyTables(db);
    const row = db
      .prepare('SELECT 1 FROM user_policies WHERE owner_id = ? LIMIT 1')
      .get(ownerId);
    return Boolean(row);
  } catch {
    return false;
  }
}

/**
 * Returns the active executable UserPolicy for the given operator.
 *
 * Resolution Order (CSF-02 Fix):
 * 1. Authenticated persistent SQLite record in `user_policies` for `ownerId`.
 * 2. `DEFAULT_EXECUTABLE_USER_POLICY` merged with explicit `APPROVED_TEST_RECIPIENT_ADDRESS`
 *    environment variable (if valid EVM address and not a forbidden third-party/burn placeholder).
 * 3. Never populates third-party addresses automatically. Unconfigured aliases fail closed.
 */
export function getActiveUserPolicy(ownerId: string = 'operator-1'): UserPolicy {
  try {
    const db = getDb();
    ensurePolicyTables(db);
    const row = db
      .prepare('SELECT policy_json FROM user_policies WHERE owner_id = ?')
      .get(ownerId) as { policy_json: string } | undefined;

    if (row?.policy_json) {
      const parsed = UserPolicySchema.safeParse(JSON.parse(row.policy_json));
      if (parsed.success) {
        // Filter out any forbidden third-party placeholder addresses as defense-in-depth
        const safeContacts: Record<string, string> = {};
        for (const [alias, addr] of Object.entries(parsed.data.trustedContacts)) {
          if (!isForbiddenRecipientAddress(addr)) {
            safeContacts[alias] = addr;
          }
        }
        return {
          ...parsed.data,
          trustedContacts: safeContacts,
          tokenApprovalPolicies: {
            ...DEFAULT_TOKEN_APPROVAL_POLICIES,
            ...(parsed.data.tokenApprovalPolicies || {}),
          },
        };
      }
    }
  } catch {
    // Fall back to default executable policy if DB read fails
  }

  const contacts: Record<string, string> = {
    ...DEFAULT_EXECUTABLE_USER_POLICY.trustedContacts,
  };

  const approvedTestRecipient = process.env.APPROVED_TEST_RECIPIENT_ADDRESS?.trim();
  if (
    approvedTestRecipient &&
    isValidEvmAddress(approvedTestRecipient) &&
    !isForbiddenRecipientAddress(approvedTestRecipient)
  ) {
    contacts['alice'] = approvedTestRecipient;
  }

  return {
    maxTransferAmountETH: DEFAULT_EXECUTABLE_USER_POLICY.maxTransferAmountETH,
    allowUnlimitedApproval: DEFAULT_EXECUTABLE_USER_POLICY.allowUnlimitedApproval,
    trustedContacts: contacts,
    tokenApprovalPolicies: { ...DEFAULT_TOKEN_APPROVAL_POLICIES },
  };
}

/**
 * Validates, persists, and audit-logs an update to the operator's active UserPolicy.
 */
export function updateActiveUserPolicy(params: {
  ownerId: string;
  action: string;
  maxTransferAmountETH?: string;
  allowUnlimitedApproval?: boolean;
  trustedContacts?: Record<string, string>;
}): UserPolicy {
  const { ownerId, action, maxTransferAmountETH, allowUnlimitedApproval, trustedContacts } = params;

  if (!ownerId || typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('INVALID_POLICY_OWNER: Authenticated operator ownerId is required.');
  }

  const previousPolicy = getActiveUserPolicy(ownerId);

  const nextMaxEth =
    maxTransferAmountETH !== undefined ? maxTransferAmountETH.trim() : previousPolicy.maxTransferAmountETH;

  if (!/^\d+(\.\d+)?$/.test(nextMaxEth)) {
    throw new Error('INVALID_POLICY_LIMIT: maxTransferAmountETH must be a valid positive decimal string.');
  }
  const numericLimit = Number(nextMaxEth);
  if (!Number.isFinite(numericLimit) || numericLimit <= 0 || numericLimit > 100) {
    throw new Error('INVALID_POLICY_LIMIT: maxTransferAmountETH must be strictly greater than 0 and at most 100 ETH.');
  }

  const nextContacts: Record<string, string> = {};
  const rawContacts = trustedContacts !== undefined ? trustedContacts : previousPolicy.trustedContacts;

  for (const [rawAlias, rawAddr] of Object.entries(rawContacts)) {
    const alias = rawAlias.trim().toLowerCase();
    const addr = rawAddr.trim();

    if (!/^[a-z0-9_.-]{1,32}$/.test(alias)) {
      throw new Error(
        `INVALID_CONTACT_ALIAS: Contact alias '${rawAlias}' must be 1-32 characters (letters, numbers, _, ., -).`
      );
    }

    if (!isValidEvmAddress(addr)) {
      throw new Error(`INVALID_CONTACT_ADDRESS: Contact '${alias}' has an invalid EVM address (${addr}).`);
    }

    if (isForbiddenRecipientAddress(addr)) {
      throw new Error(
        `UNSAFE_RECIPIENT_ADDRESS: Address ${addr} is a forbidden third-party placeholder or burn address and cannot be configured for executable transfers.`
      );
    }

    nextContacts[alias] = addr;
  }

  const nextPolicy: UserPolicy = UserPolicySchema.parse({
    maxTransferAmountETH: nextMaxEth,
    allowUnlimitedApproval:
      allowUnlimitedApproval !== undefined ? Boolean(allowUnlimitedApproval) : previousPolicy.allowUnlimitedApproval,
    trustedContacts: nextContacts,
    tokenApprovalPolicies: previousPolicy.tokenApprovalPolicies || { ...DEFAULT_TOKEN_APPROVAL_POLICIES },
  });

  const db = getDb();
  ensurePolicyTables(db);
  const now = new Date().toISOString();
  const auditId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO user_policies (owner_id, policy_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at`
    ).run(ownerId, JSON.stringify(nextPolicy), now);

    db.prepare(
      `INSERT INTO policy_audit_log (id, owner_id, action, previous_policy_json, new_policy_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(auditId, ownerId, action, JSON.stringify(previousPolicy), JSON.stringify(nextPolicy), now);
  });

  tx();

  return nextPolicy;
}

/**
 * Retrieves recent policy audit log entries for the given operator.
 */
export function getPolicyAuditLogs(ownerId: string = 'operator-1', limit: number = 20): PolicyAuditEntry[] {
  try {
    const db = getDb();
    ensurePolicyTables(db);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = db
      .prepare(
        `SELECT id, owner_id, action, previous_policy_json, new_policy_json, created_at
         FROM policy_audit_log
         WHERE owner_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(ownerId, safeLimit) as Array<{
      id: string;
      owner_id: string;
      action: string;
      previous_policy_json: string;
      new_policy_json: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      action: r.action,
      previousPolicy: JSON.parse(r.previous_policy_json) as UserPolicy,
      newPolicy: JSON.parse(r.new_policy_json) as UserPolicy,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export type RecipientResolutionResult =
  | { status: 'RESOLVED'; address: string; matchedAlias: string }
  | { status: 'AMBIGUOUS'; reason: string; candidates: string[] }
  | { status: 'UNKNOWN'; reason: string };

/**
 * Resolves a recipient alias or direct whitelisted 0x address against the user's trustedContacts policy.
 * - Fails closed on ambiguous aliases when multiple contacts share the same base name (e.g. alice_personal vs alice_work).
 * - Resolves case-insensitively when a unique contact alias matches.
 * - Resolves direct 0x Ethereum addresses ONLY if they exist in the trustedContacts whitelist.
 * - Fails closed when a contact (such as 'alice') has not been explicitly configured with a user-approved address.
 */
export function resolveRecipientFromPolicy(
  recipientAlias: string,
  policy: UserPolicy = getActiveUserPolicy()
): RecipientResolutionResult {
  const raw = (recipientAlias || '').trim();
  if (!raw) {
    return { status: 'UNKNOWN', reason: `Unknown recipient alias: ${recipientAlias}` };
  }

  const lower = raw.toLowerCase();
  const entries = Object.entries(policy.trustedContacts || {});

  // 1. Check if multiple sub-contacts share this base prefix (e.g., "alice_personal" & "alice_work" when user says "alice")
  const subContactMatches = entries
    .map(([key]) => key)
    .filter((key) => {
      const k = key.toLowerCase();
      return k.startsWith(`${lower}_`) || k.startsWith(`${lower}-`) || k.startsWith(`${lower}.`);
    });

  // Check exact case-insensitive match
  const exactMatch = entries.find(([key]) => key.toLowerCase() === lower);

  if (subContactMatches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidates: subContactMatches,
      reason: `Ambiguous recipient alias '${raw}': Multiple contacts match (${subContactMatches.join(', ')}). Specify the exact contact alias or whitelisted 0x address.`,
    };
  }

  if (exactMatch) {
    return {
      status: 'RESOLVED',
      address: exactMatch[1],
      matchedAlias: exactMatch[0],
    };
  }

  // 2. Check if user specified a direct 42-char Ethereum address (0x...) that is in the trusted whitelist
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    const addressMatch = entries.find(([, addr]) => addr.toLowerCase() === lower);
    if (addressMatch) {
      return {
        status: 'RESOLVED',
        address: addressMatch[1],
        matchedAlias: addressMatch[0],
      };
    }
  }

  return {
    status: 'UNKNOWN',
    reason: `Unknown recipient alias: ${recipientAlias}. Contact is not configured in trustedContacts policy (unconfigured contacts fail closed).`,
  };
}
