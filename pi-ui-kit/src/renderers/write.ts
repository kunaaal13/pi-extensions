/**
 * write: `write path` + a highlighted preview of the written content and a
 * line count.
 */
import type { WriteToolInput } from "@earendil-works/pi-coding-agent";
import { fit } from "../ansi.ts";
import { asyncLines, linesComponent } from "../component.ts";
import { fileIcon } from "../icons.ts";
import { displayPath, fileLink } from "../link.ts";
import type { ToolRenderer } from "../registry.ts";
import { headerLines, lineCount, note, resultText, statusDot } from "./shared.ts";

export const writeRenderer: ToolRenderer<WriteToolInput> = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const config = services.config();
      const path = String(args?.path ?? "");
      const shown = displayPath(path, context.cwd);
      const linked = fileLink(path, context.cwd, shown, config.hyperlinks);
      const detail = fileIcon(path, config.fileIcons) + theme.fg("accent", linked);
      return headerLines(theme, "write", detail, width, statusDot(theme, context, config.statusDots));
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
      const config = services.config();
      const content = String(context.args?.content ?? "");
      const total = lineCount(content);
      const limit = options.expanded ? config.expandedMaxLines : config.previewLines;
      const shown = content.split("\n").slice(0, limit);
      const language = services.highlight.languageForPath(String(context.args?.path ?? ""));
      const plain = shown.map((line) => fit(line, width));

      const key = `${services.highlight.epoch}|${limit}|${width}|${content.length}`;
      const rendered = asyncLines(context, "writeHl", key, plain, async () => {
        const ansi = await services.highlight.codeToAnsi(shown.join("\n"), language);
        return ansi ? ansi.map((line) => fit(line, width)) : plain;
      });

      const lines = [...rendered];
      const parts = [`${total} ${total === 1 ? "line" : "lines"}`];
      if (total > shown.length) parts.unshift(`… +${total - shown.length} more`);
      lines.push(note(theme, parts.join(" · "), width));
      return lines;
    });
  },
};
