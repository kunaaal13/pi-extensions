/**
 * Nerd-font file icons with language-identity colors. Rendered before file
 * paths in tool headers when `fileIcons` is enabled (needs a Nerd Font).
 */

interface IconEntry {
  glyph: string;
  color: string;
}

const EXT_ICON: Record<string, IconEntry> = {
  ts: { glyph: "", color: "#3178c6" },
  tsx: { glyph: "", color: "#3178c6" },
  js: { glyph: "", color: "#f1e05a" },
  jsx: { glyph: "", color: "#61dafb" },
  mjs: { glyph: "", color: "#f1e05a" },
  cjs: { glyph: "", color: "#f1e05a" },
  json: { glyph: "", color: "#cbcb41" },
  py: { glyph: "", color: "#3572a5" },
  rb: { glyph: "", color: "#701516" },
  rs: { glyph: "", color: "#dea584" },
  go: { glyph: "", color: "#00add8" },
  java: { glyph: "", color: "#b07219" },
  kt: { glyph: "", color: "#a97bff" },
  swift: { glyph: "", color: "#f05138" },
  c: { glyph: "", color: "#555555" },
  h: { glyph: "", color: "#a074c4" },
  cpp: { glyph: "", color: "#f34b7d" },
  cs: { glyph: "", color: "#178600" },
  php: { glyph: "", color: "#4f5d95" },
  sh: { glyph: "", color: "#89e051" },
  bash: { glyph: "", color: "#89e051" },
  zsh: { glyph: "", color: "#89e051" },
  md: { glyph: "", color: "#519aba" },
  mdx: { glyph: "", color: "#519aba" },
  html: { glyph: "", color: "#e34c26" },
  css: { glyph: "", color: "#563d7c" },
  scss: { glyph: "", color: "#c6538c" },
  vue: { glyph: "﵂", color: "#41b883" },
  svelte: { glyph: "", color: "#ff3e00" },
  sql: { glyph: "", color: "#e38c00" },
  yaml: { glyph: "", color: "#cb171e" },
  yml: { glyph: "", color: "#cb171e" },
  toml: { glyph: "", color: "#9c4221" },
  xml: { glyph: "", color: "#0060ac" },
  lua: { glyph: "", color: "#000080" },
  zig: { glyph: "", color: "#ec915c" },
  ex: { glyph: "", color: "#6e4a7e" },
  exs: { glyph: "", color: "#6e4a7e" },
  hs: { glyph: "", color: "#5e5086" },
  dart: { glyph: "", color: "#00b4ab" },
  tf: { glyph: "", color: "#7b42bc" },
  dockerfile: { glyph: "", color: "#384d54" },
  lock: { glyph: "", color: "#7a7a7a" },
  txt: { glyph: "", color: "#89909f" },
};

const NAME_ICON: Record<string, IconEntry> = {
  dockerfile: EXT_ICON.dockerfile,
  makefile: { glyph: "", color: "#6d8086" },
  "package.json": { glyph: "", color: "#cb3837" },
  "tsconfig.json": EXT_ICON.ts,
  ".gitignore": { glyph: "", color: "#f14c28" },
};

const DEFAULT_ICON: IconEntry = { glyph: "", color: "#89909f" };

/**
 * Returns the ANSI-colored icon for a path (with trailing space), or "" when
 * icons are disabled.
 */
export function fileIcon(path: string, enabled: boolean): string {
  if (!enabled) return "";
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  const icon = NAME_ICON[name] ?? EXT_ICON[ext] ?? DEFAULT_ICON;
  const value = Number.parseInt(icon.color.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `\x1b[38;2;${r};${g};${b}m${icon.glyph}\x1b[0m `;
}
