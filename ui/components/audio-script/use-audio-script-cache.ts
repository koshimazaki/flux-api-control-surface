import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { type AudioAnalysisResult, type AudioMarker } from "@/lib/audio-analysis";
import {
  loadCachedAudioFile,
  loadCachedAudioScriptState,
  saveCachedAudioScriptState,
  type CachedAudioScriptState
} from "@/lib/audio-session-storage";
import {
  defaultAudioQualityBoosters,
  defaultAudioSetup,
  type AudioShot,
  type ImageOption
} from "@/lib/audio-script";
import { isVideoTarget, shotForCache, videoTargets } from "./panel-helpers";
import type { VideoTarget } from "./types";

type AudioScriptCacheState = {
  audioFile: File | null;
  audioDuration: number;
  analysis: AudioAnalysisResult | null;
  markers: AudioMarker[];
  shots: AudioShot[];
  selectedMarkerId: string;
  startSeconds: number;
  durationSeconds: number;
  sliceStartSeconds: number;
  sliceEndSeconds: number;
  currentTime: number;
  previewLoop: boolean;
  exportLoopCount: number;
  shotCount: number;
  videoTarget: VideoTarget;
  maxImageGuides: number;
  scriptSetup: string;
  qualityBoosters: string;
  generatedPrompt: string;
  lockedMarkerIds: Set<string>;
};

type AudioScriptCacheSetters = {
  setAudioFile: Dispatch<SetStateAction<File | null>>;
  setAudioDuration: Dispatch<SetStateAction<number>>;
  setAnalysis: Dispatch<SetStateAction<AudioAnalysisResult | null>>;
  setMarkers: Dispatch<SetStateAction<AudioMarker[]>>;
  setShots: Dispatch<SetStateAction<AudioShot[]>>;
  setSelectedMarkerId: Dispatch<SetStateAction<string>>;
  setLockedMarkerIds: Dispatch<SetStateAction<Set<string>>>;
  setStartSeconds: Dispatch<SetStateAction<number>>;
  setDurationSeconds: Dispatch<SetStateAction<number>>;
  setSliceStartSeconds: Dispatch<SetStateAction<number>>;
  setSliceEndSeconds: Dispatch<SetStateAction<number>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setPreviewLoop: Dispatch<SetStateAction<boolean>>;
  setExportLoopCount: Dispatch<SetStateAction<number>>;
  setShotCount: Dispatch<SetStateAction<number>>;
  setVideoTarget: Dispatch<SetStateAction<VideoTarget>>;
  setMaxImageGuides: Dispatch<SetStateAction<number>>;
  setScriptSetup: Dispatch<SetStateAction<string>>;
  setQualityBoosters: Dispatch<SetStateAction<string>>;
  setGeneratedPrompt: Dispatch<SetStateAction<string>>;
};

