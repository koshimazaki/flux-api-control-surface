import { RefreshCcw, WalletCards } from "lucide-react";
import { WorkspaceModeTabs } from "@/components/workspace-mode-tabs";
import type { WorkspaceMode } from "@/lib/types";

type DashboardStatsProps = {
  totalActualCredits: number;
  balanceCredits: number | null;
  isCheckingBalance: boolean;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onCheckBalance: () => void;
};

export function DashboardStats(props: DashboardStatsProps) {
  return (
    <section className="statsGrid workspaceTopControls">
      <WorkspaceModeTabs value={props.workspaceMode} onChange={props.onWorkspaceModeChange} />

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
      </div>
    </section>
  );
}
