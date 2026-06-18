import type { ChangeEvent, DragEvent, PointerEvent, RefObject } from "react";
import type { AudioAnalysisResult, AudioMarker } from "@/lib/audio-analysis";
import type { AudioShot, ImageOption } from "@/lib/audio-script";
import { AnalyzeControls } from "@/components/audio-script/analyze-controls";
import { AudioDropzone } from "@/components/audio-script/audio-dropzone";
import { ImagePool } from "@/components/audio-script/image-pool";
import { PanelHeader } from "@/components/audio-script/panel-header";
import { PromptComposer } from "@/components/audio-script/prompt-composer";
import { ShotList } from "@/components/audio-script/shot-list";
import { SliceControls } from "@/components/audio-script/slice-controls";
import type { AudioExportFormat, AudioScriptPanelProps, VideoTarget } from "@/components/audio-script/types";
import { WaveformShell } from "@/components/audio-script/waveform-shell";
import { WaveformToolbar } from "@/components/audio-script/waveform-toolbar";

type ShotRow = {
  marker: AudioMarker;
  shot: AudioShot;
};

type AudioScriptPanelViewProps = Pick<AudioScriptPanelProps, "onUsePrompt" | "onSavePrompt"> & {
  audioRef: RefObject<HTMLAudioElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  waveformTrackRef: RefObject<HTMLDivElement | null>;
  sliceOverlayRef: RefObject<HTMLDivElement | null>;
  audioFileName?: string;
  audioUrl: string;
  audioDuration: number;
  analysis: AudioAnalysisResult | null;
  markers: AudioMarker[];
  shotRows: ShotRow[];
  selectedMarkerId: string;
  lockedMarkerIds: Set<string>;
  startSeconds: number;
  durationSeconds: number;
  sliceStartSeconds: number;
  sliceEndSeconds: number;
  currentTime: number;
  isPlaying: boolean;
  previewLoop: boolean;
  exportLoopCount: number;
  exportingFormat: AudioExportFormat | "";
  isRenderingGuide: boolean;
  shotCount: number;
  isAnalyzing: boolean;
  error: string;
  videoTarget: VideoTarget;
  maxImageGuides: number;
  scriptSetup: string;
  qualityBoosters: string;
  generatedPrompt: string;
  zoom: number;
  startDraft: string;
  endDraft: string;
  imageOptions: ImageOption[];
  sliceStartPercent: number;
  sliceEndPercent: number;
  playheadPercent: number;
  sliceDuration: number;
  uniqueImageGuideCount: number;
  estimatedVideoParts: number;
  selectedMarkerLocked: boolean;
  onAudioInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onReset: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onDropFiles: (files: File[]) => void;
  onLoadedMetadata: (duration: number, time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onSeeked: (time: number) => void;
  onTimeUpdate: () => void;
  onTogglePlayback: () => void;
  onSeek: (seconds: number) => void;
  onSetStartSeconds: (value: number) => void;
  onSetDurationSeconds: (value: number) => void;
  onSetShotCount: (value: number) => void;
  onSetStartDraft: (value: string) => void;
  onSetEndDraft: (value: string) => void;
  onSetStartFocused: (value: boolean) => void;
  onSetEndFocused: (value: boolean) => void;
  onCommitSliceDraft: (boundary: "start" | "end") => void;
  onSetExportLoopCount: (value: number) => void;
  onSetPreviewLoop: (value: boolean) => void;
  onPlaySlice: () => void;
  onExportSlice: (format: AudioExportFormat) => void;
  onExportGuide: () => void;
  onZoom: (direction: 1 | -1) => void;
  onToggleMarkerLock: () => void;
  onWaveformPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onWaveformPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onWaveformPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onSliceHandlePointerDown: (boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onSliceHandlePointerMove: (boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onSliceHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onSelectMarker: (markerId: string) => void;
  onRowDrop: (markerId: string, event: DragEvent<HTMLElement>) => void | Promise<void>;
  onAddTimingSpot: () => void;
  onRemoveTimingSpot: (markerId: string) => void;
  onMoveMarker: (markerId: string, relativeTime: number) => void;
  onUpdateMarker: (markerId: string, patch: Partial<AudioMarker>) => void;
  onUpdateShot: (markerId: string, patch: Partial<AudioShot>) => void;
  onOpenShotImage: (shot: AudioShot) => void;
  onOpenImageOption: (option: ImageOption) => void;
  onAssignImage: (markerId: string, option: ImageOption) => void;
  onUpdateVideoTarget: (value: VideoTarget) => void;
  onSetVideoTarget: (value: VideoTarget) => void;
  onSetMaxImageGuides: (value: number) => void;
  onSetScriptSetup: (value: string) => void;
  onSetQualityBoosters: (value: string) => void;
  onSetGeneratedPrompt: (value: string) => void;
  onGeneratePrompt: () => string;
};

export function AudioScriptPanelView(props: AudioScriptPanelViewProps) {
  return (
    <section className="assetsPanel audioScriptPanel">
      <PanelHeader
        analysis={props.analysis}
        markerCount={props.markers.length}
        hasAudioFile={Boolean(props.audioFileName)}
        isAnalyzing={props.isAnalyzing}
        hasMarkers={props.markers.length > 0}
        canReset={Boolean(props.analysis) || props.markers.length > 0}
        onAudioInput={props.onAudioInput}
        onAnalyze={props.onAnalyze}
        onReset={props.onReset}
        onCopy={props.onCopy}
        onDownload={props.onDownload}
      />

      <AudioDropzone
        audioRef={props.audioRef}
        audioFileName={props.audioFileName}
        audioUrl={props.audioUrl}
        audioDuration={props.audioDuration}
        currentTime={props.currentTime}
        isPlaying={props.isPlaying}
        onDropFiles={props.onDropFiles}
        onLoadedMetadata={props.onLoadedMetadata}
        onPlay={props.onPlay}
        onPause={props.onPause}
        onEnded={props.onEnded}
        onSeeked={props.onSeeked}
        onTimeUpdate={props.onTimeUpdate}
        onTogglePlayback={props.onTogglePlayback}
        onSeek={props.onSeek}
      />

      <AnalyzeControls
        startSeconds={props.startSeconds}
        durationSeconds={props.durationSeconds}
        shotCount={props.shotCount}
        onSetStartSeconds={props.onSetStartSeconds}
        onSetDurationSeconds={props.onSetDurationSeconds}
        onSetShotCount={props.onSetShotCount}
      />

      <SliceControls
        startDraft={props.startDraft}
        endDraft={props.endDraft}
        exportLoopCount={props.exportLoopCount}
        previewLoop={props.previewLoop}
        sliceDuration={props.sliceDuration}
        hasAudioUrl={Boolean(props.audioUrl)}
        hasAudioFile={Boolean(props.audioFileName)}
        exportingFormat={props.exportingFormat}
        hasAnalysis={Boolean(props.analysis)}
        isRenderingGuide={props.isRenderingGuide}
        onSetStartDraft={props.onSetStartDraft}
        onSetEndDraft={props.onSetEndDraft}
        onSetStartFocused={props.onSetStartFocused}
        onSetEndFocused={props.onSetEndFocused}
        onCommitSliceDraft={props.onCommitSliceDraft}
        onSetExportLoopCount={props.onSetExportLoopCount}
        onSetPreviewLoop={props.onSetPreviewLoop}
        onPlaySlice={props.onPlaySlice}
        onExportSlice={props.onExportSlice}
        onExportGuide={props.onExportGuide}
      />

      {props.error && <p className="errorText">{props.error}</p>}

      <WaveformToolbar
        zoom={props.zoom}
        selectedMarkerLocked={props.selectedMarkerLocked}
        selectedMarkerId={props.selectedMarkerId}
        lockedCount={props.lockedMarkerIds.size}
        onZoom={props.onZoom}
        onToggleMarkerLock={props.onToggleMarkerLock}
      />

      <WaveformShell
        zoom={props.zoom}
        waveformTrackRef={props.waveformTrackRef}
        canvasRef={props.canvasRef}
        sliceOverlayRef={props.sliceOverlayRef}
        sliceStartPercent={props.sliceStartPercent}
        sliceEndPercent={props.sliceEndPercent}
        playheadPercent={props.playheadPercent}
        sliceStartSeconds={props.sliceStartSeconds}
        sliceEndSeconds={props.sliceEndSeconds}
        currentTime={props.currentTime}
        onWaveformPointerDown={props.onWaveformPointerDown}
        onWaveformPointerMove={props.onWaveformPointerMove}
        onWaveformPointerUp={props.onWaveformPointerUp}
        onSliceHandlePointerDown={props.onSliceHandlePointerDown}
        onSliceHandlePointerMove={props.onSliceHandlePointerMove}
        onSliceHandlePointerUp={props.onSliceHandlePointerUp}
      />

      <div className="audioScriptGrid">
        <ShotList
          shotRows={props.shotRows}
          markers={props.markers}
          selectedMarkerId={props.selectedMarkerId}
          lockedMarkerIds={props.lockedMarkerIds}
          analysis={props.analysis}
          durationSeconds={props.durationSeconds}
          startSeconds={props.startSeconds}
          onSelectMarker={props.onSelectMarker}
          onRowDrop={props.onRowDrop}
          onAddTimingSpot={props.onAddTimingSpot}
          onRemoveTimingSpot={props.onRemoveTimingSpot}
          onMoveMarker={props.onMoveMarker}
          onUpdateMarker={props.onUpdateMarker}
          onUpdateShot={props.onUpdateShot}
          onOpenShotImage={props.onOpenShotImage}
        />

        <ImagePool
          imageOptions={props.imageOptions}
          selectedMarkerId={props.selectedMarkerId}
          onOpenImageOption={props.onOpenImageOption}
          onAssignImage={props.onAssignImage}
        />
      </div>

      <PromptComposer
        videoTarget={props.videoTarget}
        maxImageGuides={props.maxImageGuides}
        uniqueImageGuideCount={props.uniqueImageGuideCount}
        estimatedVideoParts={props.estimatedVideoParts}
        scriptSetup={props.scriptSetup}
        qualityBoosters={props.qualityBoosters}
        generatedPrompt={props.generatedPrompt}
        hasMarkers={props.markers.length > 0}
        onUpdateVideoTarget={props.onUpdateVideoTarget}
        onSetVideoTarget={props.onSetVideoTarget}
        onSetMaxImageGuides={props.onSetMaxImageGuides}
        onSetScriptSetup={props.onSetScriptSetup}
        onSetQualityBoosters={props.onSetQualityBoosters}
        onSetGeneratedPrompt={props.onSetGeneratedPrompt}
        onGeneratePrompt={props.onGeneratePrompt}
        onUsePrompt={props.onUsePrompt}
        onSavePrompt={props.onSavePrompt}
      />
    </section>
  );
}
