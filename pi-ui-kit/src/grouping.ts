/**
 * Grouped adjacent tool calls: contiguous runs of collapsed, successful tool
 * rows merge into one block with a per-tool heading and compact bullet rows.
 *
 * Pi has no public transcript/tool-grouping hook (checked against 0.84.2), so
 * this module patches two prototypes: ToolExecutionComponent (per-row
 * presentation) and Container (which rows sit next to which). Every patch is
 * guarded, idempotent, restored on session_shutdown, and checks the runtime
 * enable flag on every render — `/ui-kit refresh` toggles it live. A pi
 * internals change makes this silently no-op instead of breaking the session.
 *
 * This is the ONLY module in pi-ui-kit that touches pi internals; everything
 * else is public API. Disable with `"uiKit": { "groupToolCalls": false }`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AssistantMessageComponent,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  sliceByColumn,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { stripAnsi } from "./ansi.ts";

const PRESENTATION_PATCHED = Symbol.for("pi-ui-kit.toolGroups.presentation.v1");
const GROUPING_PATCHED = Symbol.for("pi-ui-kit.toolGroups.grouping.v1");

let groupingEnabled: () => boolean = () => true;

type ThemeLike = {
  bold(text: string): string;
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
};

type ComponentLike = {
  render(width: number): string[];
  invalidate(): void;
};

type ComponentContainer = ComponentLike & {
  children?: unknown[];
  removeChild?(component: unknown): void;
};

type TextComponent = {
  text?: string;
  setText?(text: string): void;
};

type ToolExecutionRow = {
  toolName?: string;
  args?: unknown;
  expanded?: boolean;
  isPartial?: boolean;
  result?: {
    isError?: boolean;
    content?: Array<{ type?: unknown; text?: unknown }>;
    details?: Record<string, unknown>;
  };
  rendererState?: { startedAt?: unknown; endedAt?: unknown };
  contentBox?: ComponentContainer;
  contentText?: TextComponent;
  callRendererComponent?: ComponentLike;
  imageComponents?: unknown[];
  imageSpacers?: unknown[];
  hasRendererDefinition?(): boolean;
  getRenderShell?(): "default" | "self";
  getTextOutput?(): string;
  removeChild?(component: unknown): void;
};

type PresentationPatchState = {
  theme?: ThemeLike;
  groupCache: WeakMap<ToolExecutionRow, GroupRenderCache>;
  liveRenderedRows: WeakSet<ToolExecutionRow>;
  rowVersions: WeakMap<ToolExecutionRow, number>;
  rowGroups: WeakMap<ToolExecutionRow, ToolExecutionRow[]>;
  rowSignatures: WeakMap<ToolExecutionRow, string>;
  originalRender: (width: number) => string[];
  originalUpdateDisplay: () => void;
  patchedRender?: (width: number) => string[];
  patchedUpdateDisplay?: () => void;
};

type GroupingPatchState = {
  presentation: PresentationPatchState;
  originalRender: (width: number) => string[];
  patchedRender?: (width: number) => string[];
};

type GroupRenderCache = {
  lines: string[];
  members: ToolExecutionRow[];
  memberVersions: number[];
  themeSample: string;
  width: number;
};

function hasVisibleContent(line: string): boolean {
  return stripAnsi(line).trim().length > 0;
}

function removeResultComponent(container?: ComponentContainer): boolean {
  if (
    !container ||
    !Array.isArray(container.children) ||
    typeof container.removeChild !== "function"
  )
    return false;
  for (const child of container.children.slice(1)) container.removeChild(child);
  return true;
}

function collapseGenericResult(row: ToolExecutionRow): boolean {
  const text = row.contentText?.text;
  if (
    typeof text !== "string" ||
    typeof row.contentText?.setText !== "function"
  )
    return false;

  const output = row.getTextOutput?.();
  if (!output) return true;
  const suffix = `\n${output}`;
  if (!text.endsWith(suffix)) return false;
  row.contentText.setText(text.slice(0, -suffix.length));
  return true;
}

function hideResultImages(row: ToolExecutionRow): void {
  if (typeof row.removeChild !== "function") return;
  for (const image of row.imageComponents ?? []) row.removeChild(image);
  for (const spacer of row.imageSpacers ?? []) row.removeChild(spacer);
  row.imageComponents = [];
  row.imageSpacers = [];
}

function hasImageResult(row: ToolExecutionRow): boolean {
  return (
    row.result?.content?.some((content) => content.type === "image") === true ||
    (row.imageComponents?.length ?? 0) > 0 ||
    (row.imageSpacers?.length ?? 0) > 0
  );
}

function collapseSuccessfulResult(row: ToolExecutionRow): void {
  if (
    row.expanded !== false ||
    row.isPartial !== false ||
    !row.result ||
    row.result.isError ||
    hasImageResult(row) ||
    row.getRenderShell?.() === "self"
  )
    return;

  const collapsed = row.hasRendererDefinition?.()
    ? removeResultComponent(row.contentBox)
    : collapseGenericResult(row);
  if (collapsed) hideResultImages(row);
}

function isToolExecutionRow(
  component: unknown,
): component is ToolExecutionRow & ComponentLike {
  return component instanceof ToolExecutionComponent;
}

function isAssistantMessageRow(component: unknown): boolean {
  return component instanceof AssistantMessageComponent;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function bashDurationText(row: ToolExecutionRow): string | undefined {
  const startedAt = row.rendererState?.startedAt;
  const endedAt = row.rendererState?.endedAt;
  if (
    typeof startedAt !== "number" ||
    typeof endedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt)
  )
    return undefined;
  return formatDuration(Math.max(0, endedAt - startedAt));
}

function liveElapsedText(row: ToolExecutionRow): string | undefined {
  if (row.toolName !== "bash") return undefined;
  const startedAt = row.rendererState?.startedAt;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt))
    return undefined;
  return formatDuration(Math.max(0, Date.now() - startedAt));
}

// A row still streaming or awaiting its result: no result yet, and it isn't
// a self-rendered tool that owns a live-updating preview of its own.
function isLiveRow(row: ToolExecutionRow): boolean {
  return (
    row.expanded === false &&
    (row.isPartial !== false || !row.result) &&
    row.getRenderShell?.() !== "self" &&
    !hasImageResult(row)
  );
}

function isCollapsibleSuccess(row: ToolExecutionRow): boolean {
  return (
    row.expanded === false &&
    row.isPartial === false &&
    !!row.result &&
    !row.result.isError &&
    !hasImageResult(row)
  );
}

function isSettledToolRow(row: ToolExecutionRow): boolean {
  return row.isPartial === false && !!row.result;
}

// Groupable = collapsed, not failed, no image payload. A failed call keeps
// its own error-colored block; an expanded call keeps the full detail view.
function isGroupableToolRow(row: ToolExecutionRow): boolean {
  return isLiveRow(row) || isCollapsibleSuccess(row);
}

function compactArgs(args: unknown): string {
  if (args === undefined || args === null) return "";
  try {
    const text = JSON.stringify(args);
    return text === "{}" ? "" : text;
  } catch {
    return String(args);
  }
}

function resultText(row: ToolExecutionRow): string {
  const contentText = row.result?.content?.find(
    (content) => content.type === "text" && typeof content.text === "string",
  )?.text;
  if (typeof contentText === "string") return contentText;
  return row.getTextOutput?.() ?? "";
}

function textLineCount(text: string): number {
  if (!text) return 0;
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}

function resultCount(row: ToolExecutionRow, text: string): number {
  const totalMatched = row.result?.details?.totalMatched;
  if (typeof totalMatched === "number" && Number.isFinite(totalMatched))
    return Math.max(0, totalMatched);

  const trimmed = text.trim();
  if (
    !trimmed ||
    /^(?:No matches found|No files found|\(empty directory\))/i.test(trimmed)
  )
    return 0;

  if (row.toolName === "grep") {
    const lines = trimmed.split("\n");
    const matches = lines.filter(
      (line) => /^.+:\d+:/.test(line) || /^\s+\d+:/.test(line),
    ).length;
    if (matches > 0) return matches;
  }

  return trimmed
    .split("\n")
    .filter((line) => line.trim() && !/^\s*\[.*\]\s*$/.test(line)).length;
}

function readLineCount(row: ToolExecutionRow, text: string): number {
  const outputLines = (
    row.result?.details?.truncation as { outputLines?: unknown } | undefined
  )?.outputLines;
  if (typeof outputLines === "number" && Number.isFinite(outputLines))
    return Math.max(0, outputLines);

  const content = text.replace(
    /\n\n\[[^\n]*(?:more lines|showing lines)[^\n]*\]\s*$/i,
    "",
  );
  return textLineCount(content);
}

function diffCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function outcomeSummary(row: ToolExecutionRow): string | undefined {
  if (!isCollapsibleSuccess(row)) return undefined;

  const text = resultText(row);
  switch (row.toolName) {
    case "bash": {
      const duration = bashDurationText(row);
      return duration ? `done · ${duration}` : "done";
    }
    case "read": {
      const lines = readLineCount(row, text);
      return `${lines} ${lines === 1 ? "line" : "lines"}`;
    }
    case "write": {
      const content = (row.args as { content?: unknown } | undefined)?.content;
      if (typeof content !== "string") return "written";
      const lines = textLineCount(content);
      return `${lines} ${lines === 1 ? "line" : "lines"}`;
    }
    case "edit": {
      const diff = row.result?.details?.diff;
      if (typeof diff !== "string") return "applied";
      const { added, removed } = diffCounts(diff);
      return `+${added}/-${removed}`;
    }
    case "grep":
    case "find":
    case "ls": {
      const results = resultCount(row, text);
      return `${results} ${results === 1 ? "result" : "results"}`;
    }
    default:
      return undefined;
  }
}

function renderedOutcome(
  row: ToolExecutionRow,
  theme: ThemeLike,
): string | undefined {
  const summary = outcomeSummary(row);
  if (!summary) return undefined;
  return `${theme.fg("muted", "→")} ${theme.fg("success", summary)}`;
}

function renderedGroupedOutcome(
  row: ToolExecutionRow,
  theme: ThemeLike,
): string | undefined {
  const outcome = renderedOutcome(row, theme);
  if (outcome) return outcome;
  if (!isLiveRow(row)) return undefined;
  const elapsed = liveElapsedText(row);
  return theme.fg("muted", elapsed ? `· ${elapsed}` : "…");
}

function trimRenderedLine(text: string): string {
  const plain = stripAnsi(text);
  const leading = plain.match(/^\s*/)?.[0] ?? "";
  const trimmed = plain.trim();
  if (!trimmed) return "";
  return sliceByColumn(
    text,
    visibleWidth(leading),
    visibleWidth(trimmed),
  ).trimEnd();
}

