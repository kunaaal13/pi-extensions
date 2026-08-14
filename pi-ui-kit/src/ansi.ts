/**
 * ANSI-aware line utilities. Thin layer over pi-tui's primitives so renderers
 * never hand-roll width math.
 */
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { RESET } from "./color.ts";

const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/** Truncate one line to `width` columns with a trailing ellipsis. */
export function fit(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width), "…", false);
}

/** Pad a line with spaces to exactly `width` columns, optionally under a background. */
export function padToWidth(line: string, width: number, background?: string): string {
  const pad = Math.max(0, width - visibleWidth(line));
  const padding = " ".repeat(pad);
  if (!background) return line + padding;
  return `${background}${line}${padding}${RESET}`;
}

/**
 * Wrap to at most `maxRows` rows; if content overflows, the final row ends with
 * a `›` marker instead of silently dropping the tail mid-word.
 */
export function wrapRows(text: string, width: number, maxRows: number): string[] {
  const rows = wrapTextWithAnsi(text, Math.max(1, width));
  if (rows.length <= maxRows) return rows;
  const kept = rows.slice(0, Math.max(1, maxRows));
  const last = kept[kept.length - 1];
  kept[kept.length - 1] = fit(last, width - 2) + " ›";
  return kept;
}

/** Last `limit` non-empty lines of a block of output; `limit <= 0` returns none. */
export function tailLines(text: string, limit: number): { lines: string[]; total: number } {
  const all = text.split("\n").filter((line) => line.trim().length > 0);
  if (limit <= 0) return { lines: [], total: all.length };
  return { lines: all.slice(-limit), total: all.length };
}

export { visibleWidth, truncateToWidth, wrapTextWithAnsi };
