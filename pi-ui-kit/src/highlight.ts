/**
 * Shiki highlighting with an open theme pipeline — the piece pi-cc-tools
 * couldn't do. A theme can be:
 *   - a bundled shiki theme name ("github-dark", "vitesse-light", ...)
 *   - an npm module specifier resolving to a TextMate theme JSON
 *     ("@pierre/theme/pierre-dark")
 *   - a filesystem path to a theme JSON file
 *   - an inline theme registration object
 *
 * Output is ANSI truecolor lines, passed through a contrast normalizer so any
 * theme stays legible over tinted diff backgrounds.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fgAnsi, hexToRgb, luminance, RESET, type Rgb } from "./color.ts";

type ShikiModule = typeof import("shiki");
type Highlighter = Awaited<ReturnType<ShikiModule["createHighlighter"]>>;

export type ThemeSource = string | Record<string, unknown>;

const MAX_HL_CHARS = 32_000;
const CACHE_LIMIT = 128;

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript",
  cjs: "javascript", mts: "typescript", cts: "typescript", json: "json", jsonc: "jsonc",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java", kt: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", sh: "shellscript", bash: "shellscript", zsh: "shellscript",
  fish: "fish", md: "markdown", mdx: "mdx", html: "html", css: "css",
  scss: "scss", less: "less", vue: "vue", svelte: "svelte", sql: "sql",
  yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", ini: "ini",
  dockerfile: "dockerfile", tf: "terraform", lua: "lua", zig: "zig", ex: "elixir",
  exs: "elixir", erl: "erlang", hs: "haskell", ml: "ocaml", clj: "clojure",
  scala: "scala", r: "r", pl: "perl", dart: "dart", proto: "proto", graphql: "graphql",
};

export interface HighlightServiceOptions {
  /** Recolor tokens whose luminance clashes with the background. */
  contrastFloor?: { darkBg: number; lightBg: number };
}

export class HighlightService {
  private shikiPromise: Promise<ShikiModule> | null = null;
  private highlighter: Highlighter | undefined;
  private highlighterPromise: Promise<Highlighter> | null = null;
  private themeName = "github-dark";
  private themeSource: ThemeSource = "github-dark";
  private loadedLangs = new Set<string>();
  private cache = new Map<string, string[]>();
  private extraExtensions = new Map<string, string>();
  private epochCounter = 0;
  private safeMutedHex = "#9a9a9a";
  private darkBackground = true;
  private readonly contrastFloor: { darkBg: number; lightBg: number };

  constructor(options: HighlightServiceOptions = {}) {
    this.contrastFloor = options.contrastFloor ?? { darkBg: 72, lightBg: 140 };
  }

  /** Bumps whenever theme or contrast context changes; embed in render cache keys. */
  get epoch(): number {
    return this.epochCounter;
  }

  /** Map an extra file extension to a shiki language id. Returns an unregister fn. */
  registerLanguageForExtension(extension: string, language: string): () => void {
    const key = extension.toLowerCase().replace(/^\./, "");
    this.extraExtensions.set(key, language);
    return () => {
      if (this.extraExtensions.get(key) === language) this.extraExtensions.delete(key);
    };
  }

  languageForPath(path: string): string | undefined {
    const name = path.split("/").pop() ?? path;
    if (/^dockerfile$/i.test(name)) return "dockerfile";
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return this.extraExtensions.get(ext) ?? EXT_LANG[ext];
  }

  /** Foreground used when a token would be unreadable; matches palette.fgSafeMuted. */
  setContrastContext(safeMutedHex: string, darkBackground: boolean): void {
    if (this.safeMutedHex === safeMutedHex && this.darkBackground === darkBackground) return;
    this.safeMutedHex = safeMutedHex;
    this.darkBackground = darkBackground;
    this.cache.clear();
    this.epochCounter++;
  }

  /**
   * Switch theme. `source` may be a bundled name, npm specifier, JSON path, or
   * inline theme object. Resolution happens lazily on the next highlight.
   */
  setTheme(source: ThemeSource): void {
    if (source === this.themeSource) return;
    this.themeSource = source;
    this.highlighter = undefined;
    this.highlighterPromise = null;
    this.cache.clear();
    this.epochCounter++;
  }

  getThemeName(): string {
    return this.themeName;
  }

  private loadShiki(): Promise<ShikiModule> {
    if (!this.shikiPromise) {
      this.shikiPromise = import("shiki").catch((error) => {
        this.shikiPromise = null;
        throw error;
      });
    }
    return this.shikiPromise;
  }

  private async resolveTheme(shiki: ShikiModule): Promise<{ name: string; theme: unknown }> {
    const source = this.themeSource;
    if (typeof source === "object") {
      return { name: String(source.name ?? "custom"), theme: source };
    }
    if (source in shiki.bundledThemes) {
      return { name: source, theme: source };
    }
    if (source.endsWith(".json") || isAbsolute(source) || source.startsWith(".")) {
      const parsed = JSON.parse(await readFile(source, "utf-8"));
      return { name: String(parsed.name ?? source), theme: parsed };
    }
    // npm module specifier, e.g. "@pierre/theme/pierre-dark"
    const imported = await import(source);
    const theme = imported.default ?? imported;
    return { name: String((theme as { name?: string }).name ?? source), theme };
  }

  private getHighlighter(): Promise<Highlighter> {
    if (!this.highlighterPromise) {
      this.highlighterPromise = (async () => {
        const shiki = await this.loadShiki();
        const resolved = await this.resolveTheme(shiki);
        const highlighter = await shiki.createHighlighter({
          themes: [resolved.theme as never],
          langs: [],
        });
        this.themeName = resolved.name;
        this.highlighter = highlighter;
        this.loadedLangs = new Set();
        return highlighter;
      })().catch((error) => {
        this.highlighterPromise = null;
        throw error;
      });
    }
    return this.highlighterPromise;
  }

  private normalizeColor(hex: string | undefined): Rgb | undefined {
    const rgb = hex ? hexToRgb(hex) : undefined;
    if (!rgb) return undefined;
    const level = luminance(rgb);
    const clashes = this.darkBackground
      ? level < this.contrastFloor.darkBg
      : level >= this.contrastFloor.lightBg;
    if (!clashes) return rgb;
    return hexToRgb(this.safeMutedHex);
  }

  /**
   * Highlight `code` to ANSI lines. Returns undefined when the language is
   * unknown/unloadable or the block is too large — caller falls back to plain.
   */
  async codeToAnsi(code: string, language: string | undefined): Promise<string[] | undefined> {
    if (!language || code.length > MAX_HL_CHARS) return undefined;
    const cacheKey = `${this.epochCounter}\0${language}\0${code}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // LRU touch
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    try {
      const shiki = await this.loadShiki();
      const highlighter = await this.getHighlighter();
      if (!this.loadedLangs.has(language)) {
        if (!(language in shiki.bundledLanguages)) return undefined;
        await highlighter.loadLanguage(language as never);
        this.loadedLangs.add(language);
      }
      const tokenLines = highlighter.codeToTokensBase(code, {
        lang: language as never,
        theme: this.themeName as never,
      });
      const lines = tokenLines.map((tokens) => {
        let out = "";
        for (const token of tokens) {
          const rgb = this.normalizeColor(token.color ?? undefined);
          out += rgb ? `${fgAnsi(rgb)}${token.content}${RESET}` : token.content;
        }
        return out;
      });
      this.cache.set(cacheKey, lines);
      if (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      return lines;
    } catch {
      return undefined;
    }
  }
}
