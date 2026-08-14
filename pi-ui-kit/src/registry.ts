/**
 * The renderer registry — pi-ui-kit's extensibility flagship.
 *
 * Any package can claim rendering for a tool by name, regex, or predicate:
 *
 *   registry.register("bash", myBashRenderer, { priority: 10 });
 *   registry.register(/^mcp__github/, githubMcpRenderer);
 *
 * Built-in renderers register at priority 0; user/third-party renderers with
 * a higher priority win. Equal priority: latest registration wins.
 */
import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { UiKitServices } from "./services.ts";
import type { UiToolRenderContext } from "./types.ts";

export type ToolMatch = string | RegExp | ((toolName: string) => boolean);

export interface ToolRenderer<TArgs = any, TDetails = any> {
  renderCall?(
    args: TArgs,
    theme: Theme,
    context: UiToolRenderContext,
    services: UiKitServices,
  ): Component;
  renderResult?(
    result: AgentToolResult<TDetails>,
    options: ToolRenderResultOptions,
    theme: Theme,
    context: UiToolRenderContext,
    services: UiKitServices,
  ): Component;
}

interface Registration {
  match: ToolMatch;
  renderer: ToolRenderer;
  priority: number;
  order: number;
}

function matches(match: ToolMatch, toolName: string): boolean {
  if (typeof match === "string") return match === toolName;
  if (match instanceof RegExp) return match.test(toolName);
  return match(toolName);
}

export class RendererRegistry {
  private registrations: Registration[] = [];
  private order = 0;

  register(match: ToolMatch, renderer: ToolRenderer, options?: { priority?: number }): () => void {
    const registration: Registration = {
      match,
      renderer,
      priority: options?.priority ?? 0,
      order: this.order++,
    };
    this.registrations.push(registration);
    return () => {
      const index = this.registrations.indexOf(registration);
      if (index !== -1) this.registrations.splice(index, 1);
    };
  }

  resolve(toolName: string): ToolRenderer | undefined {
    let best: Registration | undefined;
    for (const registration of this.registrations) {
      if (!matches(registration.match, toolName)) continue;
      if (
        !best ||
        registration.priority > best.priority ||
        (registration.priority === best.priority && registration.order > best.order)
      ) {
        best = registration;
      }
    }
    return best?.renderer;
  }

  registeredCount(): number {
    return this.registrations.length;
  }
}
