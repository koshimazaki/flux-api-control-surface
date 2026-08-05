"use client";

import { Film, Images } from "lucide-react";
import { useState } from "react";
import { ImageScriptPanel, type ImageScriptPanelProps } from "@/components/script/image-script-panel";
import { VideoScriptPanel, type VideoScriptPanelProps } from "@/components/video-script/panel";
import { TabButtonBar, type TabButtonItem } from "@/components/ui/tab-button-bar";

type ScriptSubTab = "image" | "video";

type ScriptPanelProps = {
  image: ImageScriptPanelProps;
  video: VideoScriptPanelProps;
};

/**
 * Thin shell for the Script surface. The image pair workflow and the FLUX.3
 * Video Script are sibling sub-tabs; this component only chooses between them.
 */
export function ScriptPanel(props: ScriptPanelProps) {
  const [subTab, setSubTab] = useState<ScriptSubTab>("image");
  const tabs: TabButtonItem<ScriptSubTab>[] = [
    { id: "image", label: "Image", count: props.image.pairCount, icon: Images },
    { id: "video", label: "Video", count: null, icon: Film }
  ];

  return (
    <section className="assetsPanel scriptPanel">
      <TabButtonBar className="scriptSubTabs" items={tabs} value={subTab} onChange={setSubTab} />
      {subTab === "image" ? <ImageScriptPanel {...props.image} /> : <VideoScriptPanel {...props.video} />}
    </section>
  );
}
