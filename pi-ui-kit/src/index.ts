/**
 * pi-ui-kit public API. Everything here is importable by other extensions:
 *
 *   import { createUiKit, registerDiffPreset, parseUnifiedDiff } from "pi-ui-kit";
 */
export { fit, padToWidth, stripAnsi, tailLines, wrapRows } from "./ansi.ts";
export {
  bgAnsi,
  fgAnsi,
  hexToRgb,
  luminance,
  mix,
  parseAnsiColor,
  RESET,
  rgbToHex,
  xterm256ToRgb,
  type Rgb,
} from "./color.ts";
export { asyncLines, linesComponent } from "./component.ts";
export { bustConfigCache, DEFAULT_CONFIG, loadConfig, type UiKitConfig } from "./config.ts";
export { installChrome } from "./chrome.ts";
export {
  diffStat,
  parseUnifiedDiff,
  renderDiffRows,
  renderSplitDiffRows,
  type DiffLine,
  type DiffLineKind,
  type ParsedDiff,
  type RenderDiffOptions,
} from "./diff.ts";
export { HighlightService, type ThemeSource } from "./highlight.ts";
export { displayPath, fileLink, osc8 } from "./link.ts";
export {
  CLAUDE_DARK_PALETTE,
  deriveFromTheme,
  getDiffPreset,
  isLightTheme,
  listDiffPresets,
  registerDiffPreset,
  resolvePalette,
  type DiffPalette,
  type ResolvedPalette,
} from "./palette.ts";
export { RendererRegistry, type ToolMatch, type ToolRenderer } from "./registry.ts";
export { bashRenderer } from "./renderers/bash.ts";
export { editRenderer, renderDiffBlock } from "./renderers/edit.ts";
export { readRenderer } from "./renderers/read.ts";
export { findRenderer, grepRenderer, lsRenderer } from "./renderers/search.ts";
export { writeRenderer } from "./renderers/write.ts";
export { installToolGrouping } from "./grouping.ts";
export { installSpinner } from "./spinner.ts";
export { createUiKit, type UiKit } from "./kit.ts";
export type { UiKitServices } from "./services.ts";
export type { UiToolRenderContext } from "./types.ts";
