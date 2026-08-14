/**
 * Config loading for pi-ui-kit.
 *
 * All settings live under a single `"uiKit"` object in `.pi/settings.json`
 * (project) and `~/.pi/settings.json` (global), so keys never collide with
 * pi's own settings or other extensions. Project settings override global —
 * the opposite of pi-cc-tools, which had it backwards.
 *
 * Unknown keys are collected as warnings instead of being silently ignored.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface UiKitConfig {
  /**
   * Shiki theme for diffs and code previews. Accepts a bundled theme name
   * ("github-dark"), an npm module specifier ("@pierre/theme/pierre-dark"),
   * a path to a TextMate theme JSON file, or "auto" to pick a light/dark
   * bundled default from the active pi theme.
   */
  shikiTheme: string;
  /** Named diff palette preset ("default", "midnight", or one registered via registerDiffPreset). */
  diffPreset: string;
  /** Per-key palette overrides; always win over preset and theme-derived values. */
  diffColors: Record<string, string>;
  /** Derive diff backgrounds/accents from the active pi theme. */
  themeAdaptive: boolean;
  /** Lines shown in collapsed previews (read/write). */
  previewLines: number;
  /** Max lines rendered when a tool row is expanded. */
  expandedMaxLines: number;
  /** Tail lines shown for collapsed bash output. */
  bashCollapsedLines: number;
  /** Diff lines shown before collapsing. */
  diffCollapsedLines: number;
  /** Emit OSC-8 hyperlinks on file paths. */
  hyperlinks: boolean;
}

export const DEFAULT_CONFIG: UiKitConfig = {
  shikiTheme: "auto",
  diffPreset: "default",
  diffColors: {},
  themeAdaptive: true,
  previewLines: 8,
  expandedMaxLines: 4000,
  bashCollapsedLines: 10,
  diffCollapsedLines: 24,
  hyperlinks: true,
};

const CACHE_TTL_MS = 5000;

export interface LoadedConfig {
  config: UiKitConfig;
  /** Unknown-key and type warnings, for one-shot surfacing via ui.notify. */
  warnings: string[];
}

let cache: { loaded: LoadedConfig; at: number; cwd: string } | undefined;

function readSettingsFile(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function mergeBlock(
  target: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
): void {
  const block = settings?.uiKit;
  if (typeof block !== "object" || block === null) return;
  Object.assign(target, block);
}

export function loadConfig(cwd: string): LoadedConfig {
  const now = Date.now();
  if (cache && cache.cwd === cwd && now - cache.at < CACHE_TTL_MS) return cache.loaded;

  const raw: Record<string, unknown> = {};
  mergeBlock(raw, readSettingsFile(join(homedir(), ".pi", "settings.json")));
  mergeBlock(raw, readSettingsFile(join(cwd, ".pi", "settings.json")));

  const warnings: string[] = [];
  const config: UiKitConfig = { ...DEFAULT_CONFIG, diffColors: { ...DEFAULT_CONFIG.diffColors } };
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULT_CONFIG)) {
      warnings.push(`uiKit: unknown setting "${key}"`);
      continue;
    }
    const defaultValue = DEFAULT_CONFIG[key as keyof UiKitConfig];
    if (typeof value !== typeof defaultValue || Array.isArray(value) !== Array.isArray(defaultValue)) {
      warnings.push(`uiKit: setting "${key}" expects ${typeof defaultValue}, got ${typeof value}`);
      continue;
    }
    (config as unknown as Record<string, unknown>)[key] = value;
  }

  const loaded = { config, warnings };
  cache = { loaded, at: now, cwd };
  return loaded;
}

/** Drop the config cache (e.g. after a slash command writes settings). */
export function bustConfigCache(): void {
  cache = undefined;
}
