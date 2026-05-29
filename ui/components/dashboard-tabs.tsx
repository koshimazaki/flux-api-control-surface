import type { ReactNode } from "react";
import { Activity, Image, PackageOpen, PlugZap, Route } from "lucide-react";
import type { DashboardTab } from "@/lib/types";

type DashboardTabsProps = {
  activeTab: DashboardTab;
  assetCount: number;
  runCount: number;
  collectionCount: number;
  onTabChange: (tab: DashboardTab) => void;
  assets: ReactNode;
  runs: ReactNode;
  collections: ReactNode;
  apis: ReactNode;
  mcp: ReactNode;
};

export function DashboardTabs(props: DashboardTabsProps) {
  const tabs = [
    { id: "assets" as const, label: "Library", count: props.assetCount, icon: Image },
    { id: "collections" as const, label: "Collections", count: props.collectionCount, icon: PackageOpen },
    { id: "runs" as const, label: "Run Log", count: props.runCount, icon: Activity },
    { id: "apis" as const, label: "APIs", count: null, icon: Route },
    { id: "mcp" as const, label: "MCP", count: null, icon: PlugZap }
  ];

  return (
    <section className="dashboardTabs">
      <div className="tabBar">
        {tabs.map(({ id, label, count, icon: Icon }) => (
          <button
            className={props.activeTab === id ? "tabButton active" : "tabButton"}
            key={id}
            onClick={() => props.onTabChange(id)}
          >
            <Icon size={16} />
            {label}
            {typeof count === "number" && <span>{count}</span>}
          </button>
        ))}
      </div>

      {props.activeTab === "assets" && props.assets}
      {props.activeTab === "collections" && props.collections}
      {props.activeTab === "runs" && props.runs}
      {props.activeTab === "apis" && props.apis}
      {props.activeTab === "mcp" && props.mcp}
    </section>
  );
}
