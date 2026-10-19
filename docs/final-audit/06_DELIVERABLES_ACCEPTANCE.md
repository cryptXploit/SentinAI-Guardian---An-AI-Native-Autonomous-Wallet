# 06 — Competition Deliverables & Eligibility Acceptance Matrix

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet  
**Competition:** 2026 Shenzhen International FinTech Competition  
**Track & Category:** International Track — Topic F (Agent Wallet / Autonomous On-chain Wallet)  
**Audit Date:** 2026-10-19  

---

## 1. Phase 8 — Competition Deliverables Acceptance Matrix

Each deliverable required for the 2026 Shenzhen International FinTech Competition (per [`docs/competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md`](../competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md)) was audited directly in the repository workspace (`deliverables/`, `docs/`, `evidence/`, and `src/`):

| # | Competition Deliverable | Official Requirement Status | Repository Location(s) | Format | Status | Forensic Notes |
| :---: | :--- | :---: | :--- | :--- | :---: | :--- |
| **1** | **Functional Autonomous Wallet Prototype (Source Code)** | **Mandatory** | [`src/`](../../src), [`package.json`](../../package.json), [`tsconfig.json`](../../tsconfig.json) | TypeScript / Next.js 16 / Viem / SQLite | **COMPLETE** | Full 2-phase execution pipeline, 10-rule calldata analyzer, multi-model AI intent parser, and live Sepolia integration. |
| **2** | **Root Entry-Point Documentation & Reproducibility Guide** | **Mandatory** | [`README.md`](../../README.md), [`deliverables/README_SUBMISSION.md`](../../deliverables/README_SUBMISSION.md) | Markdown | **COMPLETE** | Contains all 11 sections, architecture diagrams, setup commands, and verified Sepolia proof. |
| **3** | **System Architecture, Algorithm & State Machine Docs** | **Mandatory** | [`docs/architecture/11_SYSTEM_ARCHITECTURE.md`](../architecture/11_SYSTEM_ARCHITECTURE.md)–[`15_DATA_FLOW_AND_SEQUENCE.md`](../architecture/15_DATA_FLOW_AND_SEQUENCE.md) & `deliverables/architecture/` | Markdown + Mermaid | **COMPLETE** | 5 dedicated architecture specifications synced between `docs/architecture/` and `deliverables/architecture/`. |
| **4** | **Security Self-Assessment, Known Risks & Threat Model** | **Mandatory** | [`docs/security/08_SECURITY_SELF_ASSESSMENT.md`](../security/08_SECURITY_SELF_ASSESSMENT.md)–[`10_THREAT_MODEL.md`](../security/10_THREAT_MODEL.md) & `deliverables/security/` | Markdown | **COMPLETE** | Includes STRIDE threat model and explicit residual risk & limitation disclosure. |
| **5** | **On-Chain Sepolia Execution Proof & SQLite Evidence** | **Bonus (0–5 pts)** | [`evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`](../../evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json), [`docs/verification/04_LIVE_EXECUTION_EVIDENCE.md`](../verification/04_LIVE_EXECUTION_EVIDENCE.md), [`05_TRANSACTION_EVIDENCE_REGISTER.md`](../verification/05_TRANSACTION_EVIDENCE_REGISTER.md) | JSON + Markdown | **COMPLETE** | Independently verified via live Sepolia JSON-RPC (`0xfe315950...88da`, Block `#11935960` / `0xb620d8`, `status: 0x1`). |
| **6** | **Presentation Pitch Deck (`.pptx` + Narrative Spec)** | **Mandatory** | [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx), [`docs/presentation/16_PITCH_DECK_CONTENT.md`](../presentation/16_PITCH_DECK_CONTENT.md), [`17_PRESENTER_NOTES.md`](../presentation/17_PRESENTER_NOTES.md) | Native OpenXML `.pptx` (16:9, 12 slides) | **COMPLETE** | 12 slides covering Problem, Solution, Architecture, AI Failover, Policy/Calldata, IIP, Live Sepolia Proof, UX, Known Risks (Slide 10), Commercial Value, and Roadmap. |
| **7** | **Demo Video Script, Visual Storyboard & Recording Guide** | **Supporting** | [`docs/video/18_DEMO_VOICEOVER_SCRIPT.md`](../video/18_DEMO_VOICEOVER_SCRIPT.md), [`19_DEMO_VISUAL_STORYBOARD.md`](../video/19_DEMO_VISUAL_STORYBOARD.md), [`20_RECORDING_AND_EDITING_GUIDE.md`](../video/20_RECORDING_AND_EDITING_GUIDE.md), `deliverables/demo/` | Markdown | **COMPLETE** | Complete time-coded 3-minute voiceover script, scene storyboard, and OBS recording guide. |
| **8** | **Multi-Viewport UI & Presentation Screenshot Evidence** | **Supporting** | `evidence/ui/*.png`, `evidence/browser/*.png`, `evidence/presentation/slides_overview.png` | PNG Images | **COMPLETE** | Captured from real headless Chrome rendering across `1440px`, `1024px`, `768px`, and `375px`. |
| **9** | **Recorded Demo Video Binary (`.mp4` / `.mov`)** | **Mandatory (per FinTechathon Rule Bundle)** | *(Not present in repository)* | `.mp4` Video | **MISSING** | Official FinTechathon rules require submitting a prototype demonstration video alongside the PPT and technical documents. A narration script is **not** an actual `.mp4`. The project owner must record the 2–3 minute `.mp4` screen capture before emailing the final submission. |

