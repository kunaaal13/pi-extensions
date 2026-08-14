/**
 * bash: `$ command` + a live-updating tail of output while running, collapsed
 * tail when done, with elapsed time.
 */
import type { BashToolInput } from "@earendil-works/pi-coding-agent";
import { fit, tailLines, wrapRows } from "../ansi.ts";
import { linesComponent } from "../component.ts";
import type { ToolRenderer } from "../registry.ts";
import { note, resultText } from "./shared.ts";

interface BashState {
  uiKitStartedAt?: number;
  uiKitEndedAt?: number;
}

function elapsedText(state: BashState): string | undefined {
  if (!state.uiKitStartedAt) return undefined;
  const end = state.uiKitEndedAt ?? Date.now();
  return `${((end - state.uiKitStartedAt) / 1000).toFixed(1)}s`;
}

export const bashRenderer: ToolRenderer<BashToolInput> = {
  renderCall(args, theme, context) {
    const state = context.state as BashState;
    if (context.executionStarted && !state.uiKitStartedAt) state.uiKitStartedAt = Date.now();
    return linesComponent((width) => {
      const command = String(args?.command ?? "");
      const heading = `${theme.fg("toolTitle", theme.bold("$"))} ${theme.fg("mdCode", command)}`;
      return wrapRows(heading, width, 3);
    });
  },

  renderResult(result, options, theme, context, services) {
    const state = context.state as BashState;
    if (!options.isPartial && !state.uiKitEndedAt) state.uiKitEndedAt = Date.now();
    return linesComponent((width) => {
      const config = services.config();
      const text = resultText(result);
      const limit = options.expanded ? config.expandedMaxLines : config.bashCollapsedLines;
      const { lines: tail, total } = tailLines(text, limit);
      const color = context.isError ? "error" : "toolOutput";
      const rows = tail.map((line) => theme.fg(color, fit(line, width)));
      const parts: string[] = [];
      if (total > tail.length) parts.push(`… +${total - tail.length} lines`);
      const elapsed = elapsedText(state);
      if (elapsed && !options.isPartial) parts.push(elapsed);
      if (parts.length) rows.push(note(theme, parts.join(" · "), width));
      return rows;
    });
  },
};
