/**
 * grep / find / ls: compact header with the query, preview of matches, and a
 * result count.
 */
import { fit } from "../ansi.ts";
import { linesComponent } from "../component.ts";
import { displayPath } from "../link.ts";
import type { ToolRenderer } from "../registry.ts";
import { headerLines, note, resultText, statusDot } from "./shared.ts";

function previewResult(
  toolName: string,
): NonNullable<ToolRenderer["renderResult"]> {
  return (result, options, theme, context, services) => {
    return linesComponent((width) => {
      const text = resultText(result);
      if (context.isError) {
        return text.split("\n").slice(0, 6).map((line) => theme.fg("error", fit(line, width)));
      }
      const config = services.config();
      const all = text.split("\n").filter((line) => line.trim().length > 0);
      const empty =
        all.length === 0 ||
        /^(?:No matches found|No files found|\(empty directory\))/i.test(all[0] ?? "");
      if (empty) return [note(theme, "no results", width)];

      const limit = options.expanded ? config.expandedMaxLines : config.previewLines;
      const shown = all.slice(0, limit);
      const rows = shown.map((line) => theme.fg("toolOutput", fit(line, width)));
      const details = result.details as { totalMatched?: unknown } | undefined;
      const total =
        typeof details?.totalMatched === "number" ? details.totalMatched : all.length;
      const parts = [`${total} ${total === 1 ? "result" : "results"}`];
      if (all.length > shown.length) parts.unshift(`… +${all.length - shown.length} more`);
      rows.push(note(theme, parts.join(" · "), width));
      return rows;
    });
  };
}

export const grepRenderer: ToolRenderer = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const pattern = String((args as { pattern?: unknown })?.pattern ?? "");
      const path = (args as { path?: unknown })?.path;
      const detail =
        theme.fg("accent", pattern) +
        (typeof path === "string" && path
          ? theme.fg("muted", ` in ${displayPath(path, context.cwd)}`)
          : "");
      const dot = statusDot(theme, context, services.config().statusDots);
      return headerLines(theme, "grep", detail, width, dot);
    });
  },
  renderResult: previewResult("grep"),
};

export const findRenderer: ToolRenderer = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const pattern = String((args as { pattern?: unknown })?.pattern ?? "");
      const dot = statusDot(theme, context, services.config().statusDots);
      return headerLines(theme, "find", theme.fg("accent", pattern), width, dot);
    });
  },
  renderResult: previewResult("find"),
};

export const lsRenderer: ToolRenderer = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const path = String((args as { path?: unknown })?.path ?? ".");
      const dot = statusDot(theme, context, services.config().statusDots);
      return headerLines(theme, "ls", theme.fg("accent", displayPath(path, context.cwd)), width, dot);
    });
  },
  renderResult: previewResult("ls"),
};
