# 04 — Pitch Deck Presentation Visual & Structural QA Report

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet  
**Competition:** 2026 Shenzhen International FinTech Competition (International Track — Topic F)  
**Deliverable File:** [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx)  
**Generator Script:** [`scripts/generate-pitch-deck-pptx.ts`](../../scripts/generate-pitch-deck-pptx.ts)  
**Narrative Spec:** [`docs/presentation/16_PITCH_DECK_CONTENT.md`](../presentation/16_PITCH_DECK_CONTENT.md)  
**Rendered Visual Contact Sheet:** [`evidence/presentation/slides_overview.png`](../../evidence/presentation/slides_overview.png)  
**Audit Date:** 2026-10-19  

---

## 1. OpenXML `.pptx` Archive & Geometry Verification

We inspected the generated [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx) archive structure and slide XML geometry:

- **Format:** Standard OpenXML ZIP Presentation (`[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`, `ppt/slideMasters/slideMaster1.xml`, `ppt/slideLayouts/slideLayout1.xml`, `ppt/theme/theme1.xml`, and `ppt/slides/slide1.xml` through `ppt/slides/slide12.xml`).
- **Aspect Ratio:** Native 16:9 Widescreen (`cx="12192000" cy="6858000" type="screen16x9"` = `13.33 in x 7.50 in`).
- **Color Palette & Contrast:**
  - Slide Background: `#0B0F17` (Deep Obsidian Slate)
  - Content Card Fill: `#111827` with `#1F2937` border (`roundRect`)
  - Title Typography: `32pt` Bold `Calibri` in `#F9FAFB` (Contrast ratio `17.8:1` — WCAG AAA)
  - Subtitle Typography: `18pt` Bold `Calibri` in `#3B82F6` (Electric Cobalt)
  - Body Bullet Typography: `18pt` Regular `Calibri` in `#E5E7EB` (4 concise bullets per slide, generous `4343400 EMU` vertical card height — zero text overflow or clipping)
  - Footer Bar: `12pt` `Consolas` in `#9CA3AF`

---

## 2. Slide-by-Slide Content & Fact-Check Matrix (12 Slides)

| Slide # | Slide Title | Key Technical / Competition Claims | Alignment with Code & Evidence | Visual QA |
| :---: | :--- | :--- | :---: | :---: |
| **1** | **SentinAI Guardian** | Topic F positioning; EN/BN/Banglish NLP; confirmed Sepolia Tx `0xfe315950...88da` (Block `#11935960` / `0xb620d8`) | Matches RPC receipt & `sentinai.db` | **PASS** |
| **2** | **The Autonomous Wallet Security Paradox** | Probabilistic AI hallucinations, prompt injection, opaque `MAX_UINT256` approvals, zero LLM key access thesis | Matches Topic F problem statement | **PASS** |
| **3** | **Our Solution: SentinAI Guardian** | Multilingual interface, Gemini 3.8 Flash $\rightarrow$ Groq `openai/gpt-oss-120b` $\rightarrow$ Local Fallback, `1.0 ETH` cap, unkeyed Keccak-256 IIP | Matches `provider.ts`, `user-policy.ts`, `iip.ts` | **PASS** |
| **4** | **System Architecture & Trust Boundaries** | Zone 0 (Advisory AI), Zone 1 (Deterministic Enforcement Core), Zone 2 (Isolated Execution Core + Gate 6.5), Fixture Isolation (`is_executable = 0`) | Matches `orchestrator.ts` & `11_SYSTEM_ARCHITECTURE.md` | **PASS** |
| **5** | **Resilient AI Failover & Multilingual Safety** | 10s `AbortController` timeout, `LIVE_AI` vs `DETERMINISTIC_FALLBACK` badges, Bengali negation filter (`পাঠিও না`), adversarial override blocking | Matches `src/core/ai/provider.ts` | **PASS** |
| **6** | **Deterministic Policy Engine & Calldata Analyzer** | `parseTokenAmount` BigInt scaling (`ETH`/`DAI` 18 dec, `USDC`/`USDT` 6 dec), 10-rule ABI calldata decoder (`0xa9059cbb`, `0x095ea7b3`), live on-chain `allowance` check | Matches `financial.ts`, `builder.ts`, `transaction-analyzer.ts` | **PASS** |
| **7** | **Unkeyed Intent Integrity Proof (IIP) & State Machine** | `keccak256(encodePacked(to, value, chainId, action, asset, policyStatus, data))`, Gate 6.5 revalidation, SQLite CAS lock (`AUTHORIZED -> SUBMITTING`), 10-block recovery journal | Matches `iip.ts` & `orchestrator.ts` | **PASS** |
| **8** | **Verified Live Sepolia Blockchain & Test Evidence** | Tx `0xfe315950...88da`, Block `#11935960` (`0xb620d8`), Proposal `7540a5f1-dcb4-4797-b08e-13ec74fa96d9` (`CONFIRMED`), `12,000` warm self-transfer gas vs `21,000` floor, `354/354` Vitest tests (33 suites) | Matches live Sepolia RPC & `vitest` run | **PASS** |
| **9** | **Modern AI FinTech Command Center UX** | 60-Second Guided Judge Walkthrough (`#guided-demo`), 6-stage pipeline stepper, side-by-side semantic comparison, pre-execution review card | Matches live browser UI (`evidence/ui/`) | **PASS** |
| **10** | **Transparent Security Boundaries & Residual Risks** | Server-held testnet EOA key (`AGENT_PRIVATE_KEY`), unkeyed `computeIIPDigest` scope, per-tx cap scope (`1.0 ETH`), single-node SQLite & RPC trust | Matches `09_KNOWN_RISKS_AND_LIMITATIONS.md` | **PASS** |
| **11** | **Commercial Relevance & Competitive Differentiation** | Retail Web3 onboarding, DAO/SME treasury co-pilot, B2B Agent Risk-Firewall SDK | Aligns with Competition Commercial Value (30%) | **PASS** |
| **12** | **Production Roadmap & Closing Proposition** | Milestone R8.5 complete $\rightarrow$ Phase 2 (ERC-4337 Smart Accounts + rolling 24h hooks) $\rightarrow$ Phase 3 (AWS KMS/HSM/TEE + PostgreSQL cluster) | Honest roadmap separating current vs future features | **PASS** |

### Audit Verdict for Phase 6: **PASS**
