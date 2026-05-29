import { Activity, Coins, Image, Layers, Timer, WalletCards } from "lucide-react";

type DashboardStatsProps = {
  assetCount: number;
  runCount: number;
  failedRunCount: number;
  totalActualCredits: number;
  estimatedBatchCredits: number;
  balanceCredits: number | null;
  batchCount: number;
  promptTokens: number;
  outputMegapixels: number;
  lastRunAt?: number;
};

export function DashboardStats(props: DashboardStatsProps) {
  const stats = [
    {
      label: "Assets",
      value: String(props.assetCount),
      detail: `${props.runCount} calls`,
      icon: Image
    },
    {
      label: "Batch",
      value: String(props.batchCount),
      detail: `${props.estimatedBatchCredits.toFixed(2)} cr est.`,
      icon: Layers
    },
    {
      label: "Balance",
      value: typeof props.balanceCredits === "number" ? `${props.balanceCredits.toFixed(2)} cr` : "unchecked",
      detail: `${props.totalActualCredits.toFixed(2)} cr logged`,
      icon: WalletCards
    },
    {
      label: "Prompt",
      value: `${props.promptTokens}`,
      detail: `${props.outputMegapixels.toFixed(2)} MP output`,
      icon: Coins
    },
    {
      label: "Health",
      value: props.failedRunCount ? `${props.failedRunCount} failed` : "clean",
      detail: props.lastRunAt ? new Date(props.lastRunAt).toLocaleTimeString() : "no run yet",
      icon: props.failedRunCount ? Activity : Timer
    }
  ];

  return (
    <section className="statsGrid">
      {stats.map(({ label, value, detail, icon: Icon }) => (
        <div className="statCard" key={label}>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
          <Icon size={18} />
        </div>
      ))}
    </section>
  );
}
