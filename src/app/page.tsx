import AgentConsole from "@/components/agent/AgentConsole";

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-gray-400 mt-2">Monitor your autonomous agent's activity and security status.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Total Balance (ETH)</h3>
          <p className="text-3xl font-semibold mt-2 tabular-nums">1.450</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Intents Processed</h3>
          <p className="text-3xl font-semibold mt-2 tabular-nums">24</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Threats Blocked</h3>
          <p className="text-3xl font-semibold mt-2 text-danger tabular-nums">3</p>
        </div>
      </div>

      <div className="mt-8">
        <AgentConsole />
      </div>
    </div>
  );
}
