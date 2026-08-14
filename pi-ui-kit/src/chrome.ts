/**
 * Minimal codex-style chrome via pi's public setHeader/setFooter API.
 *
 * Header (two lines):   ~/dev (12m)
 *                       Pi
 * Footer (one line):    ⛁ 34% · 42 tok/s        model · thinking high
 *
 * Left column: context usage and token speed. Right column: active model and
 * thinking level. ANSI-aware truncation keeps both columns usable at narrow
 * widths. No git/cost/extension-status noise by design.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const REFRESH_MS = 2000;
const SPEED_WINDOW_MS = 10_000;

function shortPath(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd === home) return "~";
  if (home && cwd.startsWith(home + "/")) return `~/${cwd.slice(home.length + 1)}`;
  return cwd;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function installChrome(
  pi: ExtensionAPI,
  options: { header: () => boolean; footer: () => boolean },
): void {
  const sessionStartedAt = Date.now();
  let activeCtx: ExtensionContext | undefined;

  // Sliding-window token speed from streaming message updates.
  let samples: Array<{ at: number; chars: number }> = [];
  let lastChars = 0;

  function tokenSpeed(): number | undefined {
    const now = Date.now();
    samples = samples.filter((sample) => now - sample.at <= SPEED_WINDOW_MS);
    if (samples.length < 2) return undefined;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const seconds = (last.at - first.at) / 1000;
    if (seconds <= 0) return undefined;
    return Math.round((last.chars - first.chars) / 4 / seconds);
  }

  pi.on("message_update", (event) => {
    const content = (event.message as { content?: unknown }).content;
    let chars = 0;
    if (typeof content === "string") chars = content.length;
    else if (Array.isArray(content)) {
      for (const block of content) {
        const text =
          (block as { text?: unknown }).text ?? (block as { thinking?: unknown }).thinking;
        if (typeof text === "string") chars += text.length;
      }
    }
    if (chars < lastChars) samples = [];
    lastChars = chars;
    samples.push({ at: Date.now(), chars });
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    activeCtx = ctx;

    if (options.header()) {
      ctx.ui.setHeader((tui, theme) => {
        const timer = setInterval(() => tui.requestRender(), 30_000);
        timer.unref?.();
        return {
          render(width: number): string[] {
            const dir = shortPath(ctx.cwd);
            const elapsed = formatDuration(Date.now() - sessionStartedAt);
            return [
              truncateToWidth(
                `${theme.fg("muted", dir)} ${theme.fg("dim", `(${elapsed})`)}`,
                width, "…", false,
              ),
              theme.fg("accent", theme.bold("Pi")),
            ];
          },
          invalidate() {},
          dispose() { clearInterval(timer); },
        };
      });
    }

    if (options.footer()) {
      ctx.ui.setFooter((tui, theme) => {
        const timer = setInterval(() => tui.requestRender(), REFRESH_MS);
        timer.unref?.();
        return {
          render(width: number): string[] {
            const usage = activeCtx?.getContextUsage?.();
            const leftParts: string[] = [];
            if (usage?.percent != null) {
              leftParts.push(`⛁ ${Math.round(usage.percent)}%`);
            }
            const speed = tokenSpeed();
            if (speed !== undefined && speed > 0) leftParts.push(`${speed} tok/s`);
            const left = theme.fg("muted", leftParts.join(" · "));

            const rightParts: string[] = [];
            const model = activeCtx?.model as { id?: unknown; name?: unknown } | undefined;
            const modelName = typeof model?.name === "string" ? model.name
              : typeof model?.id === "string" ? model.id : undefined;
            if (modelName) rightParts.push(modelName);
            const level = pi.getThinkingLevel?.();
            if (level && level !== "off") rightParts.push(`thinking ${level}`);
            const right = theme.fg("dim", rightParts.join(" · "));

            const gap = width - visibleWidth(left) - visibleWidth(right);
            if (gap >= 1) return [left + " ".repeat(gap) + right];
            const line = right ? `${left} ${right}` : left;
            return [truncateToWidth(line, width, "…", false)];
          },
          invalidate() {},
          dispose() { clearInterval(timer); },
        };
      });
    }
  });

  pi.on("session_shutdown", () => {
    if (activeCtx?.hasUI && activeCtx.mode === "tui") {
      // Restore built-ins so a /reload without chrome enabled cleans up.
      if (options.header()) activeCtx.ui.setHeader(undefined);
      if (options.footer()) activeCtx.ui.setFooter(undefined);
    }
    activeCtx = undefined;
  });
}
