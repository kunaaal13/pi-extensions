import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { type Component, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "session-recap";
const configPath = join(getAgentDir(), "config", "pi-session-recap.json");
const stateDir = join(getAgentDir(), "state", "session-recap");
const MAX_DIGEST = 8000;
const HEAD_PREFIX = "※ recap: ";
const NEXT_PREFIX = "  Next: ";

type Config = {
  auto: boolean;
  model?: string;
  idleDelayMs: number;
  exitTimeoutMs: number;
  printOnExit: boolean;
};

type Recap = {
  summary: string;
  next: string;
  at: number;
  model?: string;
};

// Off by default: the recap is generated at the moment it is needed (session end
// or /recap), not on a background timer that spends a model call every idle gap.
const DEFAULTS: Config = {
  auto: false,
  idleDelayMs: 20_000,
  exitTimeoutMs: 15_000,
  printOnExit: true,
};

async function getConfig(): Promise<Config> {
  try {
    const value = JSON.parse(await readFile(configPath, "utf8")) as Partial<Config>;
    return {
      auto: typeof value.auto === "boolean" ? value.auto : DEFAULTS.auto,
      model: typeof value.model === "string" ? value.model : undefined,
      idleDelayMs:
        Number.isFinite(value.idleDelayMs) && value.idleDelayMs! >= 0
          ? value.idleDelayMs!
          : DEFAULTS.idleDelayMs,
      exitTimeoutMs:
        Number.isFinite(value.exitTimeoutMs) && value.exitTimeoutMs! > 0
          ? value.exitTimeoutMs!
          : DEFAULTS.exitTimeoutMs,
      printOnExit:
        typeof value.printOnExit === "boolean" ? value.printOnExit : DEFAULTS.printOnExit,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content as Array<Record<string, unknown>>) {
    if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
    else if (part?.type === "toolCall" && typeof part.name === "string") parts.push(`[${part.name}]`);
  }
  return parts.join("\n");
}

/**
 * Conversation digest: the opening prompt carries the goal, the tail carries the
 * current state. Everything in between is noise for a handoff recap.
 */
function digest(ctx: ExtensionContext): { text: string; messageCount: number } {
  const lines: string[] = [];
  let messageCount = 0;
  let goal = "";
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = contentText(entry.message.content).trim();
    if (!text) continue;
    messageCount++;
    if (!goal && role === "user") goal = text.slice(0, 800);
    lines.push(`${role}: ${text.slice(0, role === "user" ? 800 : 600)}`);
  }
  const tail = lines.slice(-20).join("\n\n");
  const head = goal && !tail.startsWith(`user: ${goal.slice(0, 40)}`) ? `first prompt: ${goal}\n\n` : "";
  return { text: (head + tail).slice(-MAX_DIGEST), messageCount };
}

function parseRecap(raw: string): { summary: string; next: string } | undefined {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const value = JSON.parse(cleaned) as { summary?: unknown; next?: unknown };
    const summary = typeof value.summary === "string" ? value.summary.trim() : "";
    const next = typeof value.next === "string" ? value.next.trim() : "";
    if (summary) return { summary, next };
  } catch {
    // Model ignored the JSON contract; fall back to the "Next:" split below.
  }
  const match = cleaned.match(/^([\s\S]*?)\bNext:\s*([\s\S]*)$/i);
  if (match) {
    const summary = match[1]!.replace(/^※?\s*recap:\s*/i, "").trim();
    if (summary) return { summary, next: match[2]!.trim() };
  }
  const summary = cleaned.replace(/^※?\s*recap:\s*/i, "").trim();
  return summary ? { summary, next: "" } : undefined;
}

async function generate(
  ctx: ExtensionContext,
  cfg: Config,
  previous: Recap | undefined,
  signal: AbortSignal,
): Promise<Recap | undefined> {
  const { text, messageCount } = digest(ctx);
  if (!text || messageCount < 2) return undefined;

  const configured = cfg.model?.includes("/")
    ? ctx.modelRegistry.find(cfg.model.slice(0, cfg.model.indexOf("/")), cfg.model.slice(cfg.model.indexOf("/") + 1))
    : undefined;
  const model = configured ?? ctx.model ?? ctx.modelRegistry.getAvailable().find(m => m.input.includes("text"));
  if (!model) throw new Error("No text model available for recap.");

  const prior = previous ? `Previous recap (update it, do not repeat it verbatim):\n${previous.summary}\nNext: ${previous.next}\n\n` : "";
  const response = await ctx.modelRegistry.complete(
    model,
    {
      systemPrompt:
        "You write handoff recaps for a coding session, for the same person resuming later. " +
        'Reply with JSON only: {"summary": string, "next": string}. ' +
        "summary: one or two sentences, past tense, stating the goal and the current state of the work (what is built, applied, pushed, verified). " +
        "next: one sentence naming the single next action. Empty string if there is no clear next step. " +
        "Be concrete: keep file names, PR numbers, branch names, commands. No markdown, no preamble.",
      messages: [{ role: "user", content: prior + text, timestamp: Date.now() }],
    },
    { signal, maxRetries: 0, maxTokens: 300, thinkingLevel: "off" } as never,
  );
  if (response.stopReason !== "stop") throw new Error(response.errorMessage || "Recap generation failed.");
  const raw = response.content
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join(" ");
  const parsed = parseRecap(raw);
  if (!parsed) throw new Error("Model returned no usable recap.");
  return { ...parsed, at: Date.now(), model: `${model.provider}/${model.id}` };
}

