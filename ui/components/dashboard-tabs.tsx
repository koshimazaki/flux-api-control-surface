import type { ReactNode } from "react";
import { Activity, Image, ListChecks, Music, PackageOpen, PlugZap, Route } from "lucide-react";
import { TabButtonBar, type TabButtonItem } from "@/components/ui/tab-button-bar";
import type { DashboardTab } from "@/lib/types";

type DashboardTabsProps = {
  activeTab: DashboardTab;
  assetCount: number;
  runCount: number;
  collectionCount: number;
  scriptCount: number;
  onTabChange: (tab: DashboardTab) => void;
  script: ReactNode;
  audio: ReactNode;
  assets: ReactNode;
  runs: ReactNode;
  collections: ReactNode;
  apis: ReactNode;
  mcp: ReactNode;
};

export function DashboardTabs(props: DashboardTabsProps) {
  const tabs: TabButtonItem<DashboardTab>[] = [
    { id: "assets", label: "Assets", count: props.assetCount, icon: Image },
    { id: "collections", label: "Training", count: props.collectionCount, icon: PackageOpen },
    { id: "runs", label: "Run Log", count: props.runCount, icon: Activity },
    { id: "apis", label: "APIs", count: null, icon: Route },
    { id: "mcp", label: "MCP", count: null, icon: PlugZap },
    { id: "script", label: "Script", count: props.scriptCount, icon: ListChecks },
    { id: "audio", label: "Audio", count: null, icon: Music }
  ];

  return (
    <section className="dashboardTabs">
      <TabButtonBar items={tabs} value={props.activeTab} onChange={props.onTabChange} />

      {props.activeTab === "script" && props.script}
      {props.activeTab === "audio" && props.audio}
      {props.activeTab === "assets" && props.assets}
      {props.activeTab === "collections" && props.collections}
      {props.activeTab === "runs" && props.runs}
      {props.activeTab === "apis" && props.apis}
      {props.activeTab === "mcp" && props.mcp}
    </section>
  );
}
