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
    description: "A restrained field-instrument morph using amber action and cyan state.",
    surfaces: ["#111315", "#191d20", "#2b3033"],
    signals: ["#f0a25b", "#69c7df", "#a48ac4"]
  }
] as const;

export type SurfaceTheme = (typeof surfaceThemes)[number]["id"];

export const defaultSurfaceTheme: SurfaceTheme = "reflective";

export function isSurfaceTheme(value: string | null): value is SurfaceTheme {
  return surfaceThemes.some((theme) => theme.id === value);
}
