/**
 * Wires everything together: loads config, resolves the palette against the
 * active pi theme, installs the default renderers, and re-registers pi's
 * built-in tools with registry-dispatched rendering. Pure public API — no
 * prototype patching in the core.
 */
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { installChrome } from "./chrome.ts";
import { bustConfigCache, loadConfig, type UiKitConfig } from "./config.ts";
import { installToolGrouping } from "./grouping.ts";
import { HighlightService } from "./highlight.ts";
import { installMcpRendering } from "./mcp.ts";
import { installReceipt } from "./receipt.ts";
import { installSpinner } from "./spinner.ts";
import { isLightTheme, resolvePalette, type ResolvedPalette } from "./palette.ts";
import { RendererRegistry } from "./registry.ts";
import { bashRenderer } from "./renderers/bash.ts";
import { editRenderer } from "./renderers/edit.ts";
import { readRenderer } from "./renderers/read.ts";
import { findRenderer, grepRenderer, lsRenderer } from "./renderers/search.ts";
import { writeRenderer } from "./renderers/write.ts";
import { hasImageContent } from "./renderers/shared.ts";
import type { UiKitServices } from "./services.ts";

export interface UiKit {
  registry: RendererRegistry;
  services: UiKitServices;
  install(): void;
}

type BuiltInFactory = (cwd: string) => ToolDefinition<any, any, any>;

const BUILT_IN_FACTORIES: Record<string, BuiltInFactory> = {
  read: (cwd) => createReadToolDefinition(cwd),
  bash: (cwd) => createBashToolDefinition(cwd),
  edit: (cwd) => createEditToolDefinition(cwd),
  write: (cwd) => createWriteToolDefinition(cwd),
  grep: (cwd) => createGrepToolDefinition(cwd),
  find: (cwd) => createFindToolDefinition(cwd),
  ls: (cwd) => createLsToolDefinition(cwd),
};

export function createUiKit(pi: ExtensionAPI): UiKit {
  const registry = new RendererRegistry();
  const highlight = new HighlightService();

  let cwd = process.cwd();
  let theme: Theme | undefined;
  let config: UiKitConfig = loadConfig(cwd).config;
  let palette: ResolvedPalette = resolvePalette({
    themeAdaptive: false,
    preset: config.diffPreset,
    overrides: config.diffColors,
  });

  const services: UiKitServices = {
    config: () => config,
    palette: () => palette,
    highlight,
    theme: () => theme,
  };

  function refresh(notifyWarnings?: (message: string) => void): void {
    bustConfigCache();
    const loaded = loadConfig(cwd);
    config = loaded.config;
    palette = resolvePalette({
      theme,
      themeAdaptive: config.themeAdaptive,
      preset: config.diffPreset,
      overrides: config.diffColors,
    });
    const dark = theme ? !isLightTheme(theme) : true;
    highlight.setContrastContext(palette.fgSafeMuted, dark);
    const shikiTheme =
      config.shikiTheme !== "auto"
        ? config.shikiTheme
        : (palette.shikiTheme ?? (dark ? "github-dark" : "github-light"));
    highlight.setTheme(shikiTheme);
    if (notifyWarnings) for (const warning of loaded.warnings) notifyWarnings(warning);
  }

  function install(): void {
    installToolGrouping(pi, () => config.groupToolCalls);
    installSpinner(pi, () => config.spinner, () => config.spinnerVerbs);
    installChrome(pi, { header: () => config.header, footer: () => config.footer });
    installReceipt(pi, {
      receipt: () => config.turnReceipt,
      thinkingLabel: () => config.thinkingLabel,
    });
    installMcpRendering(pi, services, () => config.mcpRendering);

    registry.register("read", readRenderer);
    registry.register("bash", bashRenderer);
    registry.register("edit", editRenderer);
    registry.register("write", writeRenderer);
    registry.register("grep", grepRenderer);
    registry.register("find", findRenderer);
    registry.register("ls", lsRenderer);

    for (const [name, factory] of Object.entries(BUILT_IN_FACTORIES)) {
      const base = factory(cwd);
      pi.registerTool({
        ...base,
        // Execute through a fresh definition so cwd tracks the live session.
        execute: (toolCallId, params, signal, onUpdate, ctx) =>
          factory(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx),
        renderCall(args, callTheme, context) {
          const renderer = registry.resolve(name);
          if (renderer?.renderCall) return renderer.renderCall(args, callTheme, context, services);
          return base.renderCall!(args, callTheme, context);
        },
        renderResult(result, options, resultTheme, context) {
          const renderer = registry.resolve(name);
          // Image payloads (e.g. read on a PNG) keep pi's native rendering.
          if (renderer?.renderResult && !hasImageContent(result)) {
            return renderer.renderResult(result, options, resultTheme, context, services);
          }
          return base.renderResult!(result, options, resultTheme, context);
        },
      });
    }

    pi.on("session_start", (_event, ctx) => {
      cwd = ctx.cwd;
      if (ctx.hasUI) theme = ctx.ui.theme;
      refresh(ctx.hasUI ? (message) => ctx.ui.notify(message, "warning") : undefined);
    });

    pi.registerCommand("ui-kit", {
      description: "pi-ui-kit status and controls (status | refresh | theme <shiki-theme>)",
      getArgumentCompletions: (prefix) =>
        ["status", "refresh", "theme "]
          .filter((option) => option.startsWith(prefix))
          .map((value) => ({ value, label: value.trim() })),
      handler: async (args, ctx) => {
        const [command, ...rest] = (args ?? "").trim().split(/\s+/);
        if (!ctx.hasUI) return;
        if (command === "refresh" || command === "") {
          if (theme === undefined && ctx.hasUI) theme = ctx.ui.theme;
          refresh((message) => ctx.ui.notify(message, "warning"));
          ctx.ui.notify("ui-kit: config reloaded", "info");
          return;
        }
        if (command === "theme" && rest.length > 0) {
          highlight.setTheme(rest.join(" "));
          ctx.ui.notify(`ui-kit: shiki theme set to ${rest.join(" ")} (session only)`, "info");
          return;
        }
        ctx.ui.notify(
          `ui-kit: preset=${config.diffPreset} shikiTheme=${highlight.getThemeName()} adaptive=${config.themeAdaptive} renderers=${registry.registeredCount()}`,
          "info",
        );
      },
    });
  }

  return { registry, services, install };
}
