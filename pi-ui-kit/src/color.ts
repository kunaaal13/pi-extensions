/**
 * Color math shared by the palette resolver and the highlighter's contrast
 * normalization. Handles truecolor and 256-color ANSI, since some terminals
 * (Apple Terminal, screen) report themes in 256-color form.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, "0")}`;
}

/** Linear interpolation between two colors; t=0 returns `from`, t=1 returns `to`. */
export function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

/** Perceptual luminance, 0-255 scale. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Standard xterm 256-color index to RGB (16-231 color cube, 232-255 gray ramp). */
export function xterm256ToRgb(index: number): Rgb {
  if (index < 16) {
    const basic: number[] = [
      0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0,
      0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff,
    ];
    const value = basic[index] ?? 0;
    return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
  }
  if (index < 232) {
    const cube = index - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    return {
      r: steps[Math.floor(cube / 36) % 6],
      g: steps[Math.floor(cube / 6) % 6],
      b: steps[cube % 6],
    };
  }
  const gray = 8 + (index - 232) * 10;
  return { r: gray, g: gray, b: gray };
}

/** Extract the color from an ANSI SGR sequence like `\x1b[38;2;r;g;bm` or `\x1b[38;5;nm`. */
export function parseAnsiColor(ansi: string): Rgb | undefined {
  const truecolor = /\[(?:38|48);2;(\d+);(\d+);(\d+)m/.exec(ansi);
  if (truecolor) {
    return {
      r: Number(truecolor[1]),
      g: Number(truecolor[2]),
      b: Number(truecolor[3]),
    };
  }
  const indexed = /\[(?:38|48);5;(\d+)m/.exec(ansi);
  if (indexed) return xterm256ToRgb(Number(indexed[1]));
  return undefined;
}

export function fgAnsi({ r, g, b }: Rgb): string {
  return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m`;
}

export function bgAnsi({ r, g, b }: Rgb): string {
  return `\x1b[48;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m`;
}

export const RESET = "\x1b[0m";
