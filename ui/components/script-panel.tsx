import { ListChecks, Play, RotateCcw, Wand2 } from "lucide-react";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import type { PromptRecord } from "@/lib/types";

type ScriptPanelProps = {
  prompts: PromptRecord[];
  selectedIds: string[];
  pairCount: number;
  estimatedCredits: number;
  isGenerating: boolean;
  onToggleSelected: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRunScript: () => void;
};

function buildPairs(prompts: PromptRecord[]) {
  const pairs: Array<[PromptRecord, PromptRecord]> = [];
  for (let left = 0; left < prompts.length; left += 1) {
    for (let right = left + 1; right < prompts.length; right += 1) {
      pairs.push([prompts[left], prompts[right]]);
    }
  }
  return pairs;
}

export function ScriptPanel(props: ScriptPanelProps) {
  const selectedPrompts = props.prompts.filter((prompt) => props.selectedIds.includes(prompt.id));
  const pairs = buildPairs(selectedPrompts);

  return (
    <section className="assetsPanel scriptPanel">
      <PanelHeader title="Script Mode" subtitle="Choose sources, then run each selected prompt pair once.">
        <div className="assetActions">
          <button onClick={props.onSelectAll}>
            <ListChecks size={16} />
            Select all
          </button>
          <button onClick={props.onClearSelection} disabled={!props.selectedIds.length}>
            <RotateCcw size={16} />
            Clear
          </button>
          <button onClick={props.onRunScript} disabled={props.pairCount < 1 || props.isGenerating}>
            <Play size={16} />
            Run pairs
          </button>
        </div>
      </PanelHeader>

      <div className="scriptGrid">
        <div className="scriptSourcePanel">
          <div className="runLogHeader">
            <span>Permutation sources</span>
            <small>{props.selectedIds.length} / {props.prompts.length} selected</small>
          </div>
          <div className="scriptPromptGrid">
            {props.prompts.map((prompt) => {
              const selected = props.selectedIds.includes(prompt.id);
              return (
                <button
                  key={prompt.id}
                  className={selected ? "scriptPromptChip selected" : "scriptPromptChip"}
                  onClick={() => props.onToggleSelected(prompt.id)}
                  title={prompt.id}
                >
                  <strong>{prompt.id}</strong>
                  <small>{prompt.species || prompt.location || "prompt"}</small>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="scriptPlanPanel">
          <div className="scriptPlanHero">
            <Wand2 size={18} />
            <span>Pair script</span>
            <strong>{props.pairCount}</strong>
            <small>{props.estimatedCredits.toFixed(2)} cr minimum estimate</small>
          </div>
          <div className="scriptStats">
            <MetaBox label="Pair size" value="2" />
            <MetaBox label="Runs" value={props.pairCount} />
            <MetaBox label="Mode" value="once each" />
          </div>
          <div className="runLogHeader scriptPairsHeader">
            <span>Pair preview</span>
            <small>{pairs.length > 12 ? `first 12 of ${pairs.length}` : `${pairs.length} total`}</small>
          </div>
          <div className="scriptPairList">
            {pairs.slice(0, 12).map(([left, right]) => (
              <div key={`${left.id}-${right.id}`}>
                <span>{left.id}</span>
                <small>x</small>
                <span>{right.id}</span>
              </div>
            ))}
            {!pairs.length && <div className="scriptEmpty">Select at least two prompt sources.</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
