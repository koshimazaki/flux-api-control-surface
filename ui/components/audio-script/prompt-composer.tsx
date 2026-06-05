import { Clipboard, Wand2 } from "lucide-react";
import { clamp } from "@/lib/audio-script";
import type { VideoTarget } from "./types";

type PromptComposerProps = {
  videoTarget: VideoTarget;
  maxImageGuides: number;
  uniqueImageGuideCount: number;
  estimatedVideoParts: number;
  scriptSetup: string;
  qualityBoosters: string;
  generatedPrompt: string;
  hasMarkers: boolean;
  onUpdateVideoTarget: (value: VideoTarget) => void;
  onSetVideoTarget: (value: VideoTarget) => void;
  onSetMaxImageGuides: (value: number) => void;
  onSetScriptSetup: (value: string) => void;
  onSetQualityBoosters: (value: string) => void;
  onSetGeneratedPrompt: (value: string) => void;
  onGeneratePrompt: () => string;
  onUsePrompt: (prompt: string) => void;
};

export function PromptComposer(props: PromptComposerProps) {
  const {
    videoTarget,
    maxImageGuides,
    uniqueImageGuideCount,
    estimatedVideoParts,
    scriptSetup,
    qualityBoosters,
    generatedPrompt,
    hasMarkers,
    onUpdateVideoTarget,
    onSetVideoTarget,
    onSetMaxImageGuides,
    onSetScriptSetup,
    onSetQualityBoosters,
    onSetGeneratedPrompt,
    onGeneratePrompt,
    onUsePrompt
  } = props;

  return (
    <div className="audioPromptComposer">
      <div className="audioPromptGuides">
        <div className="audioModelGuideControls">
          <label>
            Video target
            <select value={videoTarget} onChange={(event) => onUpdateVideoTarget(event.target.value as VideoTarget)}>
              <option value="seedance">Seedance 2.0</option>
              <option value="kling">Kling</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Image guides
            <input
              type="number"
              min={1}
              max={24}
              step={1}
              value={maxImageGuides}
              onChange={(event) => {
                onSetVideoTarget("custom");
                onSetMaxImageGuides(clamp(Math.round(Number(event.target.value) || 1), 1, 24));
              }}
            />
          </label>
          <small>
            {uniqueImageGuideCount} used refs to {estimatedVideoParts} video{estimatedVideoParts === 1 ? "" : "s"}
          </small>
        </div>
        <label>
          Setup
          <textarea value={scriptSetup} onChange={(event) => onSetScriptSetup(event.target.value)} />
        </label>
        <label>
          Style & quality boosters
          <textarea value={qualityBoosters} onChange={(event) => onSetQualityBoosters(event.target.value)} />
        </label>
      </div>
      <div className="runLogHeader">
        <span>Generated prompt</span>
        <div>
          <button onClick={onGeneratePrompt} disabled={!hasMarkers}>
            <Wand2 size={15} />
            Generate
          </button>
          <button onClick={() => onUsePrompt(generatedPrompt || onGeneratePrompt())} disabled={!hasMarkers}>
            <Clipboard size={15} />
            Use prompt
          </button>
        </div>
      </div>
      <textarea value={generatedPrompt} onChange={(event) => onSetGeneratedPrompt(event.target.value)} placeholder="Audio shot script" />
    </div>
  );
}
