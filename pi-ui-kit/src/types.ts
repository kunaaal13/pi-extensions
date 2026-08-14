/**
 * Structural mirror of pi's ToolRenderContext (defined in
 * @earendil-works/pi-coding-agent core/extensions/types.d.ts but not exported
 * from the package root as of 0.84.2). Structurally compatible, so pi's real
 * context objects flow through unchanged.
 */
import type { Component } from "@earendil-works/pi-tui";

export interface UiToolRenderContext<TState = any, TArgs = any> {
  args: TArgs;
  toolCallId: string;
  invalidate: () => void;
  lastComponent: Component | undefined;
  state: TState;
  cwd: string;
  executionStarted: boolean;
  argsComplete: boolean;
  isPartial: boolean;
  expanded: boolean;
  showImages: boolean;
  isError: boolean;
}