function recapLines(recap: Recap): string[] {
  const lines = [`${HEAD_PREFIX}${recap.summary}`];
  if (recap.next) lines.push(`${NEXT_PREFIX}${recap.next}`);
  return lines;
}

class RecapCard implements Component {
  // Plain fields, not constructor parameter properties: those are unsupported by
  // type-stripping TypeScript loaders.
  private readonly recap: Recap;
  private readonly theme: Theme;

  constructor(recap: Recap, theme: Theme) {
    this.recap = recap;
    this.theme = theme;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const usable = Math.max(20, width);
    const out: string[] = [];
    const label = this.theme.fg("customMessageLabel", HEAD_PREFIX);
    const body = this.theme.fg("customMessageText", this.recap.summary);
    const indent = " ".repeat(HEAD_PREFIX.length);
    wrapTextWithAnsi(body, Math.max(10, usable - HEAD_PREFIX.length)).forEach((line, index) => {
      out.push(index === 0 ? label + line : indent + line);
    });
    if (this.recap.next) {
      const nextLabel = this.theme.fg("muted", NEXT_PREFIX);
      const nextIndent = " ".repeat(NEXT_PREFIX.length);
      wrapTextWithAnsi(
        this.theme.fg("customMessageText", this.recap.next),
        Math.max(10, usable - NEXT_PREFIX.length),
      ).forEach((line, index) => {
        out.push(index === 0 ? nextLabel + line : nextIndent + line);
      });
    }
    return out;
  }
}

function lastRecapEntry(ctx: ExtensionContext): { recap?: Recap; messagesAfter: number } {
  let recap: Recap | undefined;
  let messagesAfter = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
      recap = entry.data as Recap;
      messagesAfter = 0;
      continue;
    }
    if (entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant")) {
      messagesAfter++;
    }
  }
  return { recap, messagesAfter };
}

async function persist(ctx: ExtensionContext, recap: Recap): Promise<void> {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return;
  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, `${sessionId}.json`),
      JSON.stringify({ ...recap, sessionFile: ctx.sessionManager.getSessionFile(), cwd: ctx.cwd }, null, 2),
      "utf8",
    );
  } catch {
    // The session entry is the source of truth; the mirror file is a convenience.
  }
}

export default function sessionRecap(pi: ExtensionAPI): void {
  let cfg: Config = { ...DEFAULTS };
  let cached: Recap | undefined;
  let dirty = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<Recap | undefined> | undefined;
  let active: AbortController | undefined;
  let finalized = false;

  const cancelPending = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
  };

  const refresh = async (ctx: ExtensionContext, timeoutMs?: number): Promise<Recap | undefined> => {
    if (inFlight) return inFlight;
    active?.abort();
    active = new AbortController();
    const controller = active;
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    inFlight = generate(ctx, cfg, cached, controller.signal)
      .then(recap => {
        if (recap) {
          cached = recap;
          dirty = false;
        }
        return recap;
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        inFlight = undefined;
      });
    return inFlight;
  };

  pi.registerEntryRenderer<Recap>(ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data;
    if (!data?.summary) return undefined;
    return new RecapCard(data, theme);
  });

  pi.on("session_start", async (_event, ctx) => {
    cfg = await getConfig();
    finalized = false;
    dirty = false;
    cancelPending();
    // A resumed session already carries its last recap; keep it as the base so the
    // next recap updates the story instead of restarting it.
    cached = lastRecapEntry(ctx).recap;
  });

  pi.on("input", (event, _ctx) => {
    if (event.source !== "extension" && event.text.trim()) cancelPending();
    return { action: "continue" };
  });

  pi.on("agent_settled", (_event, ctx) => {
    dirty = true;
    if (!cfg.auto) return;
    cancelPending();
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      void refresh(ctx).catch(() => {
        // Silent: an idle pre-warm failing is not worth interrupting the user.
      });
    }, cfg.idleDelayMs);
  });

  const finalize = async (ctx: ExtensionContext, reason: string) => {
    if (finalized) return;
    finalized = true;
    cancelPending();

    const { recap: entryRecap, messagesAfter } = lastRecapEntry(ctx);
    if (messagesAfter === 0 && entryRecap) return; // Nothing happened since the last card.

    if (dirty || !cached) {
      try {
        await refresh(ctx, cfg.exitTimeoutMs);
      } catch {
        // Fall through: a stale recap still beats no recap.
      }
    }
    if (!cached) return;

    pi.appendEntry<Recap>(ENTRY_TYPE, cached);
    await persist(ctx, cached);

    if (cfg.printOnExit && reason === "quit") {
      const text = `\n${recapLines(cached).join("\n")}\n`;
      process.once("exit", () => {
        try {
          process.stdout.write(text);
        } catch {
          // Terminal already gone.
        }
      });
    }
  };

  pi.on("session_shutdown", async (event, ctx) => {
    // "reload" keeps the same conversation going; a recap card there is noise.
    if (event.reason === "reload") return;
    await finalize(ctx, event.reason);
  });

  pi.registerCommand("recap", {
    description: "Write a handoff recap of this session into the transcript",
    handler: async (_args, ctx) => {
      cfg = await getConfig();
      cancelPending();
      try {
        const recap = await refresh(ctx, cfg.exitTimeoutMs);
        if (!recap) return ctx.ui.notify("Not enough conversation to recap yet.", "warning");
        pi.appendEntry<Recap>(ENTRY_TYPE, recap);
        await persist(ctx, recap);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "Recap failed.", "warning");
      }
    },
  });
}
