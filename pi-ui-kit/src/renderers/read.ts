/**
 * read: `read path/to/file.ts` + a syntax-highlighted preview of the content.
 * Image reads fall back to pi's built-in renderer (delegation happens in kit.ts).
 */
import type { ReadToolInput } from "@earendil-works/pi-coding-agent";
import { fit } from "../ansi.ts";
import { asyncLines, linesComponent } from "../component.ts";
import { displayPath, fileLink } from "../link.ts";
import type { ToolRenderer } from "../registry.ts";
import { headerLines, lineCount, note, resultText } from "./shared.ts";

export const readRenderer: ToolRenderer<ReadToolInput> = {
  renderCall(args, theme, context, services) {
    return linesComponent((width) => {
      const path = args?.path ?? "";
      const shown = displayPath(path, context.cwd);
      const linked = fileLink(path, context.cwd, shown, services.config().hyperlinks);
      const range =
        args?.offset || args?.limit
          ? theme.fg("muted", ` [${args.offset ?? 1}..${args.limit ? (args.offset ?? 1) + args.limit - 1 : ""}]`)
          : "";
      return headerLines(theme, "read", theme.fg("accent", linked) + range, width);
    });
  },

  renderResult(result, options, theme, context, services) {
    return linesComponent((width) => {
      const text = resultText(result);
      if (context.isError) {
        return text.split("\n").slice(0, 6).map((line) => theme.fg("error", fit(line, width)));
      }
      const config = services.config();
      const total = lineCount(text);
      const limit = options.expanded ? config.expandedMaxLines : config.previewLines;
      const shown = text.split("\n").slice(0, limit);
      const language = services.highlight.languageForPath(String(context.args?.path ?? ""));
      const plain = shown.map((line) => fit(line, width));

      const key = `${services.highlight.epoch}|${limit}|${width}|${total}`;
      const rendered = asyncLines(context, "readHl", key, plain, async () => {
        const ansi = await services.highlight.codeToAnsi(shown.join("\n"), language);
        return ansi ? ansi.map((line) => fit(line, width)) : plain;
      });

      const lines = [...rendered];
      if (total > shown.length) {
        lines.push(note(theme, `… +${total - shown.length} lines`, width));
      }
      return lines;
    });
  },
};
