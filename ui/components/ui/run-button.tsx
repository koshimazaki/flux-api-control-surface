import { Play } from "lucide-react";
import { CubeLoader } from "./cube-loader";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type RunButtonProps = {
  isRunning: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  disableWhenRunning?: boolean;
  variant?: "primary" | "plain";
  className?: string;
};

export function RunButton({ isRunning, onClick, children, icon: Icon = Play, disabled, disableWhenRunning = true, variant = "primary", className }: RunButtonProps) {
  return (
    <button type="button" className={["runAction", variant === "primary" ? "generateButton" : "", className].filter(Boolean).join(" ")} onClick={onClick} disabled={disabled || (disableWhenRunning && isRunning)} aria-busy={isRunning}>
      {isRunning ? <CubeLoader /> : <Icon size={18} />}
      {children}
    </button>
  );
}