function removeTrailingExpandHint(text: string): string {
  const plain = stripAnsi(text).trimEnd();
  const hint = plain.match(/\s+\([^)]*to expand\)$/i);
  if (hint?.index === undefined) return text.trimEnd();
  return sliceByColumn(
    text,
    0,
    visibleWidth(plain.slice(0, hint.index)),
  ).trimEnd();
}

function renderedCallSummary(
  row: ToolExecutionRow,
  width: number,
  theme: ThemeLike,
): string {
  let component = row.callRendererComponent;
  if (!component && Array.isArray(row.contentBox?.children)) {
    component = row.contentBox.children[0] as ComponentLike | undefined;
  }

  const selfRendered = row.getRenderShell?.() === "self";
  if (component && typeof component.render === "function") {
    const visibleLines = component
      .render(Math.max(1, width))
      .filter(hasVisibleContent);
    const rendered = visibleLines.slice(0, selfRendered ? 1 : 3);
    const line = rendered[0];
    if (line) {
      const first = trimRenderedLine(line);
      const plain = stripAnsi(first);
      const match = /^(\s*)(\S+)(\s*)/.exec(plain);
      if (match) {
        const expectedToken = row.toolName === "bash" ? "$" : row.toolName;
        const hasKnownHeading =
          match[2] === expectedToken ||
          (row.toolName === "read" &&
            (match[2] === "read" || match[2] === "[skill]"));
        const summaryStart = hasKnownHeading
          ? visibleWidth((match[1] ?? "") + (match[2] ?? "") + (match[3] ?? ""))
          : 0;
        const firstSummary = removeTrailingExpandHint(
          sliceByColumn(
            first,
            summaryStart,
            Math.max(0, visibleWidth(first) - summaryStart),
          ),
        );
        const continuations = rendered
          .slice(1)
          .map(trimRenderedLine)
          .filter(hasVisibleContent);
        if (visibleLines.length > rendered.length)
          continuations.push(theme.fg("muted", "…"));
        const compact = [firstSummary, ...continuations]
          .filter(hasVisibleContent)
          .join(theme.fg("muted", " · "));
        if (hasVisibleContent(compact)) return compact;
      }
    }
  }

  if (selfRendered) return theme.fg("muted", "(details omitted)");

  const fallback = compactArgs(row.args);
  return fallback
    ? theme.fg("accent", fallback)
    : theme.fg("muted", "(no arguments)");
}

