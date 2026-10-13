import { IntentIntegrityProof } from './iip';

// Server-side in-memory proposal state store (R5A)
const proposals = new Map<string, IntentIntegrityProof>();

/**
 * Stores an Intent Integrity Proof on the server and returns its canonical proposalId.
 */
export function storeProposal(iip: IntentIntegrityProof): string {
  const proposalId = iip.proofDigest;
  proposals.set(proposalId, iip);
  return proposalId;
}

/**
 * Retrieves a stored server-side proposal by its canonical proposalId.
 */
export function retrieveProposal(proposalId: string): IntentIntegrityProof | undefined {
  return proposals.get(proposalId);
}

/**
 * Deletes a proposal after execution or expiration.
 */
export function deleteProposal(proposalId: string): boolean {
  return proposals.delete(proposalId);
}

/**
 * Test helper to reset stored proposals between test suites.
 */
export function _resetProposalsForTesting(): void {
  proposals.clear();
}
