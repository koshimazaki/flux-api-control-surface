import { Eraser, Fingerprint, Focus, Images, Maximize2, MessageSquareText, PencilLine, ScanLine, Shirt, Sparkles, Video, WandSparkles } from "lucide-react";
import { TabButtonBar, type TabButtonItem } from "@/components/ui/tab-button-bar";
import type { Flux3SourceMode } from "@/lib/flux3-video";
import type { WorkspaceMode } from "@/lib/types";
import {
  IMAGE_WORKSPACE_MODES,
  videoToolTabForWorkspace,
  workspaceForVideoToolTab,
  workspaceMediaKindForMode,
  type VideoToolTab
} from "@/lib/workspace-media";

const imageModes: TabButtonItem<WorkspaceMode>[] = [
  { id: "flux3_image", label: "FLUX 3 Image", icon: WandSparkles },
  { id: "prompt", label: "FLUX 2", icon: Sparkles },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "outpaint", label: "Outpaint", icon: Maximize2 },
  { id: "deblur", label: "Deblur", icon: Focus },
  { id: "vto", label: "VTO", icon: Shirt },
  { id: "glyphs", label: "Glyphs", icon: Fingerprint }
];

// One tab per video tool, like the image rail. Text, Frames and Continue are
// FLUX 3's source modes and open the one FLUX 3 workspace; Edit and Upscale
// are separate FLUX tools with their own endpoints.
const videoTabs: TabButtonItem<VideoToolTab>[] = [
  { id: "t2v", label: "Text", icon: MessageSquareText },
  { id: "i2v", label: "Frames", icon: Images },
  { id: "v2v", label: "Continue", icon: Video },
  { id: "edit", label: "Edit", icon: PencilLine },
  { id: "upscale", label: "Upscale", icon: ScanLine }
];

// FLUX 3 Image shows only behind its flag.
const imageItems = imageModes.filter((mode) => IMAGE_WORKSPACE_MODES.includes(mode.id));
// Both rails share one track count, so a seventh image tool widens both together.
const railClass = imageItems.length > 6 ? " workspaceModeBar-seven" : "";

type WorkspaceModeTabsProps = {
  value: WorkspaceMode;
  flux3SourceMode: Flux3SourceMode;
  onChange: (mode: WorkspaceMode) => void;
  onFlux3SourceModeChange: (mode: Flux3SourceMode) => void;
};

export function WorkspaceModeTabs({ value, flux3SourceMode, onChange, onFlux3SourceModeChange }: WorkspaceModeTabsProps) {
  if (workspaceMediaKindForMode(value) === "video") {
    return (
      <TabButtonBar
        items={videoTabs}
        value={videoToolTabForWorkspace(value, flux3SourceMode)}
        onChange={(tab) => {
          const target = workspaceForVideoToolTab(tab);
          if (target.flux3SourceMode) onFlux3SourceModeChange(target.flux3SourceMode);
          onChange(target.workspaceMode);
        }}
        className={`workspaceModeBar workspaceModeBar-video${railClass}`}
        iconSize={18}
        ariaLabel="Video tools"
      />
    );
  }
  return (
    <TabButtonBar
      items={imageItems}
      value={value}
      onChange={onChange}
      className={`workspaceModeBar workspaceModeBar-image${railClass}`}
      iconSize={18}
      ariaLabel="Image tools"
    />
  );
}
