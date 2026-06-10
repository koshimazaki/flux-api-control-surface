import type { ReactNode } from "react";

type PanelHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
};

export function PanelHeader({ title, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="panelHeader">
      {subtitle ? (
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      ) : (
        <h2>{title}</h2>
      )}
      {children}
    </div>
  );
}
