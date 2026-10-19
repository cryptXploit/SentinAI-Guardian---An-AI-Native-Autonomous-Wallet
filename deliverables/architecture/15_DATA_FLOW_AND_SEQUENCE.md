# Data Flow & Sequence Diagrams — SentinAI Guardian

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

---

## 1. End-to-End Two-Phase Transaction Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Human Operator / Judge
    participant UI as Next.js Client UI (AgentConsole / EvidencePanel)
    participant Orch as Server Orchestrator (orchestrator.ts)
    participant AI as AI Failover Chain (Gemini -> Groq -> Local)
    participant DB as SQLite WAL DB (sentinai.db)
    participant RPC as Sepolia Testnet RPC (Chain 11155111)

    Note over Operator,RPC: PHASE 1: INTENT PREPARATION, POLICY EVALUATION & SIMULATION
    Operator->>UI: Submits "Send 0.0001 ETH to alice" (or Bengali/Banglish equivalent)
    UI->>Orch: prepareTransactionIntent(command)
    Orch->>Orch: verifySession() & Pre-Builder Negation Check
    Orch->>AI: parseIntent(command) -> parseIntentWithProvenance(command)
    AI-->>Orch: { intent: TRANSFER 0.0001 ETH -> alice, provider: groq/gemini }
    Orch->>Orch: validateStateChangingIntent() & parseTokenAmount() BigInt Check
    Orch->>DB: getActiveUserPolicy(ownerId) & resolveRecipientFromPolicy("alice")
    DB-->>Orch: Policy + Checksummed Recipient Address (0xaeb8...2148)
    Orch->>Orch: buildTransaction() -> { chainId: 11155111, to, value: 100000000000000n, data: "0x" }
    Orch->>DB: evaluatePolicy() (Checks maxTransferAmountETH, Trusted Contacts, Approval Ceilings)
    Orch->>RPC: simulateTransaction(candidate, sender)
    RPC-->>Orch: Gas Estimate OK (12000 intrinsic / 21000 broadcast floor)
    Orch->>Orch: analyzeTransaction() & generateIIP() -> Unkeyed Keccak-256 Digest
    Orch->>DB: storeProposal(status='PREPARED', provenance='LIVE_VERIFIED', digest)
    Orch-->>UI: PrepareResult (Summary, Analysis, IIP Digest, AI Provenance)
    UI-->>Operator: Renders Pre-Execution Transaction Review & "Confirm & Execute" Gate

    Note over Operator,RPC: PHASE 2: HUMAN AUTHORIZATION, GATE 6.5 REVALIDATION & ON-CHAIN BROADCAST
    Operator->>UI: Clicks "Confirm & Execute Transaction"
    UI->>Orch: authorizeAndExecute(proposalId)
    Orch->>Orch: verifySession() & Check Proposal Ownership / Expiration
    Orch->>DB: Re-fetch Active Policy & Re-run evaluatePolicy() + analyzeTransaction() (Gate 6.5)
    Orch->>Orch: verifyIIPDigest(proposal.iipData)
    Orch->>DB: authorizeProposal() -> status='AUTHORIZED'
    Orch->>DB: lockProposalForExecution() (Atomic CAS -> status='SUBMITTING')
    Orch->>Orch: writeBroadcastRecoveryJournal(proposalId, candidate)
    Orch->>RPC: broadcastTransaction() (Viem Signer + 21000 Gas Floor)
    RPC-->>Orch: txHash (0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da)
    Orch->>DB: markSubmitted(proposalId, txHash) -> status='SUBMITTED'
    Orch->>RPC: waitForReceipt(txHash)
    RPC-->>Orch: Receipt Confirmed (Block #11935960, status: 'success')
    Orch->>DB: updateProposalStatus('CONFIRMED') & clearBroadcastRecoveryJournal()
    Orch-->>UI: AuthorizeResult (Confirmed Tx Hash & Receipt Status)
    UI-->>Operator: Displays Green CONFIRMED Banner + Sepolia Etherscan Receipt Link
```

---

## 2. Read-Only Intelligence Query Sequence (`QUERY_BALANCE` / `QUERY_NETWORK`)

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Human Operator / Judge
    participant UI as Next.js Client UI
    participant Orch as Server Orchestrator
    participant AI as AI Failover Chain
    participant RPC as Sepolia Testnet RPC

    Operator->>UI: Clicks Step 1 ("Show my balance")
    UI->>Orch: prepareTransactionIntent("Show my balance")
    Orch->>AI: parseIntent("Show my balance")
    AI-->>Orch: { action: "QUERY_BALANCE", providerName: "groq" }
    Orch->>RPC: getLiveWalletOverview() (eth_getBalance, ERC-20 balanceOf for USDC/USDT/DAI, eth_blockNumber)
    RPC-->>Orch: Native ETH (0.049999999998368 ETH), USDC (0.00), USDT (0.00), DAI (0.0000), Block #11946788
    Orch-->>UI: PrepareResult { isQuery: true, queryResult, aiProvenance: 'LIVE_AI' }
    UI-->>Operator: Renders Live Wallet Intelligence Card (READ-ONLY · NO SIGNER REQUIRED)
```