export function useAudioScriptCache(
  state: AudioScriptCacheState,
  setters: AudioScriptCacheSetters,
  imageOptions: ImageOption[]
) {
  const [hasLoadedAudioCache, setHasLoadedAudioCache] = useState(false);

  const {
    audioFile,
    audioDuration,
    analysis,
    markers,
    shots,
    selectedMarkerId,
    startSeconds,
    durationSeconds,
    sliceStartSeconds,
    sliceEndSeconds,
    currentTime,
    previewLoop,
    exportLoopCount,
    shotCount,
    videoTarget,
    maxImageGuides,
    scriptSetup,
    qualityBoosters,
    generatedPrompt,
    lockedMarkerIds
  } = state;

  const {
    setAudioFile,
    setAudioDuration,
    setAnalysis,
    setMarkers,
    setShots,
    setSelectedMarkerId,
    setLockedMarkerIds,
    setStartSeconds,
    setDurationSeconds,
    setSliceStartSeconds,
    setSliceEndSeconds,
    setCurrentTime,
    setPreviewLoop,
    setExportLoopCount,
    setShotCount,
    setVideoTarget,
    setMaxImageGuides,
    setScriptSetup,
    setQualityBoosters,
    setGeneratedPrompt
  } = setters;

  useEffect(() => {
    let cancelled = false;

    async function loadCachedAudio() {
      const [file, cached] = await Promise.all([
        loadCachedAudioFile().catch((err) => {
          console.warn("Could not load cached audio file", err);
          return null;
        }),
        Promise.resolve(loadCachedAudioScriptState())
      ]);
      if (cancelled) return;

      if (file) setAudioFile(file);
      if (cached) {
        setAudioDuration(cached.audioDuration || 0);
        setAnalysis(cached.analysis || null);
        setMarkers(cached.markers || []);
        setShots(cached.shots || []);
        setSelectedMarkerId(cached.selectedMarkerId || "");
        const cachedLocks = (cached as CachedAudioScriptState & { lockedMarkerIds?: string[] }).lockedMarkerIds;
        if (Array.isArray(cachedLocks)) setLockedMarkerIds(new Set(cachedLocks));
        setStartSeconds(cached.startSeconds || 0);
        setDurationSeconds(cached.durationSeconds || 15);
        setSliceStartSeconds(cached.sliceStartSeconds || 0);
        setSliceEndSeconds(cached.sliceEndSeconds || 15);
        setCurrentTime(cached.currentTime || 0);
        setPreviewLoop(Boolean(cached.previewLoop));
        setExportLoopCount(cached.exportLoopCount || 1);
        setShotCount(cached.shotCount || 6);
        setVideoTarget(isVideoTarget(cached.videoTarget) ? cached.videoTarget : "seedance");
        setMaxImageGuides(cached.maxImageGuides || videoTargets.seedance.imageGuides);
        setScriptSetup(cached.scriptSetup || defaultAudioSetup);
        setQualityBoosters(cached.qualityBoosters || defaultAudioQualityBoosters);
        setGeneratedPrompt(cached.generatedPrompt || "");
      }
      setHasLoadedAudioCache(true);
    }

    void loadCachedAudio();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedAudioCache) return;
    const timeout = window.setTimeout(() => {
      const cacheState: CachedAudioScriptState = {
        fileName: audioFile?.name,
        fileSize: audioFile?.size,
        fileType: audioFile?.type,
        fileLastModified: audioFile?.lastModified,
        audioDuration,
        analysis,
        markers,
        shots: shots.map(shotForCache),
        selectedMarkerId,
        startSeconds,
        durationSeconds,
        sliceStartSeconds,
        sliceEndSeconds,
        currentTime,
        previewLoop,
        exportLoopCount,
        shotCount,
        videoTarget,
        maxImageGuides,
        scriptSetup,
        qualityBoosters,
        generatedPrompt
      };
      // lockedMarkerIds is component-local; persist it alongside the typed cache via a cast
      // so the shared CachedAudioScriptState type does not need to change.
      saveCachedAudioScriptState(
        Object.assign({}, cacheState, { lockedMarkerIds: Array.from(lockedMarkerIds) }) as CachedAudioScriptState
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    hasLoadedAudioCache,
    audioFile?.name,
    audioFile?.size,
    audioFile?.type,
    audioFile?.lastModified,
    audioDuration,
    analysis,
    markers,
    shots,
    selectedMarkerId,
    startSeconds,
    durationSeconds,
    sliceStartSeconds,
    sliceEndSeconds,
    currentTime,
    previewLoop,
    exportLoopCount,
    shotCount,
    videoTarget,
    maxImageGuides,
    scriptSetup,
    qualityBoosters,
    generatedPrompt,
    lockedMarkerIds
  ]);

  useEffect(() => {
    if (!hasLoadedAudioCache || !imageOptions.length) return;
    setShots((current) => {
      let changed = false;
      const hydrated = current.map((shot) => {
        if (!shot.imageSourceId || shot.imageDataUrl) return shot;
        const option = imageOptions.find((item) => item.id === shot.imageSourceId);
        if (!option) return shot;
        changed = true;
        return {
          ...shot,
          imageName: shot.imageName || option.name,
          imageDataUrl: option.imageDataUrl,
          imagePrompt: shot.imagePrompt || option.prompt
        };
      });
      return changed ? hydrated : current;
    });
  }, [hasLoadedAudioCache, imageOptions]);
}