// Wrap instead of truncate: a long path or command flows onto a hanging
// second line instead of losing its tail behind an ellipsis. The outcome
// tail rides the last wrapped line when it fits, otherwise gets its own
// line — it never gets silently dropped either.
function compactBulletLines(
  summary: string,
  outcome: string | undefined,
  width: number,
  theme: ThemeLike,
): string[] {
  const bullet = `  ${theme.fg("muted", "•")} `;
  const indentWidth = visibleWidth(bullet);
  const continuationIndent = " ".repeat(indentWidth);
  if (width <= indentWidth) return [truncateToWidth(bullet, width, "", false)];

  const available = width - indentWidth;
  const outcomeWidth = outcome ? visibleWidth(outcome) + 1 : 0;

  if (visibleWidth(summary) + outcomeWidth <= available) {
    return [bullet + summary + (outcome ? ` ${outcome}` : "")];
  }

  const wrapped = wrapTextWithAnsi(summary, available);
  const lines = wrapped.map((line, index) =>
    (index === 0 ? bullet : continuationIndent) + line,
  );
  if (!outcome) return lines;

  const lastIndex = lines.length - 1;
  const lastLine = lines[lastIndex] ?? continuationIndent;
  if (visibleWidth(lastLine) + outcomeWidth <= width) {
    lines[lastIndex] = `${lastLine} ${outcome}`;
  } else {
    lines.push(`${continuationIndent}${outcome}`);
  }
  return lines;
}

