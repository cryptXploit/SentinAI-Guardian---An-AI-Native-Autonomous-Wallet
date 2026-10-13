import { createPublicClient, http, formatEther, Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import AgentConsole from "@/components/agent/AgentConsole";

async function getLiveWalletState() {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

  let address: Address = "0x0000000000000000000000000000000000000000";
  let isConfigured = false;

  if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66) {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      address = account.address;
      isConfigured = true;
    } catch {
      isConfigured = false;
    }
  }

  let balanceDisplay = "0.0000";
  let rpcOnline = false;

  if (isConfigured) {
    try {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl, { timeout: 4000 })
      });

      const balanceWei = await publicClient.getBalance({ address });
      balanceDisplay = Number(formatEther(balanceWei)).toFixed(4);
      rpcOnline = true;
    } catch {
      balanceDisplay = "RPC Error";
      rpcOnline = false;
    }
  } else {
    balanceDisplay = "Not Configured";
  }

  return {
    address,
    isConfigured,
    balance: balanceDisplay,
    rpcOnline
  };
}

export default async function Home() {
  const walletState = await getLiveWalletState();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-gray-400 mt-2">Monitor your autonomous agent&apos;s activity and security status.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Live Agent Balance (Sepolia ETH)</h3>
          <p className="text-3xl font-semibold mt-2 tabular-nums">
            {walletState.balance} {walletState.isConfigured && walletState.rpcOnline ? "ETH" : ""}
          </p>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {walletState.isConfigured 
              ? (walletState.rpcOnline ? `Address: ${walletState.address}` : "RPC connection unavailable")
              : "Set AGENT_PRIVATE_KEY in .env.local"}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Agent Session Status</h3>
          <p className="text-3xl font-semibold mt-2 text-accent-blue tabular-nums">Active</p>
          <p className="text-xs text-gray-500 mt-1">Dual-phase gated console ready</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Policy Security Engine</h3>
          <p className="text-3xl font-semibold mt-2 text-success tabular-nums">Protected</p>
          <p className="text-xs text-gray-500 mt-1">Deterministic whitelist &amp; caps armed</p>
        </div>
      </div>

      <div className="mt-8">
        <AgentConsole />
      </div>
    </div>
  );
}
