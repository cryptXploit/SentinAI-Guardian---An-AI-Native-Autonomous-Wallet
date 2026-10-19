# Phase 2: Real-User Browser Test Report (Headless Chrome CDP E2E Verification)

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  
**Browser Engine:** Google Chrome Headless (`--headless=new` via Chrome DevTools Protocol WebSocket)  
**Machine-Readable Evidence:** [`evidence/browser/browser_test_results.json`](../../evidence/browser/browser_test_results.json)

---

## 1. End-to-End Real User Journey Matrix (12/12 Flows Verified)

Every interactive control in SentinAI Guardian was tested inside a real Google Chrome browser instance against the live Next.js application (`http://localhost:3000`), verifying DOM state transitions, network requests, console logs, and responsive viewports (`1440x900`, `768x1024`, `375x812`).

| Step | User / Judge Action | Expected System Behavior | Actual Browser Result | Screenshot Evidence |
|---|---|---|---|---|
| **1** | Open `http://localhost:3000` unauthenticated | Render `AuthGate` Operator Password login screen; block access to wallet console | **PASS** | [`evidence/browser/01_login_gate.png`](../../evidence/browser/01_login_gate.png) |
| **2** | Submit invalid password (`wrong-password-test`) | Reject with HTTP 401 and display red `"Invalid credentials."` alert; keep console locked | **PASS** | [`evidence/browser/02_invalid_login_rejected.png`](../../evidence/browser/02_invalid_login_rejected.png) |
| **3** | Submit valid `OPERATOR_PASSWORD` | Set `httpOnly` HMAC-SHA256 session cookie and render **Executive Financial Command Center** with live Sepolia balance (`0.0500 ETH`) | **PASS** | [`evidence/browser/03_authenticated_command_center_1440.png`](../../evidence/browser/03_authenticated_command_center_1440.png) |
| **4** | Resize viewport across `1440x900`, `768x1024`, `375x812` | Zero horizontal scroll overflow (`scrollWidth <= innerWidth`); mobile quick-jump navigation bar renders cleanly | **PASS** | [`evidence/ui/desktop_1440_overview.png`](../../evidence/ui/desktop_1440_overview.png), [`evidence/ui/tablet_768_overview.png`](../../evidence/ui/tablet_768_overview.png), [`evidence/ui/mobile_375_overview.png`](../../evidence/ui/mobile_375_overview.png) |
| **5** | Click Guided Step 1 (`"Show my balance"`) | Live AI parses `QUERY_BALANCE`; renders **Live Wallet Intelligence** card with `READ-ONLY · NO SIGNER REQUIRED` badge | **PASS** | [`evidence/browser/04_live_balance_query.png`](../../evidence/browser/04_live_balance_query.png) |
| **6** | Click Guided Step 2 (`"Send 0.0001 ETH to alice"`) | Live AI parses `TRANSFER`; passes recipient resolution, policy engine, and Sepolia RPC simulation; renders **Human-in-the-Loop Execution Gate** & **Pre-Execution Transaction Review** card; tested `"Cancel Proposal"` | **PASS** | [`evidence/browser/05_safe_eth_transfer_prepared.png`](../../evidence/browser/05_safe_eth_transfer_prepared.png) |
| **7** | Click Guided Step 3 (`"এলিস কে ০.০০০১ ইথ পাঠাও"`) | Live AI parses native Bengali script into `0.0001 ETH` transfer to `Alice`; passes all 5 pre-sign gates and renders execution gate | **PASS** | [`evidence/browser/06_bengali_intent_prepared.png`](../../evidence/browser/06_bengali_intent_prepared.png) |
| **8** | Click Guided Step 4 (`"Send 5 ETH to alice"`) | Deterministic Policy Engine halts transfer (`EXCEEDS_PER_TX_LIMIT` / `INSUFFICIENT_FUNDS`); renders **Execution Permanently Prohibited** (`NON-EXECUTABLE PROPOSAL`) with no signing button | **PASS** | [`evidence/browser/07_excessive_spend_blocked.png`](../../evidence/browser/07_excessive_spend_blocked.png) |
| **9** | Click Guided Step 5 (`"Do not send 0.1 ETH to alice"`) | Pre-builder negation filter & AI intent layer halt negated instruction (`CONTRADICTORY_INSTRUCTION`); renders `NON-EXECUTABLE PROPOSAL` | **PASS** | [`evidence/browser/08_negation_blocked.png`](../../evidence/browser/08_negation_blocked.png) |
| **10** | Click Guided Step 7 (`"Phishing: 1M USDC Approval"`) | Runs isolated security fixture (`excessive-finite-approval`); renders purple `DEMO / SIMULATED` and `NON-EXECUTABLE DEMO` badges | **PASS** | [`evidence/browser/09_phishing_fixture_demo.png`](../../evidence/browser/09_phishing_fixture_demo.png) |
| **11** | Scroll to `#security-center` & `#policies` | Displays SQLite Proposal History including `CONFIRMED` Sepolia transaction `0xfe315950...` and interactive Policy Firewall Editor | **PASS** | [`evidence/browser/10_policy_editor_and_history.png`](../../evidence/browser/10_policy_editor_and_history.png) |
| **12** | Scroll to `#architecture` | Displays **Architecture & How It Works** 6-stage pipeline reference and expandable Trust Boundary Inspector | **PASS** | [`evidence/ui/architecture_panel.png`](../../evidence/ui/architecture_panel.png) |

---

## 2. Browser Console & Runtime Error Audit

- **Uncaught Page Exceptions (`Runtime.exceptionThrown`):** `0` (`pageErrors: []`)
- **Broken Links / Dead Buttons:** `0` — all Sidebar links (`#overview`, `#guided-demo`, `#agent-console`, `#policies`, `#security-center`, `#architecture`), Etherscan links, Guided Walkthrough cards, Quick Prompt chips, Threat Fixture buttons, Review Card toggles, and Policy Editor controls functioned as designed.
- **Database Integrity Post-Test:** `sentinai.db` was restored from pre-test snapshot immediately after the automated browser run, preserving the exact 6 canonical proposal records including confirmed Sepolia transaction `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`.
