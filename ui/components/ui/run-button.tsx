import { LoaderCircle, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type RunButtonProps = {
  isRunning: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
};

export function RunButton({ isRunning, onClick, children, icon: Icon = Play, disabled }: RunButtonProps) {
  return (
    <button className="generateButton" onClick={onClick} disabled={disabled || isRunning}>
      {isRunning ? <LoaderCircle className="spin" size={18} /> : <Icon size={18} />}
      {children}
    </button>
  );
}
