/**
 * Layered diff palette resolution.
 *
 * Precedence (lowest to highest):
 *   1. theme-derived values (when `themeAdaptive` is on) or the fixed defaults
 *   2. a named preset (built-in or registered via `registerDiffPreset`)
 *   3. per-key user overrides from `uiKit.diffColors`
 *
 * Everything is expressed as hex so presets are plain data and third parties
 * can register their own without touching ANSI.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  bgAnsi,
  fgAnsi,
  hexToRgb,
  luminance,
  mix,
  parseAnsiColor,
  rgbToHex,
  type Rgb,
} from "./color.ts";

export interface DiffPalette {
  bgAdd: string;
  bgDel: string;
  bgAddHighlight: string;
  bgDelHighlight: string;
  bgGutterAdd: string;
  bgGutterDel: string;
  bgEmpty: string;
  fgAdd: string;
  fgDel: string;
  fgDim: string;
  fgLnum: string;
  fgRule: string;
  fgSafeMuted: string;
  /** Optional shiki theme bound to this preset; `uiKit.shikiTheme` wins over it. */
  shikiTheme?: string;
}

export const CLAUDE_DARK_PALETTE: DiffPalette = {
  bgAdd: "#1c3327",
  bgDel: "#3b1d26",
  bgAddHighlight: "#28543a",
  bgDelHighlight: "#5c2937",
  bgGutterAdd: "#16281f",
  bgGutterDel: "#2e1720",
  bgEmpty: "#101010",
  fgAdd: "#4eba65",
  fgDel: "#ff6b80",
  fgDim: "#999999",
  fgLnum: "#7a7a7a",
  fgRule: "#505050",
  fgSafeMuted: "#9a9a9a",
};

const PRESETS = new Map<string, Partial<DiffPalette>>([
  ["default", {}],
  [
    "midnight",
    {
      bgAdd: "#111111",
      bgDel: "#111111",
      bgAddHighlight: "#1b1b1b",
      bgDelHighlight: "#1b1b1b",
      bgGutterAdd: "#0d0d0d",
      bgGutterDel: "#0d0d0d",
      bgEmpty: "#090909",
      fgAdd: "#4eba65",
      fgDel: "#ff6b80",
      fgDim: "#999999",
      fgLnum: "#999999",
      fgRule: "#505050",
      fgSafeMuted: "#999999",
      shikiTheme: "github-dark-dimmed",
    },
  ],
]);

/** Register (or replace) a named preset. Returns an unregister function. */
export function registerDiffPreset(name: string, preset: Partial<DiffPalette>): () => void {
  PRESETS.set(name, preset);
  return () => {
    if (PRESETS.get(name) === preset) PRESETS.delete(name);
  };
}

export function getDiffPreset(name: string): Partial<DiffPalette> | undefined {
  return PRESETS.get(name);
}

export function listDiffPresets(): string[] {
  return [...PRESETS.keys()];
}

function themeColor(theme: Theme, key: string): Rgb | undefined {
  try {
    return parseAnsiColor(theme.getFgAnsi(key as never) ?? "");
  } catch {
    return undefined;
  }
}

function themeBg(theme: Theme, key: string): Rgb | undefined {
  try {
    return parseAnsiColor(theme.getBgAnsi(key as never) ?? "");
  } catch {
    return undefined;
  }
}

export function isLightTheme(theme: Theme): boolean {
  const text = themeColor(theme, "text");
  // Light background implies dark text.
  return text !== undefined && luminance(text) < 128;
}

/**
 * Derive a full palette from the active pi theme: diff accents come from
 * `toolDiffAdded`/`toolDiffRemoved`, backgrounds are those accents mixed into
 * the tool-row background so tints track any theme automatically.
 */
export function deriveFromTheme(theme: Theme): DiffPalette {
  const light = isLightTheme(theme);
  const fallback = CLAUDE_DARK_PALETTE;
  const add = themeColor(theme, "toolDiffAdded") ?? hexToRgb(fallback.fgAdd)!;
  const del = themeColor(theme, "toolDiffRemoved") ?? hexToRgb(fallback.fgDel)!;
  const muted = themeColor(theme, "muted") ?? hexToRgb(fallback.fgDim)!;
  const dim = themeColor(theme, "dim") ?? muted;
  const base =
    themeBg(theme, "toolSuccessBg") ?? (light ? { r: 244, g: 244, b: 244 } : { r: 17, g: 17, b: 17 });

  const tint = (accent: Rgb, amount: number) => rgbToHex(mix(base, accent, amount));
  return {
    bgAdd: tint(add, light ? 0.14 : 0.18),
    bgDel: tint(del, light ? 0.14 : 0.18),
    bgAddHighlight: tint(add, light ? 0.26 : 0.34),
    bgDelHighlight: tint(del, light ? 0.26 : 0.34),
    bgGutterAdd: tint(add, light ? 0.08 : 0.1),
    bgGutterDel: tint(del, light ? 0.08 : 0.1),
    bgEmpty: rgbToHex(mix(base, light ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.3)),
    fgAdd: rgbToHex(add),
    fgDel: rgbToHex(del),
    fgDim: rgbToHex(muted),
    fgLnum: rgbToHex(dim),
    fgRule: rgbToHex(mix(muted, base, 0.4)),
    fgSafeMuted: rgbToHex(muted),
  };
}

export interface ResolvePaletteOptions {
  theme?: Theme;
  themeAdaptive: boolean;
  preset: string;
  overrides: Record<string, string>;
}

export interface ResolvedPalette extends DiffPalette {
  /** Precomputed ANSI for each palette entry (bg* as background, fg* as foreground). */
  ansi: Record<keyof Omit<DiffPalette, "shikiTheme">, string>;
}

export function resolvePalette(options: ResolvePaletteOptions): ResolvedPalette {
  const base: DiffPalette =
    options.themeAdaptive && options.theme
      ? deriveFromTheme(options.theme)
      : { ...CLAUDE_DARK_PALETTE };

  const preset = PRESETS.get(options.preset);
  const merged: DiffPalette = { ...base, ...preset };
  for (const [key, value] of Object.entries(options.overrides)) {
    if (key in merged || key === "shikiTheme")
      (merged as unknown as Record<string, string>)[key] = value;
  }

  const ansi = {} as ResolvedPalette["ansi"];
  for (const key of Object.keys(merged) as (keyof DiffPalette)[]) {
    if (key === "shikiTheme") continue;
    const rgb = hexToRgb(merged[key] as string);
    if (!rgb) continue;
    ansi[key as keyof ResolvedPalette["ansi"]] = key.startsWith("bg") ? bgAnsi(rgb) : fgAnsi(rgb);
  }
  return { ...merged, ansi };
}
