import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const exec = promisify(execFile);
const configPath = join(getAgentDir(), "config", "pi-context-rename.json");
const MAX_INPUT = 4000;

type Config = { model?: string; maxWords: number; maxChars: number };

async function getConfig(): Promise<Config> {
  try {
    const value = JSON.parse(await readFile(configPath, "utf8")) as Partial<Config>;
    return {
      model: typeof value.model === "string" ? value.model : undefined,
      maxWords: Number.isInteger(value.maxWords) && value.maxWords! > 0 ? value.maxWords! : 5,
      maxChars: Number.isInteger(value.maxChars) && value.maxChars! > 0 ? value.maxChars! : 50,
    };
  } catch {
    return { maxWords: 5, maxChars: 50 };
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function recentConversation(ctx: ExtensionContext, fallback = ""): string {
  const lines: string[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    if (entry.message.role !== "user" && entry.message.role !== "assistant") continue;
    const value = contentText(entry.message.content).trim();
    if (value) lines.push(`${entry.message.role}: ${value.slice(0, 1000)}`);
  }
  return (lines.slice(-6).join("\n\n") || fallback).slice(-MAX_INPUT);
}

async function makeTitle(input: string, ctx: ExtensionContext, signal: AbortSignal): Promise<string> {
  const cfg = await getConfig();
  // Use Pi's currently selected model, regardless of provider.
  const model = ctx.model ?? ctx.modelRegistry.getAvailable().find(m => m.input.includes("text"));
  if (!model) throw new Error("No active text model is available.");
  const response = await ctx.modelRegistry.complete(model, {
    systemPrompt: `Return only a short chat title, lowercase, no punctuation, at most ${cfg.maxWords} words and ${cfg.maxChars} characters.`,
    messages: [{ role: "user", content: input, timestamp: Date.now() }],
  }, { signal, maxRetries: 0, maxTokens: 48, thinkingLevel: "off" } as any);
  if (response.stopReason !== "stop") throw new Error(response.errorMessage || "Title generation failed.");
  const title = response.content.filter(p => p.type === "text").map(p => p.text).join(" ").trim().toLowerCase().replace(/\s+/g, " ");
  if (!title || title.length > cfg.maxChars || title.split(" ").length > cfg.maxWords) throw new Error("Invalid title returned by model.");
  return title;
}

async function renameHost(title: string): Promise<void> {
  // OSC 0 is understood by Terminal, Warp, iTerm, Kitty, WezTerm, tmux, etc.
  process.stdout.write(`\x1b]0;${title.replace(/[\x00-\x1f\x7f]/g, "")}\x07`);
  const paneId = process.env.HERDR_PANE_ID;
  if (!paneId) return;
  try {
    await exec("herdr", ["pane", "rename", paneId, title]);
    const pane = JSON.parse((await exec("herdr", ["pane", "get", paneId])).stdout) as any;
    const tabId = pane?.result?.pane?.tab_id;
    if (!tabId) return;
    const tab = JSON.parse((await exec("herdr", ["tab", "get", tabId])).stdout) as any;
    if (tab?.result?.tab?.pane_count === 1) await exec("herdr", ["tab", "rename", tabId, title]);
  } catch {
    // Host integration is optional; Pi session naming still succeeds.
  }
}

export default function contextRename(pi: ExtensionAPI): void {
  let latestPrompt = "";
  let automaticRenameStarted = false;
  let active: AbortController | undefined;

  pi.on("session_start", (_event, ctx) => {
    // Existing sessions have already had their one automatic rename.
    // Never regenerate title when resuming or switching back to chat.
    automaticRenameStarted = Boolean(
      pi.getSessionName() || ctx.sessionManager.getBranch().some(entry => entry.type === "message"),
    );
  });

  const rename = async (input: string, ctx: ExtensionContext) => {
    active?.abort();
    active = new AbortController();
    try {
      const title = await makeTitle(input, ctx, active.signal);
      pi.setSessionName(title);
      await renameHost(title);
      ctx.ui.notify(`renamed to ${title}`, "info");
    } catch (error) {
      if (!active.signal.aborted) ctx.ui.notify(error instanceof Error ? error.message : "Rename failed.", "warning");
    }
  };

  pi.on("input", (event, ctx) => {
    if (event.source === "extension" || !event.text.trim()) return { action: "continue" };
    latestPrompt = event.text;
    if (!automaticRenameStarted) {
      automaticRenameStarted = true;
      void rename(recentConversation(ctx, event.text), ctx);
    }
    return { action: "continue" };
  });

  pi.registerCommand("rename", {
    description: "Rename this chat and terminal tab",
    handler: async (_args, ctx) => {
      const input = recentConversation(ctx, latestPrompt);
      if (!input) return ctx.ui.notify("No conversation text available.", "warning");
      await rename(input, ctx);
    },
  });

}
