/**
 * The reusable diff engine: parse a unified diff, compute word-level emphasis
 * ranges, and render ANSI rows with syntax highlighting under tinted
 * backgrounds. Exported so any extension can render diffs the same way.
 */
import { diffWordsWithSpace } from "diff";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fit, padToWidth, stripAnsi } from "./ansi.ts";
import { RESET } from "./color.ts";
import type { HighlightService } from "./highlight.ts";
import type { ResolvedPalette } from "./palette.ts";

export type DiffLineKind = "add" | "del" | "ctx" | "hunk";

export interface DiffLine {
  kind: DiffLineKind;
  oldNumber?: number;
  newNumber?: number;
  /** Line content without the +/-/space prefix. */
  text: string;
  /** Column ranges (in the plain text) to render with the highlight background. */
  emphasis?: Array<[number, number]>;
}

export interface ParsedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** Parse unified-diff text (as produced by pi's edit tool details.diff). */
export function parseUnifiedDiff(diffText: string): ParsedDiff {
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let oldNumber = 0;
  let newNumber = 0;

  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) {
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      lines.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", newNumber: newNumber++, text: raw.slice(1) });
      added++;
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "del", oldNumber: oldNumber++, text: raw.slice(1) });
      removed++;
    } else if (raw.startsWith(" ") || raw === "") {
      lines.push({
        kind: "ctx",
        oldNumber: oldNumber++,
        newNumber: newNumber++,
        text: raw.slice(1),
      });
    }
    // "\ No newline at end of file" and similar markers are dropped.
  }

  computeWordEmphasis(lines);
  return { lines, added, removed };
}

/**
 * Pair adjacent del/add runs one-to-one and mark the changed word ranges so
 * renderers can paint a stronger background on just the edited spans.
 */
function computeWordEmphasis(lines: DiffLine[]): void {
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].kind !== "del") continue;
    const delStart = index;
    while (index < lines.length && lines[index].kind === "del") index++;
    const addStart = index;
    while (index < lines.length && lines[index].kind === "add") index++;
    const pairCount = Math.min(index - addStart, addStart - delStart);
    for (let pair = 0; pair < pairCount; pair++) {
      const delLine = lines[delStart + pair];
      const addLine = lines[addStart + pair];
      const parts = diffWordsWithSpace(delLine.text, addLine.text);
      let delCol = 0;
      let addCol = 0;
      const delRanges: Array<[number, number]> = [];
      const addRanges: Array<[number, number]> = [];
      for (const part of parts) {
        const length = part.value.length;
        if (part.removed) {
          delRanges.push([delCol, delCol + length]);
          delCol += length;
        } else if (part.added) {
          addRanges.push([addCol, addCol + length]);
          addCol += length;
        } else {
          delCol += length;
          addCol += length;
        }
      }
      // Emphasis only helps when part of the line is unchanged.
      if (delRanges.length && delRanges[0][1] - delRanges[0][0] < delLine.text.length) {
        delLine.emphasis = delRanges;
      }
      if (addRanges.length && addRanges[0][1] - addRanges[0][0] < addLine.text.length) {
        addLine.emphasis = addRanges;
      }
    }
    index--;
  }
}

export interface RenderDiffOptions {
  width: number;
  palette: ResolvedPalette;
  /** Pre-highlighted ANSI per diff line (same order as `lines`); plain text fallback when absent. */
  highlighted?: (string | undefined)[];
  /** Collapse to this many content lines; 0 or undefined renders everything. */
  maxLines?: number;
}

/** `+12 -4` stat text (uncolored; callers style it). */
export function diffStat(diff: ParsedDiff): string {
  return `+${diff.added} -${diff.removed}`;
}

/**
 * Render diff rows: `lnum  content` with add/del backgrounds, word-emphasis
 * tint, and a trailing `… +N more lines` marker when collapsed.
 */
export function renderDiffRows(diff: ParsedDiff, options: RenderDiffOptions): string[] {
  const { palette, width } = options;
  const contentLines = diff.lines.filter((line) => line.kind !== "hunk");
  const limit =
    options.maxLines && options.maxLines > 0 && contentLines.length > options.maxLines
      ? options.maxLines
      : undefined;

  const gutterWidth = String(
    Math.max(1, ...contentLines.map((line) => line.newNumber ?? line.oldNumber ?? 1)),
  ).length;

  const rows: string[] = [];
  let rendered = 0;
  for (let index = 0; index < diff.lines.length; index++) {
    const line = diff.lines[index];
    if (line.kind === "hunk") {
      if (rows.length > 0) rows.push(`${palette.ansi.fgRule}${fit("⋮", width)}${RESET}`);
      continue;
    }
    if (limit !== undefined && rendered >= limit) {
      const remaining = contentLines.length - rendered;
      rows.push(`${palette.ansi.fgDim}… +${remaining} more lines${RESET}`);
      break;
    }
    rendered++;

    const isAdd = line.kind === "add";
    const isDel = line.kind === "del";
    const background = isAdd ? palette.ansi.bgAdd : isDel ? palette.ansi.bgDel : "";
    const emphasisBg = isAdd ? palette.ansi.bgAddHighlight : palette.ansi.bgDelHighlight;
    const gutterBg = isAdd ? palette.ansi.bgGutterAdd : isDel ? palette.ansi.bgGutterDel : "";
    const sign = isAdd ? "+" : isDel ? "-" : " ";
    const signColor = isAdd ? palette.ansi.fgAdd : isDel ? palette.ansi.fgDel : palette.ansi.fgDim;
    const number = line.newNumber ?? line.oldNumber ?? 0;
    const gutter = `${gutterBg}${palette.ansi.fgLnum} ${String(number).padStart(gutterWidth)} ${RESET}`;

    const highlightedText = options.highlighted?.[index];
    let body = buildBody(line, highlightedText, background, emphasisBg);
    const prefix = `${gutter}${background}${signColor}${sign} ${RESET}${background}`;
    const used = 1 + gutterWidth + 2 + 2; // gutter padding + number + sign cell
    body = fitPreservingBackground(body, Math.max(4, width - used), background);
    rows.push(padToWidth(`${prefix}${body}`, width, background || undefined));
  }
  return rows;
}

