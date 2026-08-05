import type { VideoScriptWarning, VideoScriptWarningCode } from "./types";

/**
 * Every drop, truncation, and skipped input goes through here. The planner is
 * allowed to reduce a batch, but it is never allowed to do it silently.
 */
export function warn(
  warnings: VideoScriptWarning[],
  code: VideoScriptWarningCode,
  message: string,
  extra: { count?: number; limit?: number } = {}
) {
  warnings.push({ code, message, ...extra });
  return warnings;
}

export function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}
