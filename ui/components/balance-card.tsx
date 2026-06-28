import { RefreshCcw } from "lucide-react";

type BalanceCardProps = {
  balanceCredits: number | null;
  totalActualCredits: number;
  isCheckingBalance: boolean;
  onCheckBalance: () => void;
};

export function BalanceCard({ balanceCredits, totalActualCredits, isCheckingBalance, onCheckBalance }: BalanceCardProps) {
  return (
    <div className="statCard balanceStat statToneBalance">
      <div>
        <span>Balance</span>
        <strong>{typeof balanceCredits === "number" ? `${balanceCredits.toFixed(2)} cr` : "unchecked"}</strong>
        <small>{totalActualCredits.toFixed(2)} cr logged</small>
      </div>
      <button onClick={onCheckBalance} disabled={isCheckingBalance}>
        <RefreshCcw className={isCheckingBalance ? "spin" : ""} size={15} />
        Check
      </button>
    </div>
  );
}
