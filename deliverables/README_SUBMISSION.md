# SentinAI Guardian — Official Competition Submission Package Index

**Competition:** 2026 Shenzhen International FinTech Competition — International Track  
**Category / Topic:** **Topic F — Agent Wallet / Autonomous On-chain Wallet**  
**Project Title:** **SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control**  
**Repository:** `cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet`  

---

## 1. Executive Submission Summary

**SentinAI Guardian** is a working, on-chain verified AI-native autonomous Ethereum Sepolia wallet that separates **probabilistic natural-language intent parsing** (`Gemini 3.8 Flash` $\rightarrow$ `Groq openai/gpt-oss-120b` $\rightarrow$ `Local Fallback`) from **deterministic financial policy enforcement** (`BigInt` SQLite spend limits, calldata decoding, Sepolia RPC simulation, `keccak256` Intent Integrity Proofs, and two-phase human authorization).

### Verified On-Chain & Automated Proof Highlights
- **Confirmed Sepolia Transaction:** [`0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`](https://sepolia.etherscan.io/tx/0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da) (Block `#11935960`, Proposal ID `7540a5f1-dcb4-4797-b46a-13ec74fa96d9`, `status: CONFIRMED`)
- **Automated Test Suite:** `354 / 354` passing tests across `33` Vitest suites
- **Real Browser E2E Verification:** `12 / 12` Headless Chrome CDP user journeys verified with zero page errors (`evidence/browser/`)

---

## 2. Deliverables Directory Structure (`deliverables/`)

| Path | Description |
|---|---|
| [`SentinAI_Guardian_Pitch_Deck.pptx`](./SentinAI_Guardian_Pitch_Deck.pptx) | **12-Slide OpenXML PowerPoint Pitch Deck** covering Problem, Architecture, AI Failover, Policy Firewall, IIP, Live Sepolia Proof, Commercial Value, and Roadmap |
| [`architecture/11_SYSTEM_ARCHITECTURE.md`](./architecture/11_SYSTEM_ARCHITECTURE.md) | Layered system architecture and trust-zone separation |
| [`architecture/12_ALGORITHM_DESIGN.md`](./architecture/12_ALGORITHM_DESIGN.md) | Formal algorithms for AI failover, exact `BigInt` decimal scaling, rolling 24h spend caps, and `keccak256` IIP |
| [`architecture/13_SECURITY_ARCHITECTURE.md`](./architecture/13_SECURITY_ARCHITECTURE.md) | 6-Gate defense-in-depth pipeline and 4 core security invariants |
| [`architecture/14_EXECUTION_STATE_MACHINE.md`](./architecture/14_EXECUTION_STATE_MACHINE.md) | Formal SQLite proposal state machine, CAS lock, and broadcast crash recovery |
| [`architecture/15_DATA_FLOW_AND_SEQUENCE.md`](./architecture/15_DATA_FLOW_AND_SEQUENCE.md) | End-to-end sequence diagrams for two-phase execution and read-only queries |
| [`security/08_SECURITY_SELF_ASSESSMENT.md`](./security/08_SECURITY_SELF_ASSESSMENT.md) | 12-domain security control verification matrix |
| [`security/09_KNOWN_RISKS_AND_LIMITATIONS.md`](./security/09_KNOWN_RISKS_AND_LIMITATIONS.md) | Transparent operational assumptions, known limitations, and production roadmap |
| [`security/10_THREAT_MODEL.md`](./security/10_THREAT_MODEL.md) | Formal STRIDE & autonomous agent threat model (`T-01` through `T-07`) |
| [`execution-evidence/01_IMPLEMENTATION_REALITY_AUDIT.md`](./execution-evidence/01_IMPLEMENTATION_REALITY_AUDIT.md) | Independent code-level reality audit |
| [`execution-evidence/02_REAL_USER_BROWSER_TEST_REPORT.md`](./execution-evidence/02_REAL_USER_BROWSER_TEST_REPORT.md) | 12-step real Chrome browser E2E verification report |
| [`execution-evidence/03_HUMAN_CLICK_BY_CLICK_BN.md`](./execution-evidence/03_HUMAN_CLICK_BY_CLICK_BN.md) | Bengali click-by-click human testing guide |
| [`execution-evidence/04_LIVE_EXECUTION_EVIDENCE.md`](./execution-evidence/04_LIVE_EXECUTION_EVIDENCE.md) | Live Groq & Gemini AI validation + Sepolia execution report |
| [`execution-evidence/05_TRANSACTION_EVIDENCE_REGISTER.md`](./execution-evidence/05_TRANSACTION_EVIDENCE_REGISTER.md) | Complete SQLite & Sepolia transaction audit register |
| [`execution-evidence/confirmed_sepolia_tx_0xfe315950.json`](./execution-evidence/confirmed_sepolia_tx_0xfe315950.json) | Machine-readable on-chain receipt proof for Tx `0xfe315950...88da` |
| [`execution-evidence/phase3_live_ai_and_blockchain_validation.json`](./execution-evidence/phase3_live_ai_and_blockchain_validation.json) | Machine-readable live Groq/Gemini, Sepolia simulation & Gate 6.5 security proof |
| [`demo/18_DEMO_VOICEOVER_SCRIPT.md`](./demo/18_DEMO_VOICEOVER_SCRIPT.md) | Time-coded 3-minute competition demo voiceover script |
| [`demo/19_DEMO_VISUAL_STORYBOARD.md`](./demo/19_DEMO_VISUAL_STORYBOARD.md) | Scene-by-scene visual storyboard for 1080p60 recording |
| [`demo/20_RECORDING_AND_EDITING_GUIDE.md`](./demo/20_RECORDING_AND_EDITING_GUIDE.md) | OBS / Screen Studio recording and editing guide |
| [`technical-documents/00_OFFICIAL_REQUIREMENTS_MATRIX.md`](./technical-documents/00_OFFICIAL_REQUIREMENTS_MATRIX.md) | Official 2026 Shenzhen FinTechathon rules, eligibility & scoring breakdown |
| [`technical-documents/06_UI_UX_MODERNIZATION_REPORT.md`](./technical-documents/06_UI_UX_MODERNIZATION_REPORT.md) | UI/UX Command Center modernization report |
| [`technical-documents/07_DESIGN_SYSTEM.md`](./technical-documents/07_DESIGN_SYSTEM.md) | Institutional Dark Slate design system specification |
| [`technical-documents/16_PITCH_DECK_CONTENT.md`](./technical-documents/16_PITCH_DECK_CONTENT.md) | Slide-by-slide pitch deck markdown source |
| [`technical-documents/17_PRESENTER_NOTES.md`](./technical-documents/17_PRESENTER_NOTES.md) | 5-minute speaker script & tough judge Q&A defense guide |
