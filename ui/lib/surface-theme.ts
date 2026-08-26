export const surfaceThemes = [
  {
    id: "reflective",
    label: "Reflective",
    description: "BFL signal colour through a deeper, reflective operator glass.",
    surfaces: ["#101316", "#171a1e", "#262b31"],
    signals: ["#ea7b7b", "#62c4e6", "#7e6aa6"]
  },
  {
    id: "frozen",
    label: "Frozen",
    description: "Cool blue glass with quieter highlights and icy intelligence signals.",
    surfaces: ["#0b1117", "#111b25", "#243442"],
    signals: ["#8cc9ff", "#78e2ee", "#a9b8ff"]
  },
  {
    id: "quiet-signal",
    label: "Quiet Signal",
    description: "Near-black stone and graphite with Koshi's restrained lime signal.",
    surfaces: ["#050705", "#0d100e", "#202720"],
    signals: ["#a8be5c", "#c0d672", "#4e5247"]
  },
  {
    id: "bfl-stone",
    label: "BFL Stone",
    description: "The same near-black stone ground with BFL green as the single signal family.",
    surfaces: ["#050705", "#0d100e", "#202720"],
    signals: ["#82b878", "#a6d39b", "#496d48"]
  },
  {
    id: "rams-lite",
    label: "Lite Quiet Signal · RAMS",
    description: "Frost-grey and white RAMS ground with sparse orange action and cyan state.",
    surfaces: ["#b8b8b8", "#d4d4d4", "#e6e6e6"],
    signals: ["#ff9f43", "#62c4e6", "#525252"]
  }
] as const;

export type SurfaceTheme = (typeof surfaceThemes)[number]["id"];

export const defaultSurfaceTheme: SurfaceTheme = "reflective";

export function isSurfaceTheme(value: string | null): value is SurfaceTheme {
  return surfaceThemes.some((theme) => theme.id === value);
}
