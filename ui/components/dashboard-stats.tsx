import { Coins, Image, LibraryBig, RefreshCcw, SquareStack, WalletCards } from "lucide-react";

type DashboardStatsProps = {
  assetCount: number;
  promptCount: number;
  selectedPromptCount: number;
  runCount: number;
  failedRunCount: number;
  totalActualCredits: number;
  estimatedBatchCredits: number;
  balanceCredits: number | null;
  batchCount: number;
  promptTokens: number;
  outputMegapixels: number;
  isCheckingBalance: boolean;
  lastRunAt?: number;
  onCheckBalance: () => void;
};

export function DashboardStats(props: DashboardStatsProps) {
  const middleStats = [
    {
      label: "Prompt",
      value: `${props.promptTokens}`,
      detail: "tokens estimated",
      icon: Coins
    },
    {
      label: "Prompts",
      value: String(props.promptCount),
      detail: props.selectedPromptCount ? `${props.selectedPromptCount} selected` : `${props.batchCount} per run`,
      icon: LibraryBig
    },
    {
      label: "Output",
      value: `${props.outputMegapixels.toFixed(2)} MP`,
      detail: `${props.estimatedBatchCredits.toFixed(2)} cr est.`,
      icon: SquareStack
    }
  ];
  const runDetail = props.failedRunCount
    ? `${props.failedRunCount} failed`
    : props.lastRunAt
      ? `last ${new Date(props.lastRunAt).toLocaleTimeString()}`
      : "no run yet";

  return (
    <section className="statsGrid">
      <div className="statCard">
        <div>
          <span>Assets</span>
          <strong>{props.assetCount}</strong>
          <small>{props.runCount} calls | {runDetail}</small>
        </div>
        <Image size={18} />
      </div>

      <div className="statsCenter">
        {middleStats.map(({ label, value, detail, icon: Icon }) => (
          <div className="statCard" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
            <Icon size={18} />
          </div>
        ))}
      </div>

      <div className="statCard balanceStat">
        <div>
          <span>Balance</span>
          <strong>{typeof props.balanceCredits === "number" ? `${props.balanceCredits.toFixed(2)} cr` : "unchecked"}</strong>
          <small>{props.totalActualCredits.toFixed(2)} cr logged</small>
        </div>
        <button onClick={props.onCheckBalance} disabled={props.isCheckingBalance}>
          <RefreshCcw className={props.isCheckingBalance ? "spin" : ""} size={15} />
          Check
        </button>
        <WalletCards size={18} />
      </div>
    </section>
  );
}
