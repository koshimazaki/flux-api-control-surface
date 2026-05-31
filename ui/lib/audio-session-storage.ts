import type { AudioAnalysisResult, AudioMarker } from "@/lib/audio-analysis";
import type { AudioShot } from "@/lib/audio-script";

export const AUDIO_SCRIPT_STATE_KEY = "bfl-audio-script-state";

const AUDIO_DB_NAME = "bfl-audio-workbench";
const AUDIO_STORE_NAME = "files";
const CURRENT_AUDIO_KEY = "current-audio";

export type CachedAudioScriptState = {
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileLastModified?: number;
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
  videoTarget: string;
  maxImageGuides: number;
  scriptSetup: string;
  qualityBoosters: string;
  generatedPrompt: string;
};

type StoredAudioFile = {
  file: File | Blob;
  name: string;
  type: string;
  lastModified: number;
};

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(AUDIO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCachedAudioFile(file: File | null) {
  const db = await openAudioDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    if (file) {
      store.put(
        {
          file,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified
        } satisfies StoredAudioFile,
        CURRENT_AUDIO_KEY
      );
    } else {
      store.delete(CURRENT_AUDIO_KEY);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function loadCachedAudioFile(): Promise<File | null> {
  const db = await openAudioDb();
  const stored = await new Promise<StoredAudioFile | null>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readonly");
    const request = transaction.objectStore(AUDIO_STORE_NAME).get(CURRENT_AUDIO_KEY);
    request.onsuccess = () => resolve((request.result as StoredAudioFile | undefined) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (!stored?.file) return null;
  if (stored.file instanceof File) return stored.file;
  return new File([stored.file], stored.name || "cached-audio", {
    type: stored.type || stored.file.type || "audio/mpeg",
    lastModified: stored.lastModified || Date.now()
  });
}

export function loadCachedAudioScriptState(): CachedAudioScriptState | null {
  try {
    const raw = localStorage.getItem(AUDIO_SCRIPT_STATE_KEY);
    return raw ? (JSON.parse(raw) as CachedAudioScriptState) : null;
  } catch (error) {
    console.warn("Could not load cached audio script state", error);
    localStorage.removeItem(AUDIO_SCRIPT_STATE_KEY);
    return null;
  }
}

export function saveCachedAudioScriptState(state: CachedAudioScriptState) {
  try {
    localStorage.setItem(AUDIO_SCRIPT_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not persist cached audio script state", error);
  }
}
