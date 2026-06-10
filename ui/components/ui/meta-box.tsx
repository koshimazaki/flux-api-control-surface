import type { ReactNode } from "react";

type MetaBoxProps = {
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

export function MetaBox({ label, value, className }: MetaBoxProps) {
  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
