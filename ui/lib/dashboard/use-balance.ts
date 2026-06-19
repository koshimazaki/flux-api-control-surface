import { useState } from "react";
import type { BalanceState } from "@/lib/types";

export function useBalance(apiKey: string) {
  const [balance, setBalance] = useState<BalanceState>({ credits: null });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  async function checkBalance() {
    setIsCheckingBalance(true);
    try {
      const response = await fetch("/api/bfl/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not fetch balance");
      setBalance({ credits: data.credits, checkedAt: Date.now() });
    } catch (err) {
      setBalance({ credits: null, error: err instanceof Error ? err.message : "Could not fetch balance" });
    } finally {
      setIsCheckingBalance(false);
    }
  }

  return { balance, setBalance, isCheckingBalance, checkBalance };
}
