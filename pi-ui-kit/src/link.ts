/**
 * OSC-8 hyperlinks for file paths — terminals that support them (iTerm2,
 * Ghostty, kitty, WezTerm) make tool-row paths clickable.
 */
import { hostname } from "node:os";
import { isAbsolute, resolve } from "node:path";

const OSC = "\u001b]8;;";
const ST = "\u001b\\";

export function osc8(url: string, text: string): string {
  return `${OSC}${url}${ST}${text}${OSC}${ST}`;
}

/** Wrap `text` in a file:// hyperlink to `path` (resolved against `cwd`). */
export function fileLink(path: string, cwd: string, text?: string, enabled = true): string {
  const label = text ?? path;
  if (!enabled) return label;
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  return osc8(`file://${hostname()}${encodeURI(absolute)}`, label);
}

/** Abbreviate an absolute path under `cwd` or `~` for display. */
export function displayPath(path: string, cwd: string): string {
  if (path.startsWith(cwd + "/")) return path.slice(cwd.length + 1);
  const home = process.env.HOME;
  if (home && path.startsWith(home + "/")) return `~/${path.slice(home.length + 1)}`;
  return path;
}
