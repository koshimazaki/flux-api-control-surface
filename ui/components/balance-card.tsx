import { RefreshCcw } from "lucide-react";

type BalanceCardProps = {
  balanceCredits: number | null;
  totalActualCredits: number;
  isCheckingBalance: boolean;
  onCheckBalance: () => void;
  compact?: boolean;
};

export function BalanceCard({
  balanceCredits,
  totalActualCredits,
  isCheckingBalance,
  onCheckBalance,
  compact = false
}: BalanceCardProps) {
  if (compact) {
    return (
      <div
        className="statCard balanceStat statToneBalance compactBalance"
        title={`${totalActualCredits.toFixed(2)} credits logged locally`}
      >
        <span>Balance</span>
        <strong>{typeof balanceCredits === "number" ? `${balanceCredits.toFixed(2)} cr` : "unchecked"}</strong>
        <button onClick={onCheckBalance} disabled={isCheckingBalance} title="Check FLUX credit balance" aria-label="Check FLUX credit balance">
          <RefreshCcw className={isCheckingBalance ? "spin" : ""} size={13} />
        </button>
      </div>
    );
  }

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
