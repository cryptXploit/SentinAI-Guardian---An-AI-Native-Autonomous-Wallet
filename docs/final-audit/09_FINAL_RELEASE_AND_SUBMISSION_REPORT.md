# 09 — Final Release & Competition Submission Report (R9 Stabilization Gate)

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  
**Repository:** [`https://github.com/cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet`](https://github.com/cryptXploit/SentinAI-Guardian---An-AI-Native-Autonomous-Wallet)  
**Audit Date:** 2026-10-19  

---

## 1. Executive Release & Submission Gate Summary (Items 1–12)

| # | Gate Dimension | Final Verdict / Value | Verification Details |
| :---: | :--- | :--- | :--- |
| **1** | **Database Integrity Verdict** | **`PARTIAL` (`PRAGMA integrity_check: ok`)** | Incident confirmed & documented in [`08_DATABASE_EVIDENCE_INTEGRITY.md`](./08_DATABASE_EVIDENCE_INTEGRITY.md). Confirmed Sepolia proposal (`7540a5f1-dcb4-4797-b46a-13ec74fa96d9`) restored 100% verbatim across all 10 relational columns + full `iip_data` from pre-incident JSON dump (`confirmed_sepolia_tx_0xfe315950.json`); 5 older R7.4 test rows have verbatim relational columns and `keccak256`-verified `iip_data` reconstruction (`6/6` pass `verifyIIPDigest`). Forensic backup preserved outside Git (`SHA-256: 321399ab3d276c274ba8c24e12e36d475419238526079e9bd7fac1823eada9d5`). |
| **2** | **On-Chain Verification Verdict** | **`VERIFIED`** | Sepolia Tx `0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da` independently verified via `https://ethereum-sepolia-rpc.publicnode.com` and `https://sepolia.drpc.org` (`chainId: 11155111`, `blockNumber: 11935960` / `0xb620d8`, `status: 0x1`, `value: 10000000000000 wei` = `0.00001 ETH`, `gas: 21000`, `gasUsed: 12000`, `effectiveGasPrice: 136 wei`). |
| **3** | **Tests Passed** | **`PASS` (`354 / 354` Tests across `33 / 33` Suites)** | Executed against isolated `:memory:` SQLite database (`npx vitest run`: `354 passed`, `npx tsc --noEmit`: `0 errors`, `npm run lint`: `0 errors, 1 warning`, `npm run build`: `PASS`). |
| **4** | **Browser Test Status** | **`PASS` (`12 / 12` E2E Flows, `4` Viewports)** | Verified in real headless Google Chrome via CDP across `1440x900`, `1024x768`, `768x1024`, and `375x812` (`pageErrors: []`, `0px` horizontal overflow). |
| **5** | **README Verification** | **`PASS`** | [`README.md`](../../README.md) verified against source code (`ETH`, `USDC`, `USDT`, `DAI`; `parseTokenAmount`; `maxTransferAmountETH = "1.0"`; unkeyed `keccak256` IIP digest; `0` broken links; `0` local machine paths). |
| **6** | **Presentation Verification** | **`PASS`** | [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx) (`12` slides, 16:9 widescreen OpenXML) and visual contact sheet ([`evidence/presentation/slides_overview.png`](../../evidence/presentation/slides_overview.png)) verified, including Slide 10 on Known Risks & Security Boundaries. |
| **7** | **Video Status** | **`MISSING` (Script & Storyboard `COMPLETE`)** | Narration script ([`18_DEMO_VOICEOVER_SCRIPT.md`](../video/18_DEMO_VOICEOVER_SCRIPT.md)), visual storyboard ([`19_DEMO_VISUAL_STORYBOARD.md`](../video/19_DEMO_VISUAL_STORYBOARD.md)), and recording guide ([`20_RECORDING_AND_EDITING_GUIDE.md`](../video/20_RECORDING_AND_EDITING_GUIDE.md)) are complete, but the actual human-recorded `.mp4` video binary is not yet recorded. |
| **8** | **Official Requirements Status** | **`PARTIAL / BLOCKED ON VIDEO & ROSTER`** | Per [`00_OFFICIAL_REQUIREMENTS_MATRIX.md`](../competition/00_OFFICIAL_REQUIREMENTS_MATRIX.md), software prototype, English documentation, and `.pptx` presentation are `COMPLETE`, while the mandatory `.mp4` demonstration video and 2–5 student registration package require owner completion. |
| **9** | **Eligibility Status** | **`UNVERIFIED`** | Requires human owner confirmation of **2–5 enrolled full-time university students** with **$\ge 60\%$ non-Chinese nationals** before the deadline (**October 20, 2026 at 23:59 UTC+8**). |
| **10** | **GitHub Commit Hash** | Parent: `4f31e6143ccdd3385c720fe0980e8137cdc6f8fe` $\rightarrow$ Release Commit (`origin/main` synced in Priority 5) | Commit message: `docs(release): finalize verified competition evidence and submission artifacts`. |
| **11** | **GitHub Push Status** | **`SYNCED TO origin/main`** | Verified via `git fetch origin`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `git status -sb` (`0` secrets staged, `sentinai.db*` and `.env*` excluded). |
| **12** | **Submission Archive Location & SHA-256** | [`deliverables/SentinAI_Guardian_Submission_Package.zip`](../../deliverables/SentinAI_Guardian_Submission_Package.zip) (`SHA-256: 12655a6ea12c703e119c6ce94e01c7f19eded515fbe1e50cd2a259d5cdd7c3da`) | Clean, self-contained ZIP archive (`2,083,770` bytes, `80/80` entries decompression-verified) containing all verified docs, `.pptx` deck, on-chain JSON proofs, and screenshots (excluding `.env`, keys, `sentinai.db*`, `node_modules`, and caches). |

---

## 2. Critical Remaining Risks & Technical Boundaries (Item 13)

1. **Administrative & Deliverable Blockers (Non-Code):**
   - **Mandatory `.mp4` Demo Video Missing:** Official FinTechathon rules require a demonstration video alongside the PPT and technical documents. A markdown script is not a substitute for an `.mp4` file.
   - **2–5 Student Team Roster Unverified:** Solo participation (1 member) is ineligible under International Track rules (`2–5` enrolled university students, $\ge 60\%$ non-Chinese nationals).
2. **Architectural Security Boundaries (Disclosed in [`09_KNOWN_RISKS_AND_LIMITATIONS.md`](../security/09_KNOWN_RISKS_AND_LIMITATIONS.md)):**
   - **Server-Side Hot Key (`AGENT_PRIVATE_KEY`):** Stored in `.env` server process memory for Sepolia signing rather than an HSM/KMS enclave or ERC-4337 smart account.
   - **Unkeyed IIP Digest (`computeIIPDigest`):** Uses unkeyed `keccak256(encodePacked(...))` over 7 canonical fields to detect parameter drift between Phase 1 and Phase 2; relies on SQLite database integrity rather than an asymmetric signature, supplemented by Gate 6.5 Phase 2 live policy and semantic re-evaluation.
   - **Per-Transaction Cap Scope:** Enforces per-transaction `maxTransferAmountETH` (`1.0 ETH` default) and per-token approval ceilings (`tokenApprovalPolicies`), not a rolling 24-hour cumulative spend window.
   - **Single-Instance SQLite & Public RPC Pruning:** Uses single-node SQLite WAL persistence; free non-archive Sepolia RPCs (e.g., PublicNode) prune historical transaction receipts after ~10,000 blocks, requiring archive-capable endpoints (`https://sepolia.drpc.org`) for older receipt lookups.

---

## 3. Exact Owner Actions Before Competition Submission (Item 14 — সংক্ষিপ্ত বাংলা নির্দেশিকা)

১. **ডেমো ভিডিও (`.mp4`) রেকর্ড করুন (অবশ্যই করণীয়):**
   - [`docs/video/18_DEMO_VOICEOVER_SCRIPT.md`](../video/18_DEMO_VOICEOVER_SCRIPT.md) এবং [`19_DEMO_VISUAL_STORYBOARD.md`](../video/19_DEMO_VISUAL_STORYBOARD.md) অনুসরণ করে ২–৩ মিনিটের ইংরেজি ভয়েসওভারসহ 1080p `.mp4` ডেমো ভিডিও রেকর্ড করুন।
২. **টিম এলিজিবিলিটি ও রেজিস্ট্রেশন ডকুমেন্ট নিশ্চিত করুন (অবশ্যই করণীয়):**
   - অফিসিয়াল নিয়মানুযায়ী দলে **২ থেকে ৫ জন বর্তমান বিশ্ববিদ্যালয় শিক্ষার্থী** (ন্যূনতম ৬০% অ-চীনা নাগরিক) থাকতে হবে। সকল সদস্যের স্টুডেন্ট এনরোলমেন্ট প্রমাণ ও পাসপোর্ট বায়ো পেজ প্রস্তুত রাখুন (**কখনোই পাসপোর্ট বা ব্যক্তিগত পরিচয়পত্র গিটহাবে কমিট করবেন না**)।
৩. **অফিসিয়াল ডেডলাইনের মধ্যে ইমেইল ও পোর্টালে জমা দিন:**
   - **October 20, 2026 (23:59 Beijing Time / UTC+8)**-এর আগে রেজিস্ট্রেশন ফর্ম, [`deliverables/SentinAI_Guardian_Pitch_Deck.pptx`](../../deliverables/SentinAI_Guardian_Pitch_Deck.pptx), [`deliverables/SentinAI_Guardian_Submission_Package.zip`](../../deliverables/SentinAI_Guardian_Submission_Package.zip), রেকর্ড করা `.mp4` ভিডিও, এবং গিটহাব রিপোজিটরি লিংক আন্তর্জাতিক ট্র্যাক কোঅর্ডিনেটরের ইমেইলে (`wangyr@pbcsf.tsinghua.edu.cn`, সাবজেক্ট: `[Team Name + SentinAI Guardian]`) পাঠান।
