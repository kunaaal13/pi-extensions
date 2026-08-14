# pi-ui-kit

Extensible Claude Code-style UI toolkit for the [pi coding agent](https://github.com/badlogic/pi-mono).

Where existing pi UI extensions are closed monoliths, pi-ui-kit is a **library first**: the diff engine, highlighter, palette system, and renderer registry are all exported, so other extensions can build on them — and every layer is swappable from config.

## What you get

- **Any shiki theme.** Bundled name, npm package, JSON file, or inline object:

  ```jsonc
  // .pi/settings.json
  { "uiKit": { "shikiTheme": "@pierre/theme/pierre-dark" } }
  ```

  `npm i @pierre/theme` once, and diffs/read/write previews render in [Pierre](https://diffs.com/theme). Any VS Code TextMate theme JSON works the same way.

- **Claude Code-style tool rows** for `read`, `bash`, `edit`, `write`: compact headers, syntax-highlighted previews, word-level diff emphasis, tinted add/remove backgrounds, `+N -M` stats, elapsed time on bash.

- **Clickable paths.** File paths in tool rows are OSC-8 hyperlinks (iTerm2, Ghostty, kitty, WezTerm).

- **Layered palettes.** Diff colors resolve theme-derived → preset → per-key user overrides. Presets are data; register your own:

  ```ts
  import { registerDiffPreset } from "pi-ui-kit";
  registerDiffPreset("my-preset", { bgAdd: "#0d2818", fgAdd: "#3fb950" });
  ```

- **Renderer registry.** Claim rendering for any tool by name, regex, or predicate — higher priority wins:

  ```ts
  import { createUiKit, linesComponent } from "pi-ui-kit";

  export default function (pi) {
    const kit = createUiKit(pi);
    kit.registry.register(/^mcp__github/, {
      renderResult: (result, options, theme, context, services) =>
        linesComponent((width) => [theme.fg("accent", "custom GitHub rendering")]),
    }, { priority: 10 });
    kit.install();
  }
  ```

- **Pure public API.** Rendering overrides go through `pi.registerTool` (same-name override of built-ins, execute delegated to pi's own tool factories). No prototype patching in the core.

## Install

```bash
pi install npm:pi-ui-kit        # once published
# or from a checkout:
# add the repo path to "packages" in ~/.pi/agent/settings.json
```

## Configuration

All keys live under `"uiKit"` in `.pi/settings.json` (project) or `~/.pi/settings.json` (global). Project wins. Unknown keys produce a warning instead of being silently ignored.

| Key | Default | Description |
|-----|---------|-------------|
| `shikiTheme` | `"auto"` | Bundled name, npm specifier, JSON path, or `auto` (light/dark from pi theme) |
| `diffPreset` | `"default"` | `default`, `midnight`, or a registered preset |
| `diffColors` | `{}` | Per-key overrides (`bgAdd`, `fgDel`, …, `shikiTheme`) — always win |
| `themeAdaptive` | `true` | Derive diff tints from the active pi theme |
| `previewLines` | `8` | Collapsed preview lines (read/write) |
| `expandedMaxLines` | `4000` | Max lines when expanded |
| `bashCollapsedLines` | `10` | Tail lines for collapsed bash output |
| `diffCollapsedLines` | `24` | Diff lines before collapsing |
| `hyperlinks` | `true` | OSC-8 links on file paths |
| `groupToolCalls` | `true` | Merge adjacent collapsed tool calls into one block |
| `spinner` | `true` | Claude Code-style working spinner |
| `spinnerVerbs` | `[]` | Custom verb pool for the spinner |
| `diffView` | `"auto"` | `unified`, `split`, or `auto` (split when wide) |
| `splitMinWidth` | `150` | Terminal width where `auto` switches to split |
| `header` | `false` | Two-line codex-style header (cwd + session duration) |
| `footer` | `false` | Minimal statusline (context % + tok/s │ model + thinking) |

Runtime: `/ui-kit status`, `/ui-kit refresh`, `/ui-kit theme <shiki-theme>`.

## Library surface

Everything in `src/index.ts` is public API:

- `parseUnifiedDiff` / `renderDiffRows` / `diffStat` — the diff engine
- `HighlightService` — shiki with open theme loading, ANSI output, contrast normalization, LRU cache
- `resolvePalette` / `registerDiffPreset` / `deriveFromTheme` — palette system
- `RendererRegistry` / `ToolRenderer` — renderer dispatch
- `linesComponent` / `asyncLines` — sync Components over async highlighting
- `fileLink` / `osc8` / `displayPath`, ANSI + color math utilities

## Pierre TUI themes

The package ships full pi themes generated from `@pierre/theme` — `/theme pierre-dark` or `/theme pierre-light` skins the whole TUI, not just diffs. Regenerate after a Pierre update with:

```bash
node --experimental-strip-types scripts/generate-pierre-themes.ts
```

## Roadmap

- Shiki in streaming markdown (blocked: pi's `MarkdownTheme.highlightCode` hook is sync and not reachable per-extension — needs an upstream hook)
- MCP renderer helpers, live bash output preview while running
- Status dots / branch connectors for grouped calls

## Credits

Inspired by [pi-claude-code-ui](https://github.com/FammasMaz/pi-cc-tools), [@heyhuynhgiabuu/pi-pretty and pi-diff](https://github.com/buddingnewinsights), and [pi-tool-display](https://github.com/MasuRii/pi-tool-display) — rebuilt from scratch around an exported, pluggable core.
