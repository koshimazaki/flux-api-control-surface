import { Image, Plus, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import {
  bandLabels,
  colorForBand,
  eventLabels,
  formatSeconds,
  formatStrength,
  type AudioShot
} from "@/lib/audio-script";
import type { AudioAnalysisResult, AudioBandKey, AudioEventKind, AudioMarker } from "@/lib/audio-analysis";

type ShotRowData = { marker: AudioMarker; shot: AudioShot };

type ShotListProps = {
  shotRows: ShotRowData[];
  markers: AudioMarker[];
  selectedMarkerId: string;
  lockedMarkerIds: Set<string>;
  analysis: AudioAnalysisResult | null;
  durationSeconds: number;
  startSeconds: number;
  onSelectMarker: (markerId: string) => void;
  onRowDrop: (markerId: string, event: DragEvent<HTMLElement>) => void;
  onAddTimingSpot: () => void;
  onRemoveTimingSpot: (markerId: string) => void;
  onMoveMarker: (markerId: string, relativeTime: number) => void;
  onUpdateMarker: (markerId: string, patch: Partial<AudioMarker>) => void;
  onUpdateShot: (markerId: string, patch: Partial<AudioShot>) => void;
  onOpenShotImage: (shot: AudioShot) => void;
};

export function ShotList(props: ShotListProps) {
  const {
    shotRows,
    markers,
    selectedMarkerId,
    lockedMarkerIds,
    analysis,
    durationSeconds,
    startSeconds,
    onSelectMarker,
    onRowDrop,
    onAddTimingSpot,
    onRemoveTimingSpot,
    onMoveMarker,
    onUpdateMarker,
    onUpdateShot,
    onOpenShotImage
  } = props;

  return (
    <div className="audioShotList">
      <div className="runLogHeader audioShotListHeader">
        <span>Timing spots</span>
        <div>
          <small>{markers.length} rows</small>
          <button onClick={onAddTimingSpot}>
            <Plus size={15} />
            Add spot
          </button>
        </div>
      </div>
      {shotRows.map(({ marker, shot }, index) => (
        <article
          className={`audioShotRow${marker.id === selectedMarkerId ? " selected" : ""}${lockedMarkerIds.has(marker.id) ? " locked" : ""}`}
          key={marker.id}
          onClick={() => onSelectMarker(marker.id)}
          onDrop={(event) => void onRowDrop(marker.id, event)}
          onDragOver={(event) => event.preventDefault()}
        >
          <div className="audioShotMeta">
            <strong>{String(index + 1).padStart(2, "0")}</strong>
            <input
              type="number"
              min={analysis?.start || 0}
              max={(analysis?.start || 0) + (analysis?.analyzedDuration || durationSeconds)}
              step={0.01}
              value={formatSeconds(marker.time, 2)}
              onChange={(event) => onMoveMarker(marker.id, (Number(event.target.value) || 0) - (analysis?.start || startSeconds))}
            />
            <small>{formatStrength(marker.confidence)}</small>
            <button onClick={() => onRemoveTimingSpot(marker.id)} title="Remove timing spot">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="audioShotImage">
            {shot.imageDataUrl ? (
              <button
                type="button"
                className="audioShotImageButton"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenShotImage(shot);
                }}
                title="Open image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.imageDataUrl} alt={shot.imageName || shot.id} />
              </button>
            ) : (
              <Image size={18} />
            )}
            <span>{shot.imageName || "Image"}</span>
          </div>
          <div className="audioShotFields">
            <div className="audioShotSelects">
              <select
                value={marker.kind}
                onChange={(event) => onUpdateMarker(marker.id, { kind: event.target.value as AudioEventKind })}
              >
                {Object.entries(eventLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={marker.band}
                onChange={(event) => onUpdateMarker(marker.id, { band: event.target.value as AudioBandKey })}
              >
                {Object.entries(bandLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <span style={{ color: colorForBand(marker.band) }}>
                L {formatStrength(marker.low)} / M {formatStrength(marker.mid)} / H {formatStrength(marker.high)}
              </span>
            </div>
            <textarea
              value={shot.prompt}
              onChange={(event) => onUpdateShot(marker.id, { prompt: event.target.value })}
              placeholder="Beat action prompt"
            />
            <textarea
              className="audioImagePromptInput"
              value={shot.imagePrompt}
              onChange={(event) => onUpdateShot(marker.id, { imagePrompt: event.target.value })}
              placeholder="@img source prompt/caption"
            />
          </div>
        </article>
      ))}
      {!markers.length && <div className="emptyState">Analyze an audio segment to create timing rows.</div>}
    </div>
  );
}
