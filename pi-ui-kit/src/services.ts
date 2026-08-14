/**
 * The service bundle handed to every renderer. Renderers are pure functions of
 * (args/result, theme, context, services) — no module-global state, so two
 * differently-configured instances can coexist and renderers unit-test in
 * isolation.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { UiKitConfig } from "./config.ts";
import type { HighlightService } from "./highlight.ts";
import type { ResolvedPalette } from "./palette.ts";

export interface UiKitServices {
  config(): UiKitConfig;
  palette(): ResolvedPalette;
  highlight: HighlightService;
  /** Live theme proxy captured at session start; undefined before first session_start. */
  theme(): Theme | undefined;
}
