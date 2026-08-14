/**
 * Small Component helpers so renderers stay declarative.
 */
import type { Component } from "@earendil-works/pi-tui";
import type { UiToolRenderContext } from "./types.ts";

/** Wrap a render function as a pi-tui Component. */
export function linesComponent(render: (width: number) => string[]): Component {
  return {
    render,
    invalidate() {},
  };
}

interface AsyncSlot {
  key: string;
  lines?: string[];
  pending: boolean;
}

/**
 * Render async content (e.g. shiki output) from a synchronous render pass.
 * The first render kicks off `compute` and shows `placeholder`; when the
 * promise settles the tool row is invalidated and the cached lines paint.
 * `key` must change whenever inputs change (include width and hl epoch).
 */
export function asyncLines(
  context: UiToolRenderContext,
  slotName: string,
  key: string,
  placeholder: string[],
  compute: () => Promise<string[]>,
): string[] {
  const state = context.state as Record<string, AsyncSlot | undefined>;
  const slot = state[slotName];
  if (slot && slot.key === key) {
    return slot.lines ?? placeholder;
  }
  const next: AsyncSlot = { key, pending: true };
  state[slotName] = next;
  compute()
    .then((lines) => {
      if (state[slotName] !== next) return;
      next.lines = lines;
      next.pending = false;
      context.invalidate();
    })
    .catch(() => {
      if (state[slotName] !== next) return;
      next.lines = placeholder;
      next.pending = false;
    });
  return placeholder;
}
