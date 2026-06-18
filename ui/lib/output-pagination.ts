export const DEFAULT_OUTPUT_LIMIT = 24;
export const MAX_OUTPUT_LIMIT = 60;

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const number = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function outputPageFromUrl(url: string) {
  const params = new URL(url).searchParams;
  return {
    limit: boundedNumber(params.get("limit"), DEFAULT_OUTPUT_LIMIT, 1, MAX_OUTPUT_LIMIT),
    offset: boundedNumber(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
    includeData: params.get("includeData") === "1" || params.get("includeData") === "true"
  };
}
