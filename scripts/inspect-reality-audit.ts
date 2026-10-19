import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createPublicClient, http, formatEther, formatGwei } from 'viem';
import { sepolia } from 'viem/chains';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function main() {
  loadEnv();
  const txHash = '0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da' as `0x${string}`;
  const candidateRpcs = [
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia',
    'https://rpc2.sepolia.org',
    process.env.RPC_URL!,
  ].filter(Boolean);

  let tx = null;
  let receipt = null;
  let block = null;
  let usedRpc = '';

  for (const url of candidateRpcs) {
    try {
      const client = createPublicClient({ chain: sepolia, transport: http(url) });
      tx = await client.getTransaction({ hash: txHash });
      receipt = await client.getTransactionReceipt({ hash: txHash });
      block = await client.getBlock({ blockNumber: receipt.blockNumber });
      usedRpc = url;
      break;
    } catch (e) {
      console.log(`RPC ${url} could not fetch historical receipt:`, (e as Error).message);
    }
  }

  const dbPath = path.resolve(process.cwd(), 'sentinai.db');
  const db = new Database(dbPath, { readonly: true });
  const confirmedRow = db
    .prepare("SELECT * FROM proposals WHERE id = ?")
    .get('7540a5f1-dcb4-4797-b46a-13ec74fa96d9') as Record<string, unknown> | undefined;
  const allProposals = db
    .prepare("SELECT id, owner_id, status, provenance, is_executable, digest, tx_hash, created_at, authorized_at, expires_at FROM proposals ORDER BY created_at DESC")
    .all();
  const policyAuditLogs = db
    .prepare("SELECT id, owner_id, action, created_at FROM policy_audit_log ORDER BY created_at DESC LIMIT 10")
    .all();
  db.close();

  const liveClient = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL!) });
  const [chainId, currentBlock] = await Promise.all([
    liveClient.getChainId(),
    liveClient.getBlockNumber(),
  ]);

  if (tx && receipt && block) {
    const parsedIip = confirmedRow?.iip_data ? JSON.parse(String(confirmedRow.iip_data)) : null;
    const evidencePayload = {
      verifiedAt: new Date().toISOString(),
      archiveRpcUsedForHistoricalReceipt: usedRpc,
      network: {
        name: 'Ethereum Sepolia Testnet',
        chainId,
        currentBlockNumber: currentBlock.toString(),
      },
      onChainTransaction: {
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash,
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        transactionIndex: receipt.transactionIndex,
        from: tx.from,
        to: tx.to,
        valueWei: tx.value.toString(),
        valueEth: formatEther(tx.value),
        inputData: tx.input,
        nonce: tx.nonce,
        gasLimit: tx.gas.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
        effectiveGasPriceGwei: formatGwei(receipt.effectiveGasPrice),
        totalFeeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        totalFeeEth: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
        receiptStatus: receipt.status,
        txType: receipt.type,
        explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
      },
      sqliteDatabaseRecord: {
        id: confirmedRow?.id,
        ownerId: confirmedRow?.owner_id,
        status: confirmedRow?.status,
        provenance: confirmedRow?.provenance,
        isExecutable: Boolean(confirmedRow?.is_executable),
        digest: confirmedRow?.digest,
        txHash: confirmedRow?.tx_hash,
        createdAt: confirmedRow?.created_at,
        authorizedAt: confirmedRow?.authorized_at,
        expiresAt: confirmedRow?.expires_at,
        iipData: parsedIip,
      },
      databaseSummary: {
        totalProposals: allProposals.length,
        proposals: allProposals,
        policyAuditLogsCount: policyAuditLogs.length,
      },
    };

    const outDir = path.resolve(process.cwd(), 'evidence', 'blockchain');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'confirmed_sepolia_tx_0xfe315950.json');
    fs.writeFileSync(outPath, JSON.stringify(evidencePayload, null, 2), 'utf8');
    console.log('SUCCESS! Wrote verified on-chain transaction evidence to:', outPath);
    console.log(JSON.stringify(evidencePayload.onChainTransaction, null, 2));
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
