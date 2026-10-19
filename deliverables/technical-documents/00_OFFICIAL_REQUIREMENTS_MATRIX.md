# Official Competition Requirements & Compliance Matrix

**Competition:** 2026 Shenzhen International FinTech Competition (FinTechathon) — International Track  
**Theme:** *"AI as a Financial Participant"*  
**Track / Category:** Topic F — Agent Wallet (Autonomous On-chain Wallet)  
**Organizers:** Tsinghua University PBC School of Finance (PBCSF) & WeBank  
**Audit Date:** October 19, 2026 (UTC+6) / October 19, 2026 (UTC+8 Beijing Time)

---

> [!CAUTION]
> **CRITICAL ELIGIBILITY FLAG — TEAM SIZE & STUDENT REGISTRATION REQUIREMENT (2–5 MEMBERS)**
>
> Official International Track rules require:
> 1. **Team Size:** **2 to 5 full-time university students** (undergraduate, master's, or PhD) enrolled at accredited universities/research institutions outside Mainland China, Hong Kong SAR, Macao SAR, and Chinese Taipei.
> 2. **Nationality Ratio:** At least **60% of team members must be non-Chinese nationals**.
> 3. **Registration Artifacts:** Official registration form + passport bio pages for all 2–5 team members must be submitted to the International Track coordinator (`wangyr@pbcsf.tsinghua.edu.cn`).
>
> **Current Repository Status:** The repository (`cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet`) is maintained under a single GitHub account (`cryptXploit`) and does not contain team roster metadata or student registration documents. **If the human owner is competing solo (1 member), the submission will fail administrative eligibility regardless of software quality.** The human owner MUST ensure 2–5 eligible student members are officially registered on the team roster before submitting.

---

## 1. Verified Official Sources Inspected

1. **International Track University Call (Chiang Mai University IRD Official Notice):**  
   `https://ird.oou.cmu.ac.th/2026-shenzhen-international-fintech-competition/`
2. **FinTechathon Official Portal & Rule Bundles:**  
   `https://fintechathon.g-ican.com/#/en` (`lang-en-US-rule.5d04a38a.js`, `lang-en-US-home.e7c9e6aa.js`)
3. **Public Academic & Competition Announcements (PBCSF / WeBank International Track 2026):**  
   Verified cross-referenced announcements for the 2026 International Track *"AI as a Financial Participant"* (Topics A–F).

*Note on Unverified Appendix Details:* Where exact template constraints (such as mandatory PPT slide limits or video codec caps inside restricted email-only registration packets) are not publicly hosted in machine-readable form on the open portal, they are explicitly marked `UNVERIFIED` below in accordance with Phase 0 rules.

---

## 2. Official Competition Summary

| Dimension | Official Verified Specification | Source |
| :--- | :--- | :--- |
| **Competition Name** | 2026 Shenzhen International FinTech Competition (FinTechathon) — International Track | CMU IRD / PBCSF Notice |
| **Overarching Theme** | *"AI as a Financial Participant"* | CMU IRD / PBCSF Notice |
| **Selected Topic** | **Topic F: Agent Wallet (Autonomous On-chain Wallet)** | CMU IRD / PBCSF Notice |
| **Topic F Challenge Bonus** | **0–5 Point Challenge Bonus** awarded for selecting and executing Topic F (Agent Wallet) | CMU IRD / PBCSF Notice |
| **Submission & Registration Deadline** | **October 20, 2026 at 23:59 Beijing Time (UTC+8)** | CMU IRD / PBCSF Notice |
| **Online Review Period** | October 20 – October 31, 2026 | CMU IRD / PBCSF Notice |
| **Finalists Announcement** | October 31, 2026 | CMU IRD / PBCSF Notice |
| **Shenzhen On-Site Finals** | Check-in & WeBank HQ Visit: Nov 20, 2026; Grand Final & Awards: Nov 21–23, 2026 | CMU IRD / PBCSF Notice |
| **Language** | **English** (mandatory for all code docs, slides, reports, and presentations) | CMU IRD / FinTechathon Portal |
| **Submission Destination** | International Track Coordinator: `wangyr@pbcsf.tsinghua.edu.cn` (General portal reference: `fintechathon@g-ican.com`, subject `[Name of Team + Name of Works]`) | CMU IRD / FinTechathon Portal |
| **Evaluation Dimensions** | Product Completion & Technical Feasibility (40%), Commercial & Practical Financial Value (30%), Innovation & Interaction Design (30%), plus **0–5 pt Topic F Challenge Bonus** | FinTechathon Rule Bundle & International Track Call |

---

## 3. Official Requirements Matrix

| Requirement | Source | Mandatory/Optional | Current Status | Evidence | Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Eligibility: Full-Time Overseas University Students** | CMU IRD / PBCSF International Track Call | **Mandatory** | `HUMAN_VERIFICATION_REQUIRED` | Outside software repository scope; requires university enrollment proof & passport bio pages. | Project owner must attach student enrollment & passport bio pages when emailing `wangyr@pbcsf.tsinghua.edu.cn`. |
| **2. Team Size: 2 to 5 Members (>=60% Non-Chinese)** | CMU IRD & FinTechathon Rule Bundle (`c564`) | **Mandatory** | `CRITICAL_FLAG — HUMAN_ACTION_REQUIRED` | Repository shows 1 GitHub author (`cryptXploit`). Solo participation violates the 2–5 member rule. | Owner must confirm a 2–5 student team roster on the official registration form before submission. |
| **3. Registration & Slot Allocation** | CMU IRD / PBCSF Call | **Mandatory** | `HUMAN_ACTION_REQUIRED` | Free registration via email (`wangyr@pbcsf.tsinghua.edu.cn`) with registration form. | Owner must submit the completed registration form prior to Oct 20, 2026 23:59 UTC+8. |
| **4. Official Deadline Compliance (Oct 20, 2026 23:59 UTC+8)** | CMU IRD / PBCSF Call | **Mandatory** | `READY_FOR_SUBMISSION` | All technical, security, architecture, pitch deck, and video production deliverables prepared ahead of Oct 20, 2026 23:59 UTC+8. | Owner must record MP4 video and send submission email before deadline. |
| **5. Topic F Scope: Agent Wallet (Autonomous On-chain Wallet)** | CMU IRD / Topic F Specification | **Mandatory** | `SATISFIED` | [`src/app/actions/orchestrator.ts`](../../src/app/actions/orchestrator.ts), [`src/core/policy/engine.ts`](../../src/core/policy/engine.ts), [`src/core/security/transaction-analyzer.ts`](../../src/core/security/transaction-analyzer.ts) | SentinAI Guardian implements AI intent parsing, deterministic policy risk control, calldata decoding, simulation, and gated Sepolia execution. |
| **6. Topic F Challenge Bonus (0–5 Points): On-Chain Execution & Risk Control** | CMU IRD / Topic F Bonus Criteria | **Optional Bonus (0–5 pts)** | `SATISFIED (CONFIRMED ON SEPOLIA TX 0xfe315950...88da)` | Confirmed Sepolia transaction `0xfe315950...88da` (`0.00001 ETH`, Block `#11935960`) + 6-gate deterministic policy firewall + Gate 6.5 live revalidation + Broadcast Recovery Journal. | Verified on-chain evidence included in `evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`. |
| **7. Language: 100% English Competition Materials** | CMU IRD & FinTechathon Portal | **Mandatory** | `SATISFIED` | All competition docs in `docs/`, `README.md`, and `deliverables/` are authored in professional technical English. | Ensure all newly generated reports, slides, and scripts use natural, non-exaggerated English. |
| **8. Works Introduction Presentation Deck (PPT / PPTX)** | FinTechathon Rule Bundle (`works introduction (PPT)`) | **Mandatory** | `SATISFIED` | `docs/presentation/16_PITCH_DECK_CONTENT.md`, `17_PRESENTER_NOTES.md`, and `deliverables/SentinAI_Guardian_Pitch_Deck.pptx` (12 slides, 16:9). | Verified `.pptx` included in `deliverables/` and submission ZIP. |
| **9. Works Technical Documentation (DOC / Markdown / PDF)** | FinTechathon Rule Bundle (`works technical documents`) | **Mandatory** | `SATISFIED` | `docs/security/08..10`, `docs/architecture/11..15`, `docs/final-audit/01..09`, and `docs/submission/*` plus packaged copies in `deliverables/`. | Complete architecture, algorithm, state machine, and security self-assessment documents verified. |
| **10. Demonstration Video (2–3 Min Prototype Walkthrough)** | FinTechathon Rule Bundle (`and videos`) | **Mandatory** | `MISSING_MP4 (PRODUCTION PACKAGE READY; REQUIRES HUMAN RECORDING)` | `docs/submission/VIDEO_FINAL_SCRIPT.md`, `VIDEO_RECORDING_SHOTLIST.md`, `VIDEO_EDITING_TIMELINE.md`, `VIDEO_CAPTIONS_EN.srt`, and `VIDEO_OWNER_INSTRUCTIONS_BN.md`. | Owner must record the 2–3 minute screen capture + voiceover (`MP4`) before emailing submission. |
| **11. Functional Prototype & Source Code Repository** | FinTechathon Rule Bundle (Finals & Technical Review) | **Mandatory** | `SATISFIED` | Next.js 16 + TypeScript + Viem + SQLite + Gemini/Groq repository with 354 passing tests. | Synced with GitHub `origin/main` and packaged in `deliverables/SentinAI_Guardian_Submission_Package.zip`. |
| **12. Exact Slide Count / Video Codec Appendix Rules** | Restricted Organizer Attachment | **UNVERIFIED** | `UNVERIFIED` | Public web portals specify PPT, Technical Docs, and Video in English, but do not publish a locked PDF appendix with codec/slide caps. | Use standard industry-safe defaults: 12-slide 16:9 `.pptx` deck + 2–3 minute 1080p MP4 (H.264/AAC) video. |
| **13. Submission Format & Email Naming Convention** | FinTechathon Rule Bundle & CMU IRD | **Mandatory** | `READY_FOR_OWNER_SUBMISSION` | Email subject & package title format: `[Name of Team + SentinAI Guardian]`. | Follow `docs/submission/HOW_TO_SUBMIT_BN.md` when emailing `wangyr@pbcsf.tsinghua.edu.cn`. |

---

## 4. Confirmed Official Requirements vs. Recommended Supporting Materials

### Confirmed Mandatory Deliverables
1. **Official Registration Form & Student/Passport Verification** (2–5 team members, $\ge 60\%$ non-Chinese nationals).
2. **Presentation Deck (`PPT` / `PPTX`)** introducing product problem, technical architecture, risk control, and commercial/financial value.
3. **Technical Documentation** covering system architecture, AI workflow, security controls, and implementation details.
4. **Demonstration Video** showing the working prototype in English.
5. **Working Prototype / Source Code** demonstrating an AI agent acting as a financial participant under Topic F (Agent Wallet).

### Recommended Supporting Materials (Included in Repository to Maximize Technical Review Clarity)
1. **Cryptographic & On-Chain Verification Register** (`docs/verification/04_LIVE_EXECUTION_EVIDENCE.md`, `05_TRANSACTION_EVIDENCE_REGISTER.md`, `evidence/blockchain/`).
2. **Formal Security Self-Assessment & Threat Model** (`docs/security/08_SECURITY_SELF_ASSESSMENT.md`, `09_KNOWN_RISKS_AND_LIMITATIONS.md`, `10_THREAT_MODEL.md`).
3. **Automated Verification Suite** (`354+` Vitest unit, integration, security regression, and state-machine tests).
4. **Interactive Guided Judge Demo Mode** built directly into the application UI so reviewers can inspect normal flows, blocked attacks, and semantic verification without needing private keys.
