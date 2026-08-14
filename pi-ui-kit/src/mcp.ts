/**
 * Consistent rendering for MCP/extension tools. pi has no renderer-only hook
 * for tools other extensions register, so at session start we look up each
 * runtime tool and, when its runtime object carries an execute function,
 * re-register it with our renderCall/renderResult attached (execute delegated
 * to the original). Tools whose runtime shape doesn't cooperate are skipped —
 * they keep their own rendering.
 */
import type { ExtensionAPI, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { fit, tailLines, wrapRows } from "./ansi.ts";
import { linesComponent } from "./component.ts";
import type { UiKitServices } from "./services.ts";
import type { UiToolRenderContext } from "./types.ts";

const WRAPPED = Symbol.for("pi-ui-kit.mcp.wrapped.v1");

const BUILT_IN = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

function compactArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  try {
    const text = JSON.stringify(args);
    return text === "{}" ? "" : text;
  } catch {
    return String(args);
  }
}

export function genericCall(
  name: string,
  args: unknown,
  theme: Theme,
  width: number,
): string[] {
  const detail = compactArgs(args);
  const heading = `${theme.fg("toolTitle", theme.bold(name))}${detail ? ` ${theme.fg("accent", detail)}` : ""}`;
  return wrapRows(heading, width, 2);
}

export function genericResult(
  result: { content?: Array<{ type?: unknown; text?: unknown }> },
  options: ToolRenderResultOptions,
  theme: Theme,
  context: UiToolRenderContext,
  services: UiKitServices,
  width: number,
): string[] {
  const config = services.config();
  const mode = config.mcpOutputMode;
  if (mode === "hidden" && !options.expanded) return [];
  const text =
    result.content?.find((block) => block.type === "text" && typeof block.text === "string")
      ?.text as string | undefined;
  if (!text) return [];
  const all = text.split("\n").filter((line) => line.trim().length > 0);
  if (mode === "summary" && !options.expanded) {
    return [theme.fg("muted", fit(`${all.length} ${all.length === 1 ? "line" : "lines"}`, width))];
  }
  const limit = options.expanded ? config.expandedMaxLines : config.previewLines;
  const { lines, total } = tailLines(text, limit);
  const color = context.isError ? "error" : "toolOutput";
  const rows = lines.map((line) => theme.fg(color, fit(line, width)));
  if (total > lines.length) {
    rows.push(theme.fg("muted", fit(`… +${total - lines.length} lines`, width)));
  }
  return rows;
}

export function installMcpRendering(
  pi: ExtensionAPI,
  services: UiKitServices,
  isEnabled: () => boolean,
): void {
  pi.on("session_start", () => {
    if (!isEnabled()) return;
    try {
      const tools = (pi as unknown as { getAllTools(): unknown[] }).getAllTools?.() ?? [];
      for (const tool of tools) {
        const candidate = tool as {
          name?: string;
          execute?: unknown;
          renderCall?: unknown;
          renderResult?: unknown;
          [WRAPPED]?: boolean;
        };
        if (
          !candidate.name ||
          BUILT_IN.has(candidate.name) ||
          candidate[WRAPPED] ||
          typeof candidate.execute !== "function" ||
          // Tools that already ship their own rendering keep it.
          candidate.renderCall ||
          candidate.renderResult
        ) {
          continue;
        }
        const name = candidate.name;
        try {
          pi.registerTool({
            ...(candidate as Record<string, unknown>),
            renderCall: (args: unknown, theme: Theme) =>
              linesComponent((width) => genericCall(name, args, theme, width)),
            renderResult: (
              result: { content?: Array<{ type?: unknown; text?: unknown }> },
              options: ToolRenderResultOptions,
              theme: Theme,
              context: unknown,
            ) =>
              linesComponent((width) =>
                genericResult(result, options, theme, context as UiToolRenderContext, services, width),
              ),
          } as never);
          candidate[WRAPPED] = true;
        } catch {
          // Skip tools that refuse re-registration.
        }
      }
    } catch {
      // getAllTools shape changed — leave third-party rendering untouched.
    }
  });
}
