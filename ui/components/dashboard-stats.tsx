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
  const runDetail = props.failedRunCount
    ? `${props.failedRunCount} failed`
    : props.lastRunAt
      ? `last ${new Date(props.lastRunAt).toLocaleTimeString()}`
      : "no run yet";
  const middleStats = [
    {
      label: "Assets",
      value: String(props.assetCount),
      detail: `${props.runCount} calls | ${runDetail}`,
      icon: Image,
      tone: "statToneAssets"
    },
    {
      label: "Prompts",
      value: String(props.promptCount),
      detail: props.selectedPromptCount ? `${props.selectedPromptCount} selected` : `${props.batchCount} per run`,
      icon: LibraryBig,
      tone: "statToneLibrary"
    },
    {
      label: "Output",
      value: `${props.outputMegapixels.toFixed(2)} MP`,
      detail: `${props.estimatedBatchCredits.toFixed(2)} cr est.`,
      icon: SquareStack,
      tone: "statToneOutput"
    }
  ];

  return (
    <section className="statsGrid">
      <div className="statCard statTonePrompt">
        <div>
          <span>Prompt</span>
          <strong>{props.promptTokens}</strong>
          <small>tokens estimated</small>
        </div>
        <Coins size={18} />
        <StatSignal />
      </div>

      <div className="statsCenter">
        {middleStats.map(({ label, value, detail, icon: Icon, tone }) => (
          <div className={`statCard ${tone}`} key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
            <Icon size={18} />
            <StatSignal />
          </div>
        ))}
      </div>

      <div className="statCard balanceStat statToneBalance">
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
        <StatSignal />
      </div>
    </section>
  );
}

function StatSignal() {
  return (
    <div className="statSignal" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}