function groupedCallComponent(
  rows: ToolExecutionRow[],
  theme: ThemeLike,
): ComponentLike {
  return {
    render(width: number): string[] {
      const lines: string[] = [];
      let previousToolName: string | undefined;
      for (const row of rows) {
        if (lines.length === 0 || row.toolName !== previousToolName) {
          if (lines.length > 0) lines.push("");
          const token =
            row.toolName === "bash" ? "$" : (row.toolName ?? "tool");
          const heading = theme.fg("toolTitle", theme.bold(token));
          lines.push(truncateToWidth(heading, width, "", false));
          previousToolName = row.toolName;
        }
        const call = renderedCallSummary(row, Math.max(1, width - 4), theme);
        const outcome = renderedGroupedOutcome(row, theme);
        lines.push(...compactBulletLines(call, outcome, width, theme));
      }
      return lines;
    },
    invalidate() {},
  };
}

function renderWithTemporaryChild(
  container: ComponentContainer,
  child: ComponentLike,
  render: () => string[],
): string[] {
  const children = container.children;
  if (!Array.isArray(children)) return render();
  container.children = [child];
  try {
    return render();
  } finally {
    container.children = children;
  }
}

function sameMembers(
  left: ToolExecutionRow[],
  right: ToolExecutionRow[],
): boolean {
  return (
    left.length === right.length &&
    left.every((member, index) => member === right[index])
  );
}

function sameMemberVersions(
  rows: ToolExecutionRow[],
  versions: number[],
  state: PresentationPatchState,
): boolean {
  return (
    rows.length === versions.length &&
    rows.every(
      (row, index) => (state.rowVersions.get(row) ?? 0) === versions[index],
    )
  );
}

function renderGroupedToolRows(
  row: ToolExecutionRow,
  rows: ToolExecutionRow[],
  width: number,
  state: PresentationPatchState,
): string[] {
  const theme = state.theme;
  if (!theme) return state.originalRender.call(row, width);

  const themeSample =
    theme.fg("toolTitle", "x") +
    theme.fg("muted", "x") +
    theme.bg("toolPendingBg", "x") +
    theme.bg("toolSuccessBg", "x");
  const cached = state.groupCache.get(row);
  const hasLiveMembers = rows.some(isLiveRow);
  if (
    !hasLiveMembers &&
    cached &&
    cached.width === width &&
    cached.themeSample === themeSample &&
    sameMembers(cached.members, rows) &&
    sameMemberVersions(rows, cached.memberVersions, state)
  ) {
    return cached.lines;
  }

  const summary = groupedCallComponent(rows, theme);
  let lines: string[];
  if (!row.hasRendererDefinition?.()) {
    const text = row.contentText;
    const previous = text?.text;
    if (typeof previous !== "string" || typeof text?.setText !== "function") {
      return state.originalRender.call(row, width);
    }
    text.setText(summary.render(Math.max(1, width - 2)).join("\n"));
    try {
      lines = state.originalRender.call(row, width);
    } finally {
      text.setText(previous);
    }
  } else {
    const container =
      row.getRenderShell?.() === "self" ? undefined : row.contentBox;
    if (!container) return state.originalRender.call(row, width);
    lines = renderWithTemporaryChild(container, summary, () =>
      state.originalRender.call(row, width),
    );
  }

  if (hasLiveMembers) {
    state.groupCache.delete(row);
  } else {
    state.groupCache.set(row, {
      lines,
      members: [...rows],
      memberVersions: rows.map((member) => state.rowVersions.get(member) ?? 0),
      themeSample,
      width,
    });
  }
  return lines;
}

