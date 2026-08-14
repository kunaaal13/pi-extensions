/**
 * edit: `edit path` + shiki-highlighted word-level diff from the tool result's
 * unified diff, with a `+N -M` stat.
 */
import type { EditToolInput } from "@earendil-works/pi-coding-agent";
import { fit } from "../ansi.ts";
import { asyncLines, linesComponent } from "../component.ts";
import { diffStat, parseUnifiedDiff, renderDiffRows, renderSplitDiffRows } from "../diff.ts";
import { fileIcon } from "../icons.ts";
import { displayPath, fileLink } from "../link.ts";
import type { ToolRenderer } from "../registry.ts";
import type { UiKitServices } from "../services.ts";
import type { UiToolRenderContext } from "../types.ts";
import { headerLines, resultText, statusDot } from "./shared.ts";

export function renderDiffBlock(
  diffText: string,
  filePath: string,
  expanded: boolean,
  width: number,
  context: UiToolRenderContext,
  services: UiKitServices,
  slot: string,
): string[] {
  const config = services.config();
  const palette = services.palette();
  const diff = parseUnifiedDiff(diffText);
  const maxLines = expanded ? config.expandedMaxLines : config.diffCollapsedLines;
  const split =
    config.diffView === "split" ||
    (config.diffView === "auto" && width >= config.splitMinWidth);
  const render = split ? renderSplitDiffRows : renderDiffRows;
  const plainRows = render(diff, { width, palette, maxLines });

  const language = services.highlight.languageForPath(filePath);
  const key = `${services.highlight.epoch}|${width}|${maxLines}|${split}|${diffText.length}`;
  return asyncLines(context, slot, key, plainRows, async () => {
    const highlighted = await Promise.all(
      diff.lines.map((line) =>
        line.kind === "hunk" || line.emphasis
          ? Promise.resolve(undefined)
          : services.highlight
              .codeToAnsi(line.text, language)
              .then((lines) => lines?.[0]),
      ),
    );
    return render(diff, { width, palette, maxLines, highlighted });
  });
}

export const editRenderer: ToolRenderer<EditToolInput> = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const config = services.config();
      const path = String(args?.path ?? "");
      const shown = displayPath(path, context.cwd);
      const linked = fileLink(path, context.cwd, shown, config.hyperlinks);
      const detail = fileIcon(path, config.fileIcons) + theme.fg("accent", linked);
      return headerLines(theme, "edit", detail, width, statusDot(theme, context, config.statusDots));
    });
  },

  renderResult(result, options, theme, context, services) {
    return linesComponent((width) => {
      if (context.isError) {
        return resultText(result)
          .split("\n")
          .slice(0, 6)
          .map((line) => theme.fg("error", fit(line, width)));
      }
      const details = result.details as { diff?: unknown } | undefined;
      const diffText = typeof details?.diff === "string" ? details.diff : undefined;
      if (!diffText) {
        return [theme.fg("success", fit("applied", width))];
      }
      const path = String(context.args?.path ?? "");
      const rows = renderDiffBlock(diffText, path, options.expanded, width, context, services, "editHl");
      const stat = diffStat(parseUnifiedDiff(diffText));
      return [...rows, theme.fg("muted", fit(stat, width))];
    });
  },
};
