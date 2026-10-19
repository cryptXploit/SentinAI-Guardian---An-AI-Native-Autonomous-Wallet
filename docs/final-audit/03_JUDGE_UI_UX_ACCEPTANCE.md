# 03 — Judge UI/UX Acceptance & Real Browser E2E Verification Report

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet  
**Competition:** 2026 Shenzhen International FinTech Competition (International Track — Topic F)  
**Target URL:** `http://localhost:3000`  
**Browser Engine:** Google Chrome Headless via Chrome DevTools Protocol (`CDP`)  
**Evidence Log:** [`evidence/browser/browser_test_results.json`](../../evidence/browser/browser_test_results.json)  
**Audit Date:** 2026-10-19  

---

## 1. Multi-Viewport Responsive Layout Verification

We rendered and inspected the live application across all four required competition viewports (`1440x900` Desktop, `1024x768` Laptop, `768x1024` Tablet, and `375x812` Mobile) and measured `document.documentElement.scrollWidth <= window.innerWidth + 4`:

| Viewport | Resolution | Horizontal Overflow Check | Navigation Pattern | Screenshot Evidence | Status |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **Desktop** | `1440 x 900` | `PASS` (`0px` overflow) | Fixed Left Sidebar (`260px`) + Top Telemetry Bar + Main Workspace | [`evidence/ui/desktop_1440_overview.png`](../../evidence/ui/desktop_1440_overview.png) | **PASS** |
| **Laptop** | `1024 x 768` | `PASS` (`laptopNoOverflow=true`) | Fixed Left Sidebar + 3-Card Telemetry Grid + 4-Card Guided Demo Grid | [`evidence/ui/laptop_1024_overview.png`](../../evidence/ui/laptop_1024_overview.png) | **PASS** |
| **Tablet** | `768 x 1024` | `PASS` (`tabletNoOverflow=true`) | Compact Top Header + Horizontal Section Pill Bar + 3-Card Grid | [`evidence/ui/tablet_768_overview.png`](../../evidence/ui/tablet_768_overview.png) | **PASS** |
| **Mobile** | `375 x 812` | `PASS` (`mobileNoOverflow=true`) | Single-Column Vertical Stack + Scrollable Pill Nav + Wrapped Addresses | [`evidence/ui/mobile_375_overview.png`](../../evidence/ui/mobile_375_overview.png) | **PASS** |

---

## 2. 12-Step Interactive Judge E2E Walkthrough Verification

Every interactive flow was executed in real Google Chrome against `http://localhost:3000` with zero uncaught page exceptions (`pageErrors: []`):

| Step | Interactive Flow Tested | Expected Judge UX Outcome | Actual Browser Result | Screenshot Evidence |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Unauthenticated Login Gate** | Renders password gate before exposing Agent Console | **PASS** | [`01_login_gate.png`](../../evidence/browser/01_login_gate.png) |
| **2** | **Invalid Password Fail-Closed** | Rejects `wrong-password-test` with `Invalid credentials` alert | **PASS** | [`02_invalid_login_rejected.png`](../../evidence/browser/02_invalid_login_rejected.png) |
| **3** | **Valid Operator Authentication** | Issues `HttpOnly` `sentinai_session` cookie and loads live Sepolia balance (`0.0500 ETH`) | **PASS** | [`03_authenticated_command_center_1440.png`](../../evidence/browser/03_authenticated_command_center_1440.png) |
| **4** | **4-Viewport Responsive Check** | Zero horizontal overflow across `1440px`, `1024px`, `768px`, and `375px` | **PASS** | [`laptop_1024_overview.png`](../../evidence/ui/laptop_1024_overview.png) |
| **5** | **Guided Step 1: Live Balance Query** (`"Show my balance"`) | Displays `READ-ONLY · NO SIGNER REQUIRED` badge and live Sepolia ETH/token balances without creating a proposal | **PASS** | [`04_live_balance_query.png`](../../evidence/browser/04_live_balance_query.png) |
| **6** | **Guided Step 2: Safe ETH Transfer** (`"Send 0.0001 ETH to alice"`) | Live AI (`GROQ AI · openai/gpt-oss-120b`) parses intent, passes all 5 pre-sign gates (`0 Mismatches`), and opens Human-in-the-Loop Execution Gate + Cancel tested | **PASS** | [`05_safe_eth_transfer_prepared.png`](../../evidence/browser/05_safe_eth_transfer_prepared.png) |
| **7** | **Guided Step 3: Multilingual Bengali Prompt** (`"এলিস কে ০.০০০১ ইথ পাঠাও"`) | Parses native Bengali script & digits (`০.০০০১`) into canonical `0.0001 ETH` transfer to `alice` and passes all 5 pre-sign gates | **PASS** | [`06_bengali_intent_prepared.png`](../../evidence/browser/06_bengali_intent_prepared.png) |
| **8** | **Guided Step 4: Excessive Spend Policy Block** (`"Send 5 ETH to alice"`) | Halts at Gate 3 (`Evaluate Policy`) due to `1.0 ETH maxTransferAmountETH` cap; renders `Execution Permanently Prohibited` | **PASS** | [`07_excessive_spend_blocked.png`](../../evidence/browser/07_excessive_spend_blocked.png) |
| **9** | **Guided Step 5: Negation Safety Filter** (`"Do not send 0.1 ETH to alice"`) | Blocks contradictory instruction at `INTENT_VALIDATION` (`NON-EXECUTABLE PROPOSAL`) | **PASS** | [`08_negation_blocked.png`](../../evidence/browser/08_negation_blocked.png) |
| **10** | **Guided Step 7: Topic F ERC-20 Phishing Fixture** (`excessive-finite-approval`) | Flags `50 USDC` vs `1000000 USDC` (`AMOUNT MISMATCH`) with `DEMO / SIMULATED` & `NON-EXECUTABLE DEMO` badges; no execute button rendered | **PASS** | [`09_phishing_fixture_demo.png`](../../evidence/browser/09_phishing_fixture_demo.png) |
| **11** | **Security Audit Trail & Confirmed Sepolia Tx** | Displays `CONFIRMED` badge and clickable Etherscan link for `0xfe315950...8388da` (`7540a5f1...`) | **PASS** | [`10_policy_editor_and_history.png`](../../evidence/browser/10_policy_editor_and_history.png) |
| **12** | **Architecture & Trust Boundary Inspector** | Renders 6-stage pipeline diagram and 4 core security invariants | **PASS** | [`architecture_panel.png`](../../evidence/ui/architecture_panel.png) |

---

## 3. UI/UX Clarity & Judge Comprehension Assessment

- **60-Second Judge Comprehension:** Judges immediately see the **60-Second Interactive Judge Evaluation** (`#guided-demo`) with 7 numbered one-click verification cards (`LIVE` vs `DEMO / SIMULATED`).
- **Provenance Transparency:** Every result card explicitly badges AI provenance (`GROQ AI · openai/gpt-oss-120b` / `GEMINI AI` / `DETERMINISTIC_FALLBACK`) and execution provenance (`LIVE_VERIFIED` vs `DEMO / SIMULATED`).
- **UI/UX Discrepancy Fixed During Audit:** Updated Step 4 card description in [`AgentConsole.tsx`](../../src/components/agent/AgentConsole.tsx) from `0.5 ETH` to `1.0 ETH maxTransferAmountETH policy` and updated [`EvidencePanel.tsx`](../../src/components/agent/EvidencePanel.tsx) so UI labels match `DEFAULT_USER_POLICY` (`1.0 ETH`) 100%.

### Audit Verdict for Phase 5: **PASS**
