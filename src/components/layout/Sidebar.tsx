import Link from 'next/link';
import { Shield, Wallet, Activity, Settings, LayoutDashboard } from 'lucide-react';
import { privateKeyToAccount } from 'viem/accounts';

export default function Sidebar() {
  let displayAddress = "0xNotConfigured";
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66) {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      displayAddress = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
    } catch {
      displayAddress = "0xInvalidKey";
    }
  }

  return (
    <aside className="w-64 h-screen bg-surface border-r border-border hidden md:flex flex-col sticky top-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Shield className="text-accent-blue w-6 h-6" />
          SentinAI
        </h1>
        <p className="text-xs text-gray-400 mt-1">Autonomous Guardian</p>
      </div>
      
      <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover text-foreground transition-colors">
          <LayoutDashboard className="w-5 h-5 text-accent-blue" />
          <span className="font-medium">Overview</span>
        </Link>
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover text-gray-400 hover:text-foreground transition-colors">
          <Activity className="w-5 h-5" />
          <span className="font-medium">Agent Console</span>
        </Link>
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover text-gray-400 hover:text-foreground transition-colors">
          <Shield className="w-5 h-5" />
          <span className="font-medium">Security Center</span>
        </Link>
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover text-gray-400 hover:text-foreground transition-colors">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Policies</span>
        </Link>
      </nav>

      <div className="p-6 border-t border-border">
        <div className="flex items-center gap-3 text-sm text-gray-400" title={displayAddress}>
          <Wallet className="w-5 h-5 text-accent-blue" />
          <span className="truncate tabular-nums font-mono">{displayAddress}</span>
        </div>
      </div>
    </aside>
  );
}
