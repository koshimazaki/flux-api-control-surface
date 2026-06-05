"use client";
import { BackgroundShader } from "@/components/background-shader";
import { DashboardPanels } from "@/components/dashboard/dashboard-panels";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { DashboardStats } from "@/components/dashboard-stats";
import { Lightbox } from "@/components/lightbox";
import { TopBar } from "@/components/top-bar";
import { useDashboardState } from "@/lib/use-dashboard-state";

export default function Home() {
  const state = useDashboardState();
  return (
    <>
      <BackgroundShader />
      <main className="shell">
        <TopBar apiKey={state.apiKey} onApiKeyChange={state.setApiKey} />
        <DashboardStats
          assetCount={state.assets.length}
          promptCount={state.prompts.length}
          selectedPromptCount={state.selectedComboIds.length}
          runCount={state.runLog.length}
          failedRunCount={state.failedRunCount}
          totalActualCredits={state.totalActualCredits}
          estimatedBatchCredits={state.batchTotalEstimate}
          balanceCredits={state.balance.credits}
          batchCount={state.batchCount}
          promptTokens={state.promptTokens}
          outputMegapixels={state.outputMegapixels}
          isCheckingBalance={state.isCheckingBalance}
          lastRunAt={state.runLog[0]?.timestamp}
          onCheckBalance={state.checkBalance}
        />
        <DashboardWorkspace state={state} />
        {state.recoveryMessage && <p className="statusLine">{state.recoveryMessage}</p>}
        <DashboardPanels state={state} />
        <Lightbox
          asset={state.selectedAsset}
          onClose={() => state.setSelectedAsset(null)}
          onSendToPrompt={state.sendAssetToPrompt}
          onSendToReference={state.sendAssetToReference}
          onDownload={state.downloadAssetImage}
        />
      </main>
    </>
  );
}