function renderComponent(component: unknown, width: number): string[] {
  if (!component || typeof (component as ComponentLike).render !== "function")
    return [];
  return (component as ComponentLike).render(width);
}

function renderContainerWithToolGroups(
  children: unknown[],
  width: number,
  presentation: PresentationPatchState,
): string[] {
  const lines: string[] = [];
  const rendered = new Map<number, string[]>();
  const renderAt = (index: number): string[] => {
    const cached = rendered.get(index);
    if (cached) return cached;
    const next = renderComponent(children[index], width);
    rendered.set(index, next);
    return next;
  };

  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (!isToolExecutionRow(child) || !isGroupableToolRow(child)) {
      lines.push(...renderAt(index));
      continue;
    }

    // Self-rendered tools can change height while active. Keep a live
    // instance of one individual so settling never collapses an
    // already-painted preview mid-render.
    if (
      child.getRenderShell?.() === "self" &&
      presentation.liveRenderedRows.has(child)
    ) {
      lines.push(...renderAt(index));
      continue;
    }

    const group: ToolExecutionRow[] = [child];
    let lastMemberIndex = index;
    for (
      let candidateIndex = index + 1;
      candidateIndex < children.length;
      candidateIndex++
    ) {
      const candidate = children[candidateIndex];
      if (isAssistantMessageRow(candidate)) {
        if (renderAt(candidateIndex).some(hasVisibleContent)) break;
        continue;
      }
      if (isToolExecutionRow(candidate)) {
        if (
          !isGroupableToolRow(candidate) ||
          (candidate.getRenderShell?.() === "self" &&
            presentation.liveRenderedRows.has(candidate))
        )
          break;
        group.push(candidate);
        lastMemberIndex = candidateIndex;
        continue;
      }
      if (renderAt(candidateIndex).some(hasVisibleContent)) break;
    }

    if (group.length === 1) {
      lines.push(...renderAt(index));
      continue;
    }

    for (const member of group) presentation.rowGroups.set(member, group);
    // An active member supplies the pending background. Once every call
    // settles, the first member supplies the success background. Either way,
    // the grouped row keeps the same number of lines.
    const shellRow = group.find(isLiveRow) ?? child;
    lines.push(...renderGroupedToolRows(shellRow, group, width, presentation));
    index = lastMemberIndex;
  }

  return lines;
}

function installGroupingPatch(
  presentation: PresentationPatchState,
): GroupingPatchState | undefined {
  try {
    const proto = Container?.prototype as unknown as ComponentContainer & {
      [GROUPING_PATCHED]?: GroupingPatchState;
      render?: (width: number) => string[];
    };
    if (!proto || typeof proto.render !== "function") return undefined;

    const existing = proto[GROUPING_PATCHED];
    if (existing) {
      existing.presentation = presentation;
      return existing;
    }

    const state: GroupingPatchState = { presentation, originalRender: proto.render };
    const patchedRender = function renderWithCollapsedToolGroups(
      this: ComponentContainer,
      width: number,
    ): string[] {
      const children = this.children;
      if (
        !groupingEnabled() ||
        !Array.isArray(children) ||
        !children.some(isToolExecutionRow)
      ) {
        return state.originalRender.call(this, width);
      }
      try {
        return renderContainerWithToolGroups(children, width, state.presentation);
      } catch {
        return state.originalRender.call(this, width);
      }
    };

    state.patchedRender = patchedRender;
    proto.render = patchedRender;
    Object.defineProperty(proto, GROUPING_PATCHED, {
      configurable: true,
      value: state,
    });
    return state;
  } catch {
    return undefined;
  }
}

