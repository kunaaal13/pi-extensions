/**
 * Thinking label + "✻ Turn took Ns" receipt — all public API:
 * setHiddenThinkingLabel for the collapsed-thinking marker, and a persisted
 * custom session entry + registerEntryRenderer for the per-turn receipt line
 * (survives resume without mutating any messages).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "pi-ui-kit.turn-receipt";

interface ReceiptData {
  turnMs: number;
  sessionMs: number;
  turns: number;
  tools: number;
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function installReceipt(
  pi: ExtensionAPI,
  options: { receipt: () => boolean; thinkingLabel: () => string },
): void {
  const sessionStartedAt = Date.now();
  let turnStartedAt = 0;
  let turnCount = 0;
  let toolCount = 0;

  pi.registerEntryRenderer<ReceiptData>(ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data;
    if (!data) return undefined;
    return {
      render(width: number): string[] {
        const parts = [
          `✻ Turn took ${formatSeconds(data.turnMs)}`,
          `${data.tools} ${data.tools === 1 ? "tool" : "tools"}`,
          `session ${formatSeconds(data.sessionMs)} · ${data.turns} ${data.turns === 1 ? "turn" : "turns"}`,
        ];
        return [theme.fg("muted", truncateToWidth(parts.join(" · "), width, "…", false))];
      },
      invalidate() {},
    };
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    const label = options.thinkingLabel();
    if (label) ctx.ui.setHiddenThinkingLabel(label);
  });

  // One receipt per user prompt (agent run), not per internal turn.
  pi.on("agent_start", () => {
    turnStartedAt = Date.now();
    toolCount = 0;
  });

  pi.on("tool_execution_start", () => {
    toolCount++;
  });

  pi.on("agent_end", () => {
    if (!options.receipt() || !turnStartedAt) return;
    turnCount++;
    const data: ReceiptData = {
      turnMs: Date.now() - turnStartedAt,
      sessionMs: Date.now() - sessionStartedAt,
      turns: turnCount,
      tools: toolCount,
    };
    try {
      pi.appendEntry(ENTRY_TYPE, data);
    } catch {
      // Receipt is cosmetic; never break the turn on a persistence error.
    }
  });
}
