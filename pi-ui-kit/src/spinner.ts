/**
 * Claude Code-style working indicator: rotating verb, thinking level, token
 * estimate, and elapsed time — all through pi's public working-message API.
 * No Loader patching.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const FRAME_INTERVAL_MS = 170;
const REFRESH_MS = 1000;
const SHOW_TIMER_AFTER_MS = 5000;

const DEFAULT_VERBS = [
  "Accomplishing", "Actioning", "Architecting", "Brewing", "Calibrating", "Cerebrating",
  "Channelling", "Churning", "Cogitating", "Composing", "Computing", "Conjuring",
  "Considering", "Cooking", "Crafting", "Crunching", "Deciphering", "Deliberating",
  "Distilling", "Divining", "Effecting", "Elaborating", "Envisioning", "Fathoming",
  "Finagling", "Forging", "Formulating", "Germinating", "Hatching", "Herding",
  "Honking", "Ideating", "Incubating", "Inferring", "Manifesting", "Marinating",
  "Moseying", "Mulling", "Musing", "Mustering", "Noodling", "Percolating",
  "Pondering", "Processing", "Puttering", "Puzzling", "Reticulating", "Ruminating",
  "Scheming", "Simmering", "Smooshing", "Spelunking", "Spinning", "Stewing",
  "Synthesizing", "Thinking", "Tinkering", "Transmuting", "Vibing", "Whirring",
];

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

export function installSpinner(
  pi: ExtensionAPI,
  isEnabled: () => boolean,
  verbs: () => string[],
): void {
  let verb = "Working";
  let startedAt = 0;
  let outputChars = 0;
  let settledChars = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let activeCtx: ExtensionContext | undefined;

  function compose(): string {
    const parts: string[] = [];
    const level = pi.getThinkingLevel?.();
    if (level && level !== "off") parts.push(`thinking ${level}`);
    if (outputChars > 0) parts.push(`↓ ${formatTokens(Math.round(outputChars / 4))} tokens`);
    const elapsed = Date.now() - startedAt;
    if (elapsed >= SHOW_TIMER_AFTER_MS) parts.push(`${Math.round(elapsed / 1000)}s`);
    return parts.length > 0 ? `${verb}… (${parts.join(" · ")})` : `${verb}…`;
  }

  function tick(): void {
    const ctx = activeCtx;
    if (!ctx || !ctx.hasUI) return;
    ctx.ui.setWorkingMessage(compose());
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (activeCtx?.hasUI) activeCtx.ui.setWorkingMessage(undefined);
  }

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI || !isEnabled()) return;
    ctx.ui.setWorkingIndicator({ frames: FRAMES, intervalMs: FRAME_INTERVAL_MS });
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!ctx.hasUI || !isEnabled()) return;
    activeCtx = ctx;
    const pool = verbs().length > 0 ? verbs() : DEFAULT_VERBS;
    verb = pool[Math.floor(Math.random() * pool.length)];
    startedAt = Date.now();
    outputChars = 0;
    settledChars = 0;
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, REFRESH_MS);
    timer.unref?.();
  });

  function messageChars(message: unknown): number {
    const content = (message as { content?: string | unknown[] }).content;
    if (typeof content === "string") return content.length;
    let total = 0;
    for (const block of content ?? []) {
      const text = (block as { text?: unknown }).text ?? (block as { thinking?: unknown }).thinking;
      if (typeof text === "string") total += text.length;
    }
    return total;
  }

  pi.on("message_update", (event) => {
    if (!timer) return;
    outputChars = settledChars + messageChars(event.message);
  });

  pi.on("message_end", (event) => {
    if (!timer) return;
    settledChars += messageChars(event.message);
    outputChars = settledChars;
  });

  pi.on("agent_end", stop);
  pi.on("session_shutdown", stop);
}