function uninstallGroupingPatch(state: GroupingPatchState | undefined): void {
  if (!state) return;
  const proto = Container?.prototype as unknown as ComponentContainer & {
    [GROUPING_PATCHED]?: GroupingPatchState;
    render?: (width: number) => string[];
  };
  if (proto[GROUPING_PATCHED] !== state || proto.render !== state.patchedRender)
    return;
  proto.render = state.originalRender;
  delete proto[GROUPING_PATCHED];
}

function installPresentationPatch(): PresentationPatchState | undefined {
  try {
    const proto =
      ToolExecutionComponent?.prototype as unknown as ToolExecutionRow & {
        [PRESENTATION_PATCHED]?: PresentationPatchState;
        render?: (width: number) => string[];
        updateDisplay?: () => void;
      };
    if (!proto) return undefined;

    const existing = proto[PRESENTATION_PATCHED];
    if (existing) return existing;
    if (
      typeof proto.render !== "function" ||
      typeof proto.updateDisplay !== "function"
    )
      return undefined;

    const state: PresentationPatchState = {
      groupCache: new WeakMap(),
      liveRenderedRows: new WeakSet(),
      rowVersions: new WeakMap(),
      rowGroups: new WeakMap(),
      rowSignatures: new WeakMap(),
      originalRender: proto.render,
      originalUpdateDisplay: proto.updateDisplay,
    };
    const patchedUpdateDisplay = function updateDisplayWithGrouping(
      this: ToolExecutionRow,
    ): void {
      // Group members always bump so their leader's cache refreshes; other
      // rows only bump on state transitions, so bash's per-second invalidate
      // ticks and resize invalidations stop busting caches.
      const signature = `${this.isPartial}|${this.expanded}|${this.result ? 1 : 0}|${this.result?.isError ? 1 : 0}`;
      if (
        state.rowGroups.has(this) ||
        state.rowSignatures.get(this) !== signature
      ) {
        state.rowSignatures.set(this, signature);
        state.rowVersions.set(this, (state.rowVersions.get(this) ?? 0) + 1);
        state.groupCache.delete(this);
      }
      state.originalUpdateDisplay.call(this);
      try {
        if (groupingEnabled() && !isLiveRow(this)) collapseSuccessfulResult(this);
      } catch {
        // Presentation is cosmetic; preserve pi's renderer if internals change.
      }
    };
    // Only mark liveRenderedRows here; leave the row's own header untouched.
    const patchedRender = function renderWithToolGroupHeader(
      this: ToolExecutionRow,
      width: number,
    ): string[] {
      if (!isSettledToolRow(this)) state.liveRenderedRows.add(this);
      return state.originalRender.call(this, width);
    };

    try {
      state.patchedUpdateDisplay = patchedUpdateDisplay;
      state.patchedRender = patchedRender;
      proto.updateDisplay = patchedUpdateDisplay;
      proto.render = patchedRender;
      Object.defineProperty(proto, PRESENTATION_PATCHED, {
        configurable: true,
        value: state,
      });
    } catch {
      proto.updateDisplay = state.originalUpdateDisplay;
      proto.render = state.originalRender;
      return undefined;
    }
    return state;
  } catch {
    return undefined;
  }
}

function uninstallPresentationPatch(
  state: PresentationPatchState | undefined,
): void {
  if (!state) return;
  const proto =
    ToolExecutionComponent?.prototype as unknown as ToolExecutionRow & {
      [PRESENTATION_PATCHED]?: PresentationPatchState;
      render?: (width: number) => string[];
      updateDisplay?: () => void;
    };
  if (
    proto[PRESENTATION_PATCHED] !== state ||
    proto.render !== state.patchedRender ||
    proto.updateDisplay !== state.patchedUpdateDisplay
  )
    return;
  proto.render = state.originalRender;
  proto.updateDisplay = state.originalUpdateDisplay;
  delete proto[PRESENTATION_PATCHED];
}

export function installToolGrouping(pi: ExtensionAPI, isEnabled: () => boolean): void {
  groupingEnabled = isEnabled;
  const patch = installPresentationPatch();
  const grouping = patch ? installGroupingPatch(patch) : undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (patch) patch.theme = ctx.ui.theme;
    if (isEnabled()) ctx.ui.setToolsExpanded(false);
  });

  pi.on("session_shutdown", () => {
    uninstallGroupingPatch(grouping);
    uninstallPresentationPatch(patch);
  });
}
