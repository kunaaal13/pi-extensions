/**
 * Generate full pi TUI themes from @pierre/theme's VS Code themes, so the
 * whole terminal — not just diffs — wears Pierre.
 *
 *   node --experimental-strip-types scripts/generate-pierre-themes.ts
 *
 * Reads @pierre/theme/themes/pierre-{dark,light}.json and writes
 * themes/pierre-{dark,light}.json in pi's theme schema (all ThemeColor and
 * ThemeBg keys). Committed output; re-run when @pierre/theme updates.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hexToRgb, mix, rgbToHex, type Rgb } from "../src/color.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

interface TokenColor {
  scope?: string | string[];
  settings?: { foreground?: string };
}

interface VsCodeTheme {
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
  tokenColors: TokenColor[];
}

function scopeColor(theme: VsCodeTheme, ...targets: string[]): string | undefined {
  const tokenScopes = theme.tokenColors.map((token) => ({
    scopes:
      typeof token.scope === "string" ? token.scope.split(/,\s*/) : (token.scope ?? []),
    foreground: token.settings?.foreground,
  }));
  // Exact scope match wins over prefix match so "variable" doesn't resolve to
  // "variable.other.constant" just because it appears earlier in the file.
  for (const target of targets) {
    for (const token of tokenScopes) {
      if (token.foreground && token.scopes.includes(target)) return token.foreground;
    }
  }
  for (const target of targets) {
    for (const token of tokenScopes) {
      if (token.foreground && token.scopes.some((scope) => scope.startsWith(target))) {
        return token.foreground;
      }
    }
  }
  return undefined;
}

function must(hex: string | undefined, fallback: string): Rgb {
  return hexToRgb(hex ?? fallback) ?? hexToRgb(fallback)!;
}

function generate(sourceFile: string, outName: string): void {
  const source: VsCodeTheme = JSON.parse(
    readFileSync(join(root, "node_modules/@pierre/theme/themes", sourceFile), "utf-8"),
  );
  const dark = source.type === "dark";

  const bg = must(source.colors["editor.background"], dark ? "#0a0a0a" : "#ffffff");
  const text = must(source.colors["editor.foreground"], dark ? "#fafafa" : "#0a0a0a");
  const accent = must(source.colors["focusBorder"] ?? source.colors["button.background"], "#009fff");

  const comment = must(scopeColor(source, "comment"), dark ? "#737373" : "#a3a3a3");
  const keyword = must(scopeColor(source, "keyword"), "#ff678d");
  const func = must(scopeColor(source, "entity.name.function", "support.function"), "#9d6afb");
  const variable = must(scopeColor(source, "variable"), "#ffa359");
  const string = must(scopeColor(source, "string"), "#5ecc71");
  const number = must(scopeColor(source, "constant.numeric"), "#68cdf2");
  const yellow = must(scopeColor(source, "constant"), "#ffd452");
  const type = must(scopeColor(source, "entity.name.type", "support.type"), "#d568ea");
  const operator = must(
    scopeColor(source, "keyword.operator.logical", "keyword.operator.assignment"),
    "#08c0ef",
  );
  const punctuation = must(scopeColor(source, "punctuation"), dark ? "#636363" : "#a3a3a3");
  // Pierre's "invalid" scope is styled like plain text; keyword pink is the
  // theme's actual danger color (also used for markup.deleted underlines).
  let red = must(scopeColor(source, "markup.deleted"), rgbToHex(keyword));
  if (rgbToHex(red) === rgbToHex(text)) red = keyword;

  const toward = (a: Rgb, b: Rgb, t: number) => rgbToHex(mix(a, b, t));
  const muted = toward(text, bg, 0.35);
  const dim = toward(text, bg, 0.55);

  const thinkingRamp = [0.55, 0.44, 0.33, 0.22, 0.11, 0.0].map((t) =>
    toward(accent, bg, t),
  );

  const theme = {
    $schema:
      "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
    name: outName,
    vars: {
      bg: rgbToHex(bg),
      text: rgbToHex(text),
      accent: rgbToHex(accent),
      muted,
      dim,
      green: rgbToHex(string),
      red: rgbToHex(red),
      yellow: rgbToHex(yellow),
      orange: rgbToHex(variable),
      blue: rgbToHex(number),
      pink: rgbToHex(keyword),
      violet: rgbToHex(func),
      magenta: rgbToHex(type),
      gray: rgbToHex(punctuation),
    },
    colors: {
      accent: "accent",
      border: toward(text, bg, 0.7),
      borderAccent: "accent",
      borderMuted: toward(text, bg, 0.82),
      success: "green",
      error: "red",
      warning: "yellow",
      muted: "muted",
      dim: "dim",
      text: "text",
      thinkingText: "muted",

      selectedBg: toward(bg, text, 0.12),
      scrollbarThumb: toward(bg, text, 0.18),
      searchMatchBg: toward(bg, accent, 0.25),
      searchMatchText: "text",
      userMessageBg: toward(bg, text, 0.06),
      userMessageText: "text",
      customMessageBg: toward(bg, func, 0.08),
      customMessageText: "text",
      customMessageLabel: "violet",
      toolPendingBg: toward(bg, accent, 0.06),
      toolSuccessBg: toward(bg, text, 0.04),
      toolErrorBg: toward(bg, red, 0.08),
      toolTitle: "text",
      toolOutput: "muted",

      mdHeading: "violet",
      mdLink: "accent",
      mdLinkUrl: "dim",
      mdCode: "pink",
      mdCodeBlock: "green",
      mdCodeBlockBorder: "gray",
      mdQuote: "muted",
      mdQuoteBorder: "gray",
      mdHr: "gray",
      mdListBullet: "accent",

      toolDiffAdded: "green",
      toolDiffRemoved: "red",
      toolDiffContext: "muted",

      syntaxComment: rgbToHex(comment),
      syntaxKeyword: "pink",
      syntaxFunction: "violet",
      syntaxVariable: rgbToHex(variable),
      syntaxString: "green",
      syntaxNumber: "blue",
      syntaxType: "magenta",
      syntaxOperator: rgbToHex(operator),
      syntaxPunctuation: "gray",

      thinkingOff: thinkingRamp[0],
      thinkingMinimal: thinkingRamp[1],
      thinkingLow: thinkingRamp[2],
      thinkingMedium: thinkingRamp[3],
      thinkingHigh: thinkingRamp[4],
      thinkingXhigh: thinkingRamp[5],
      thinkingMax: "accent",
      bashMode: "orange",
    },
  };

  // Every color must be a hex literal or resolve to a declared var.
  for (const [key, value] of Object.entries(theme.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(value) && !(value in theme.vars)) {
      throw new Error(`${outName}: color "${key}" references unknown var "${value}"`);
    }
  }

  mkdirSync(join(root, "themes"), { recursive: true });
  const outPath = join(root, "themes", `${outName}.json`);
  writeFileSync(outPath, JSON.stringify(theme, null, "\t") + "\n");
  console.log(`wrote ${outPath}`);
}

generate("pierre-dark.json", "pierre-dark");
generate("pierre-light.json", "pierre-light");