function buildBody(
  line: DiffLine,
  highlighted: string | undefined,
  background: string,
  emphasisBg: string,
): string {
  if (line.emphasis && line.emphasis.length > 0 && !highlighted) {
    // Plain text with emphasis backgrounds spliced in by column.
    let out = "";
    let cursor = 0;
    for (const [start, end] of line.emphasis) {
      out += line.text.slice(cursor, start);
      out += `${emphasisBg}${line.text.slice(start, end)}${RESET}${background}`;
      cursor = end;
    }
    out += line.text.slice(cursor);
    return out;
  }
  if (highlighted) {
    // Re-assert the row background after every reset inside the highlight.
    return highlighted.replaceAll(RESET, `${RESET}${background}`);
  }
  return line.text;
}

function fitPreservingBackground(body: string, maxWidth: number, background: string): string {
  if (visibleWidth(stripAnsi(body)) <= maxWidth) return body;
  return fit(body, maxWidth - 1) + background;
}

interface SplitCell {
  line?: DiffLine;
  index: number;
}

/** Pair old/new sides for split view: ctx lines mirror, del/add runs zip. */
function pairForSplit(lines: DiffLine[]): Array<{ left: SplitCell; right: SplitCell }> {
  const pairs: Array<{ left: SplitCell; right: SplitCell }> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.kind === "hunk") continue;
    if (line.kind === "ctx") {
      pairs.push({ left: { line, index }, right: { line, index } });
      continue;
    }
    if (line.kind === "del") {
      const delStart = index;
      while (index < lines.length && lines[index].kind === "del") index++;
      const addStart = index;
      while (index < lines.length && lines[index].kind === "add") index++;
      const delCount = addStart - delStart;
      const addCount = index - addStart;
      for (let row = 0; row < Math.max(delCount, addCount); row++) {
        pairs.push({
          left: { line: lines[delStart + row]?.kind === "del" ? lines[delStart + row] : undefined, index: delStart + row },
          right: { line: row < addCount ? lines[addStart + row] : undefined, index: addStart + row },
        });
      }
      index--;
      continue;
    }
    // Standalone add run (no preceding del).
    pairs.push({ left: { line: undefined, index }, right: { line, index } });
  }
  return pairs;
}

function renderSplitCell(
  cell: SplitCell,
  cellWidth: number,
  side: "left" | "right",
  options: RenderDiffOptions,
  gutterWidth: number,
): string {
  const { palette } = options;
  const line = cell.line;
  if (!line) {
    return `${palette.ansi.bgEmpty}${" ".repeat(cellWidth)}${RESET}`;
  }
  const isChange = side === "left" ? line.kind === "del" : line.kind === "add";
  const background = !isChange ? "" : side === "left" ? palette.ansi.bgDel : palette.ansi.bgAdd;
  const emphasisBg = side === "left" ? palette.ansi.bgDelHighlight : palette.ansi.bgAddHighlight;
  const number = side === "left" ? line.oldNumber : line.newNumber;
  const gutter = `${palette.ansi.fgLnum} ${String(number ?? "").padStart(gutterWidth)} ${RESET}`;
  const highlighted = options.highlighted?.[cell.index];
  let body = buildBody(line, highlighted, background, emphasisBg);
  const bodyWidth = Math.max(2, cellWidth - gutterWidth - 2);
  body = fitPreservingBackground(body, bodyWidth, background);
  return padToWidth(`${gutter}${background}${body}`, cellWidth, background || undefined);
}

/**
 * Side-by-side split view: old on the left, new on the right, separated by a
 * rule. Same palette/highlight inputs as `renderDiffRows`.
 */
export function renderSplitDiffRows(diff: ParsedDiff, options: RenderDiffOptions): string[] {
  const { palette, width } = options;
  const divider = `${palette.ansi.fgRule}│${RESET}`;
  const cellWidth = Math.max(10, Math.floor((width - 1) / 2));
  const contentLines = diff.lines.filter((line) => line.kind !== "hunk");
  const gutterWidth = String(
    Math.max(1, ...contentLines.map((line) => line.newNumber ?? line.oldNumber ?? 1)),
  ).length;

  const pairs = pairForSplit(diff.lines);
  const limit =
    options.maxLines && options.maxLines > 0 && pairs.length > options.maxLines
      ? options.maxLines
      : undefined;

  const rows: string[] = [];
  for (let row = 0; row < pairs.length; row++) {
    if (limit !== undefined && row >= limit) {
      rows.push(`${palette.ansi.fgDim}… +${pairs.length - row} more lines${RESET}`);
      break;
    }
    const pair = pairs[row];
    rows.push(
      renderSplitCell(pair.left, cellWidth, "left", options, gutterWidth) +
        divider +
        renderSplitCell(pair.right, cellWidth, "right", options, gutterWidth),
    );
  }
  return rows;
}
