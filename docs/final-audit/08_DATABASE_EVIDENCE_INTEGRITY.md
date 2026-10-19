# 08 — Database Evidence Integrity & Forensic Incident Report (R9 Priority 0)

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet  
**Competition:** 2026 Shenzhen International FinTech Competition (International Track — Topic F)  
**Audit Date:** 2026-10-19  

---

## 1. Executive Forensic Verdicts

- **INCIDENT:** `CONFIRMED`
- **DATA LOSS:** `POSSIBLE` *(For non-hashed `iip_data` subfields and `updated_at` timestamps of 5 historical R7.4 pre-broadcast test rows from `2026-10-13`; `0` data loss for the confirmed Sepolia transaction `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` except its SQLite auto-generated `updated_at` timestamp)*
- **RESTORATION:** `PARTIAL` *(100% verbatim field restoration for the confirmed Sepolia transaction `7540a5f1-dcb4-4797-b46a-13ec74fa96d9` from pre-incident JSON dump `confirmed_sepolia_tx_0xfe315950.json`; 100% verbatim relational column + `keccak256`-verified `iip_data` reconstruction for the 5 older R7.4 rows; not byte-for-byte identical at the raw SQLite file page level)*
- **ON-CHAIN EVIDENCE:** `VERIFIED` *(Independently confirmed on Ethereum Sepolia via `https://ethereum-sepolia-rpc.publicnode.com` and `https://sepolia.drpc.org`)*

---

## 2. Preservation of Existing Evidence (Section 0.1)

Before executing any R9 checks, the background Next.js process (`PID 1604` on port `3000`) was terminated, and read-only forensic backups were created outside the Git repository in the external forensic directory (`scratch/forensic-backup/`):

| Artifact | Size (Bytes) | SHA-256 Digest |
| :--- | :---: | :--- |
| **`sentinai.db` (Pre-Check Raw File)** | `86,016` | `c754dbbb06a845e63a02f7c6a255f991ff4f39b4bb10ef7e07f81c2fd6d448bd` |
| **`sentinai.db-wal` (Pre-Check WAL)** | `0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| **`sentinai.db-shm` (Pre-Check SHM)** | `32,768` | `22892883d9dcfcf716d5bba63da98ecfd7153711962a4d91345510091ae14ba6` |
| **`sentinai_forensic_backup.db` (SQLite `.backup()` API)** | `86,016` | `321399ab3d276c274ba8c24e12e36d475419238526079e9bd7fac1823eada9d5` |
| **`sentinai.db.bak.1791896396387` (Legacy Schema v0 Backup)** | `8,192` | `e2e60f7dc70eb0393c72722989cf1f604b6cb3788c519ec9969c749f93ba81e7` |
| **`evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`** | `5,571` | `b2fce7398500c58a2a046639d811903de62749af87566ee6b0147a679e8c1607` |

All runtime database files (`sentinai.db`, `*.db-wal`, `*.db-shm`, `*.db.bak.*`, `*.recovery-journal.json`) are excluded from Git via `.gitignore` and are never staged or committed.

---

## 3. Forensic Investigation of Previous Database Operations (Section 0.2)

We audited all terminal logs, scripts (`scripts/inspect-reality-audit.ts`, `scripts/run-browser-e2e-audit.ts`), and scratch files (`restore_db.cjs`) to reconstruct the exact sequence of events:

1. **Pre-Incident State (`2026-10-19T07:38:30.328Z`):**
   - `scripts/inspect-reality-audit.ts` opened `sentinai.db` in `readonly: true` mode and wrote [`evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json`](../../evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json).
   - That pre-incident JSON snapshot recorded:
     - `databaseSummary.totalProposals = 6`
     - `databaseSummary.policyAuditLogsCount = 0`
     - Complete verbatim record (`sqliteDatabaseRecord`, including full `iipData` JSON) for the confirmed Sepolia transaction proposal `7540a5f1-dcb4-4797-b46a-13ec74fa96d9`.
     - Complete 10-column metadata (`id, owner_id, status, provenance, is_executable, digest, tx_hash, created_at, authorized_at, expires_at`) for all `6` proposals in `databaseSummary.proposals`.
2. **How 4 Extra Rows Entered `sentinai.db` (`2026-10-19T08:48:57Z` – `08:49:56Z`):**
   - `scripts/run-browser-e2e-audit.ts` copied `sentinai.db` to a temp file (`fs.copyFileSync(dbPath, backupPath)`) before running 12 headless Chrome E2E steps against `http://localhost:3000`.
   - During the E2E run, the Next.js server created 4 temporary proposal rows (`ee6e02c4...`, `b3386b89...`, `d1d39d4b...`, and one fixture row) inside `sentinai.db-wal` (visible in [`evidence/browser/10_policy_editor_and_history.png`](../../evidence/browser/10_policy_editor_and_history.png), which shows 10 rows total: the 4 new rows from `08:49 AM` at the top + the 6 original rows below).
   - When `run-browser-e2e-audit.ts` finished, its `finally` block ran `fs.copyFileSync(backupPath, dbPath)` without checkpointing or removing `sentinai.db-wal`. When SQLite next opened `sentinai.db`, it replayed `sentinai.db-wal`, leaving `10` rows (`CLEAN_DB_COUNT=10`).
