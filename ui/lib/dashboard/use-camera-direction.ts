import { useCallback, useEffect, useState } from "react";
import {
  defaultCameraDirection,
  normalizeCameraDirection,
  type CameraChoice,
  type CameraDirection
} from "@/lib/camera-language";

export const CAMERA_DIRECTION_CACHE_KEY = "bfl-camera-direction";

function loadCameraDirection(): CameraDirection {
  try {
    return normalizeCameraDirection(JSON.parse(localStorage.getItem(CAMERA_DIRECTION_CACHE_KEY) || "null"));
  } catch {
    return defaultCameraDirection;
  }
}

/**
 * Camera panel state for the FLUX 3 workspace. Kept in local storage like the
 * workspace mode, so the choice survives tab switches and reloads.
 */
export function useCameraDirection() {
  const [direction, setDirection] = useState<CameraDirection>(defaultCameraDirection);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDirection(loadCameraDirection());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CAMERA_DIRECTION_CACHE_KEY, JSON.stringify(direction));
    } catch {
      /* the cache is non-critical */
    }
  }, [direction, hydrated]);

  /** Restores a saved render's choice, keeping edits made to other terms. */
  const restore = useCallback((choice: CameraChoice) => {
    setDirection((current) => ({
      enabled: true,
      selection: choice.selection,
      edits: { ...current.edits, ...choice.edits }
    }));
  }, []);

  return { direction, setDirection, restore };
}
