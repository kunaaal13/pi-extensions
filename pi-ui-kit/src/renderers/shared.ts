/**
 * Building blocks shared by the built-in tool renderers.
 */
import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { fit, wrapRows } from "../ansi.ts";
import type { UiToolRenderContext } from "../types.ts";

/** First text block of a tool result, or "". */
export function resultText(result: AgentToolResult<unknown>): string {
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof (block as { text?: unknown }).text === "string") {
      return (block as { text: string }).text;
    }
  }
  return "";
}

export function hasImageContent(result: AgentToolResult<unknown>): boolean {
  return (result.content ?? []).some((block) => block.type === "image");
}

/**
 * Status dot for a tool row: pending (warning) while running, error red,
 * success green once settled. Empty string when disabled.
 */
export function statusDot(
  theme: Theme,
  context: UiToolRenderContext,
  enabled: boolean,
): string {
  if (!enabled) return "";
  const color = context.isError
    ? "error"
    : !context.executionStarted || context.isPartial
      ? "warning"
      : "success";
  return `${theme.fg(color, "●")} `;
}

/** `● name detail` heading, wrapped to at most two rows. */
export function headerLines(
  theme: Theme,
  name: string,
  detail: string,
  width: number,
  dot = "",
): string[] {
  const heading = `${dot}${theme.fg("toolTitle", theme.bold(name))} ${detail}`;
  return wrapRows(heading, width, 2);
}

/** Dim single-line note (truncation hints, counts). */
export function note(theme: Theme, text: string, width: number): string {
  return theme.fg("muted", fit(text, width));
}

export function lineCount(text: string): number {
  if (!text) return 0;
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}