3. **Which `DELETE` Commands Executed (`2026-10-19T08:54:00Z` – `08:54:40Z`):**
   - **Attempt 1 (`14:54:00+06:00`):** `npx tsx -e "... DELETE FROM proposals WHERE id NOT IN (...) ..."` **failed to parse** (`Transform failed: Unterminated string literal`) and did **not** execute against SQLite.
   - **Attempt 2 (`14:54:31+06:00`):** `node -e "... db.prepare('DELETE FROM proposals WHERE created_at > 1776600000000').run(); db.pragma('wal_checkpoint(TRUNCATE)');"` **executed and succeeded**. Because `created_at` in SQLite is stored as a `TEXT` string (e.g., `"2026-10-17 18:54:46"`), SQLite's type comparison rules evaluate any `TEXT` value as greater than any `INTEGER` (`TEXT > INTEGER` is always `TRUE`). Consequently, all `10` rows (`4` temporary browser E2E rows + `6` original rows) were deleted (`CLEAN_DB_COUNT=0`).
4. **How `restore_db.cjs` Restored the 6 Proposals (`2026-10-19T08:59:09Z`):**
   - `restore_db.cjs` read `evidence/blockchain/confirmed_sepolia_tx_0xfe315950.json` (`databaseSummary.proposals` and `sqliteDatabaseRecord.iipData`) and re-inserted the 6 original proposal rows (`RESTORED_PROPOSALS_COUNT=6`).

### 3.1 Forensic Equivalence Assessment: Original vs. Restored Records

| Record Scope | Source Used by `restore_db.cjs` | Byte-for-Byte Equivalent? | Cryptographic & Relational Integrity |
| :--- | :--- | :---: | :--- |
| **Row 1: Confirmed Sepolia Proposal (`7540a5f1-dcb4-4797-b46a-13ec74fa96d9`)** | Verbatim pre-incident JSON dump (`sqliteDatabaseRecord` in `confirmed_sepolia_tx_0xfe315950.json`) | **NO** (Only `updated_at` changed to `2026-10-19 08:59:18` via SQLite `DEFAULT (datetime('now'))`) | **100% VERBATIM** across all 10 columns (`id`, `owner_id`, `status`, `provenance`, `is_executable`, `digest`, `tx_hash`, `created_at`, `authorized_at`, `expires_at`) AND full `iip_data` JSON (`verifyIIPDigest = true`, `digest = 0xce15d586...b115`). |
| **Rows 2–6: Five Historical R7.4 Test Proposals (`2026-10-13`)** | 10 relational columns verbatim from `confirmed_sepolia_tx_0xfe315950.json`; `iip_data` reconstructed from UI screenshot & verified via `computeIIPDigest` | **NO** (`iip_data` non-hashed timestamps & `updated_at` were reconstructed) | **PARTIAL / CRYPTOGRAPHICALLY VERIFIED:** All 10 relational columns match the pre-incident JSON dump verbatim, and `computeIIPDigest(intent, candidate, policyDecision)` matches the original 256-bit `keccak256` `digest` columns (`0x2fa0d386...`, `0xf394bf42...`, `0x1dff1086...`). |
| **`user_policies` & `policy_audit_log` Tables** | Never touched by `DELETE` or `restore_db.cjs` | **YES** (`0` rows before and after) | Confirmed `0` rows in pre-incident `confirmed_sepolia_tx_0xfe315950.json` (`policyAuditLogsCount: 0`) and `0` rows after. |

---

## 4. Read-Only SQLite Integrity & Invariant Checks (Section 0.4)

Executed in strict `readonly: true` mode against `sentinai.db`:

- **`PRAGMA integrity_check`:** `[{ "integrity_check": "ok" }]`
- **`PRAGMA foreign_key_check`:** `[]` (`0` violations)
- **`PRAGMA journal_mode`:** `[{ "journal_mode": "wal" }]`
- **`schema_version`:** `3`
- **Proposal Status Consistency:** `1` `CONFIRMED` (with non-null `tx_hash` and `authorized_at`), `3` `PREPARED` (with `tx_hash = null`), `2` `FAILED` (with `tx_hash = null`).
- **Transaction Hash Uniqueness:** `1` non-null `tx_hash` (`0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`), unique across the table.
- **IIP Digest Re-Computation Check (`verifyIIPDigest`):** `6 / 6` proposals pass `verifyIIPDigest(iipData)` and match the `digest` column.
- **Remediation Applied to Browser E2E Script:** Updated `scripts/run-browser-e2e-audit.ts` so that future browser E2E runs never mutate `sentinai.db` without full WAL/SHM restoration.
