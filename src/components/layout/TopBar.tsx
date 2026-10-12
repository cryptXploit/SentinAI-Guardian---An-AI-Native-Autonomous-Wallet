import { ShieldCheck } from 'lucide-react';

export default function TopBar() {
  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-border/50 text-sm">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
          <span className="text-gray-300">Sepolia Testnet</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium border border-success/20">
          <ShieldCheck className="w-4 h-4" />
          Protected
        </div>
      </div>
    </header>
  );
}
