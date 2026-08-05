import { Minus, Plus, RefreshCw, Rows3, Shuffle, Trash2 } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { VideoScriptAssetSlot } from "@/components/video-script/asset-slot";
import { VideoScriptRow } from "@/components/video-script/row";
import { assetPreviewSrc } from "@/lib/video-script/sources";
import type { AssetRecord } from "@/lib/types";
import type {
  VideoScriptPlan,
  VideoScriptSequenceMode,
  VideoScriptSlotBinding,
  VideoScriptSlotStrategy
} from "@/lib/video-script-plan";
import { MAX_VIDEO_SCRIPT_SLOTS, type VideoScriptEditorState } from "@/lib/video-script/types";

/**
 * Keyframe matrix.
 *
 * Two drop targets, deliberately different: the column header binds a pool or a
 * pinned image to a keyframe position for generation, and a cell overrides one
 * row. The generator above the matrix is presented as the PRD's two workflows —
 * sequence-from-one-pool, or per-slot pools with one strategy toggle — never a
 * flat nine-mode menu.
 */
export type VideoScriptMatrixProps = {
  state: VideoScriptEditorState;
  assets: Map<string, AssetRecord>;
  generatorPlan: VideoScriptPlan;
  batchPlan: VideoScriptPlan;
  onChange: (next: VideoScriptEditorState) => void;
  onBindColumn: (slotIndex: number, binding: VideoScriptSlotBinding) => void;
  onSetSlot: (rowId: string, slotIndex: number, assetId: string | null) => void;
  onMoveSlot: (rowId: string, from: number, to: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onResetRowEdits: (rowId: string) => void;
  onReorderRow: (from: number, to: number) => void;
  onEditRowTiming: (rowId: string) => void;
  onAddRow: () => void;
  onRegenerate: () => void;
  onDiscardEdited: () => void;
  onSetSlotCount: (slotCount: number) => void;
};

const SEQUENCE_MODES: Array<{ id: VideoScriptSequenceMode; label: string; detail: string }> = [
  { id: "combination", label: "Combinations", detail: "unordered picks of N images" },
  { id: "arrangement", label: "Arrangements", detail: "ordered permutations" },
  { id: "rotation", label: "Rotations", detail: "one chain per starting image" }
];

const STRATEGIES: Array<{ id: VideoScriptSlotStrategy; label: string; detail: string }> = [
  { id: "cartesian", label: "Cartesian", detail: "every combination of the varying slots" },
  { id: "zip", label: "Zip by index", detail: "pools advance together" },
  { id: "sample", label: "Seeded sample", detail: "repeatable random draw" }
];

function columnLabel(binding: VideoScriptSlotBinding, poolLabel?: string) {
  if (binding.kind === "pool") return poolLabel || binding.poolId;
  if (binding.kind === "pinned") return "pinned";
  return "manual";
}

export function VideoScriptMatrix(props: VideoScriptMatrixProps) {
  const { state } = props;
  const editedCount = state.rows.filter((row) => row.edited).length;
  const timing = state.timingMode === "timed" ? state.timingTemplate : undefined;
  const planRows = new Map(props.batchPlan.rows.map((row) => [row.sourceRowId, row]));

  return (
    <section className="videoScriptMatrix">
      <div className="videoScriptGenerator">
        <div className="videoScriptWorkflowTabs">
          <button
            type="button"
            className={state.workflow === "sequence" ? "active" : ""}
            onClick={() => props.onChange({ ...state, workflow: "sequence" })}
          >
            <Rows3 size={14} />
            Sequence from one pool
          </button>
          <button
            type="button"
            className={state.workflow === "per-slot" ? "active" : ""}
            onClick={() => props.onChange({ ...state, workflow: "per-slot" })}
          >
            <Shuffle size={14} />
            Per-slot pools
          </button>
        </div>

        {state.workflow === "sequence" ? (
          <div className="videoScriptWorkflowBody">
            <label>
              <span>Pool</span>
              <select
                value={state.sequencePoolId}
                onChange={(event) => props.onChange({ ...state, sequencePoolId: event.target.value })}
              >
                <option value="">Choose a pool</option>
                {state.pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.label} ({pool.assetIds.length})
                  </option>
                ))}
              </select>
            </label>
            <div className="videoScriptChoiceRow">
              {SEQUENCE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={state.sequenceMode === mode.id ? "active" : ""}
                  onClick={() => props.onChange({ ...state, sequenceMode: mode.id })}
                  title={mode.detail}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="videoScriptWorkflowBody">
            <div className="videoScriptChoiceRow">
              {STRATEGIES.map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  className={state.strategy === strategy.id ? "active" : ""}
                  onClick={() => props.onChange({ ...state, strategy: strategy.id })}
                  title={strategy.detail}
                >
                  {strategy.label}
                </button>
              ))}
            </div>
            {state.strategy === "sample" && (
              <label>
                <span>Sample rows</span>
                <NumberField
                  min={1}
                  max={state.hardCap}
                  value={state.sampleSize}
                  onCommit={(value) => props.onChange({ ...state, sampleSize: value })}
                />
              </label>
            )}
          </div>
        )}

        <div className="videoScriptGeneratorFoot">
          <small>
            This configuration expands to {props.generatorPlan.preview.rawRowCount} rows →{" "}
            {props.generatorPlan.preview.uniqueRowCount} unique → {props.generatorPlan.preview.cappedRowCount} after the cap.
          </small>
          <div>
            <button type="button" onClick={props.onRegenerate}>
              <RefreshCw size={13} />
              Regenerate rows
            </button>
            <button type="button" onClick={props.onDiscardEdited} disabled={!editedCount} title="Discard edited rows">
              <Trash2 size={13} />
              Discard {editedCount} edited
            </button>
          </div>
        </div>
        {editedCount > 0 && (
          <small className="videoScriptProtected">
            {editedCount} edited {editedCount === 1 ? "row is" : "rows are"} protected: Regenerate replaces only unedited rows.
          </small>
        )}
      </div>

      <div className="videoScriptColumns" style={{ ["--video-script-slots" as string]: state.slotCount }}>
        <span className="videoScriptColumnsLead">Slot pools</span>
        {Array.from({ length: state.slotCount }, (_, slotIndex) => {
          const binding = state.columns[slotIndex] || { kind: "manual" as const };
          const pool = binding.kind === "pool" ? state.pools.find((entry) => entry.id === binding.poolId) : undefined;
          const pinnedId = binding.kind === "pinned" ? binding.assetId : null;
          return (
            <VideoScriptAssetSlot
              key={slotIndex}
              variant="column"
              assetId={pinnedId}
              previewSrc={pinnedId ? assetPreviewSrc(props.assets.get(pinnedId), pinnedId) : undefined}
              label={`Slot ${slotIndex + 1}`}
              hint={columnLabel(binding, pool ? `${pool.label} (${pool.assetIds.length})` : undefined)}
              highlighted={binding.kind !== "manual"}
              title="Drop a pool to vary this position, or an image to pin it"
              onDropPool={(poolId) => props.onBindColumn(slotIndex, { kind: "pool", poolId })}
              onDropAsset={(assetId) => props.onBindColumn(slotIndex, { kind: "pinned", assetId })}
              onClear={binding.kind !== "manual" ? () => props.onBindColumn(slotIndex, { kind: "manual" }) : undefined}
            />
          );
        })}
      </div>

      <div className="videoScriptSlotCount">
        <button
          type="button"
          onClick={() => props.onSetSlotCount(state.slotCount - 1)}
          disabled={state.slotCount <= 1}
          title="Remove a keyframe position"
        >
          <Minus size={13} />
        </button>
        <span>
          {state.slotCount} of {MAX_VIDEO_SCRIPT_SLOTS} keyframes
        </span>
        <button
          type="button"
          onClick={() => props.onSetSlotCount(state.slotCount + 1)}
          disabled={state.slotCount >= MAX_VIDEO_SCRIPT_SLOTS}
          title="Add a keyframe position"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="videoScriptRows">
        {state.rows.map((row, index) => (
          <VideoScriptRow
            key={row.id}
            row={row}
            index={index}
            slotCount={state.slotCount}
            assets={props.assets}
            planRow={planRows.get(row.id)}
            timing={timing}
            onSetSlot={(slotIndex, assetId) => props.onSetSlot(row.id, slotIndex, assetId)}
            onMoveSlot={(from, to) => props.onMoveSlot(row.id, from, to)}
            onDuplicate={() => props.onDuplicateRow(row.id)}
            onDelete={() => props.onDeleteRow(row.id)}
            onResetEdits={() => props.onResetRowEdits(row.id)}
            onReorder={props.onReorderRow}
            onEditTiming={() => props.onEditRowTiming(row.id)}
          />
        ))}
        {!state.rows.length && <div className="scriptEmpty">Bind a pool to a slot, then Regenerate rows.</div>}
      </div>

      <button type="button" className="videoScriptAddRow" onClick={props.onAddRow}>
        <Plus size={14} />
        Add row
      </button>
    </section>
  );
}