---

## 2. Phase 9 — Competition Eligibility & Administrative Verification

Per the official rules of the **2026 Shenzhen International FinTech Competition (International Track)** documented in [`docs/competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md`](../competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md):

| Eligibility / Administrative Requirement | Verification Status | Required Owner Action |
| :--- | :---: | :--- |
| **Topic F Alignment (Agent Wallet / Autonomous On-chain Wallet)** | **VERIFIED** | Directly addressed by SentinAI Guardian's natural-language intent parsing, deterministic policy firewall, 10-rule calldata analyzer, IIP digest, and Sepolia execution. |
| **100% English Competition Materials** | **VERIFIED** | All code documentation, architecture specs, security reports, and the 12-slide `.pptx` pitch deck are authored in English. |
| **Student Team Composition (2–5 Enrolled University Students)** | **UNVERIFIED** | Cannot be verified from Git repository metadata alone. Solo (1-person) entries are administratively ineligible. The owner must confirm 2–5 enrolled university students. |
| **Nationality Ratio ($\ge 60\%$ Non-Chinese Nationals)** | **UNVERIFIED** | Cannot be verified from repository metadata. The owner must confirm that at least 60% of registered team members are non-Chinese nationals. |
| **Official Registration & Identity Documents (Never Commit to GitHub)** | **UNVERIFIED** | Official registration form, student enrollment proof, and passport bio pages must be emailed directly to `wangyr@pbcsf.tsinghua.edu.cn` before **October 20, 2026 at 23:59 UTC+8**. **Never commit passports or personal identity documents to GitHub.** |

---

## 3. Deliverables & Eligibility Verdict

- **Software, Architecture, Security, On-Chain Evidence & `.pptx` Pitch Deck (Items 1–8):** `COMPLETE`
- **Recorded `.mp4` Demonstration Video Binary (Item 9):** `MISSING` (Mandatory per official FinTechathon Rule Bundle; requires human screen recording using [`docs/video/18_DEMO_VOICEOVER_SCRIPT.md`](../video/18_DEMO_VOICEOVER_SCRIPT.md) and [`19_DEMO_VISUAL_STORYBOARD.md`](../video/19_DEMO_VISUAL_STORYBOARD.md))
- **Overall Deliverables Verdict:** `INCOMPLETE` (strictly due to the unrecorded mandatory `.mp4` video binary)
- **Competition Eligibility Verdict:** `UNVERIFIED` (requires human confirmation of 2–5 enrolled university students with $\ge 60\%$ non-Chinese nationals)
