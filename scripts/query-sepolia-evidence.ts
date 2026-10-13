import { createPublicClient, http, formatEther, formatUnits, getAddress } from 'viem';
import { sepolia } from 'viem/chains';
import * as fs from 'fs';

// Load .env manually
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  }
}

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] }
] as const;

async function main() {
  console.log('========================================================');
  console.log(' SentinAI Guardian — Live Sepolia Read-Only Evidence');
  console.log('========================================================\n');

  const rawRpcUrl = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const parsedUrl = new URL(rawRpcUrl);
  console.log(`[RPC_HOST] ${parsedUrl.host}`);

  const client = createPublicClient({
    chain: sepolia,
    transport: http(rawRpcUrl)
  });

  try {
    const chainId = await client.getChainId();
    const blockNumber = await client.getBlockNumber();
    console.log(`[CHAIN_ID] ${chainId}`);
    console.log(`[BLOCK_NUMBER] ${blockNumber}`);

    // Public address used for verification (Alice alias from trustedContacts)
    const walletAddress = getAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    console.log(`[VERIFICATION_ADDRESS] ${walletAddress}`);

    const nativeBalance = await client.getBalance({ address: walletAddress });
    console.log(`[NATIVE_ETH_RAW] ${nativeBalance.toString()} wei`);
    console.log(`[NATIVE_ETH_FORMATTED] ${formatEther(nativeBalance)} ETH`);

    const tokens = [
      { name: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
      { name: 'USDT', address: '0x7169D38820dfd117C3FA1fbf29984CD7474E98e1' },
      { name: 'DAI',  address: '0x3e622317F8c93f7328350cF0b56318C4cb595a97' }
    ];

    for (const t of tokens) {
      const tokenAddr = getAddress(t.address);
      try {
        const decimals = await client.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'decimals'
        });
        const symbol = await client.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'symbol'
        });
        const balance = await client.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress]
        });

        console.log(`[TOKEN_${t.name}] Contract: ${tokenAddr} | Symbol: ${symbol} | Decimals: ${decimals} | Raw: ${balance.toString()} | Formatted: ${formatUnits(balance, decimals)}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[TOKEN_${t.name}] Contract: ${tokenAddr} | Status: UNAVAILABLE (${msg})`);
      }
    }

    console.log('\n[RPC_RESPONSE_STATUS] SUCCESS (Read-only execution completed, 0 transactions broadcast)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[RPC_ERROR]', msg);
    process.exitCode = 1;
  }
}

main();
