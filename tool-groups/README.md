# pi-tool-groups

A from-scratch replacement for `@pi-kaush/pi-tool-call-markers`, same problem
(Pi renders every tool call as its own expanded block), simplified grouping
and non-lossy line wrapping.

## What it does

- **One bold header per contiguous run of the same tool.** A run of `read`
  calls shares one `read` header; a `bash` call breaking the run starts a
  new header. No icon — Pi's own tool rows carry none, so grouped ones don't
  either.
- **Bulleted call summaries** with a compact outcome tail (`→ 42 lines`,
  `→ done · 2.3s`, `→ +12/-3`) for `read`, `write`, `edit`, `bash`, `grep`,
  `find`, `ls`.
- **Wraps instead of truncating.** A long path or command flows onto a
  hanging-indent continuation line instead of losing its tail behind an
  ellipsis — the upstream extension truncates; this one calls Pi's own
  `wrapTextWithAnsi`.
- **Always groups.** The upstream extension has a
  `PI_TOOL_CALL_MARKERS_COLLAPSE_PARALLEL` env var gating whether
  same-assistant-message (parallel) calls group with sequential ones. This
  version drops that distinction: any contiguous run of collapsed,
  non-error, non-image tool calls groups, full stop — one less thing to
  configure or explain.
- **Errors and expanded calls stay out of groups**, keeping their native
  error background / full detail.
- **Ctrl+O** (`setToolsExpanded(true)`) restores Pi's individual full blocks.

## Known trade-off vs upstream

Upstream pins a still-running singleton (ungrouped) tool to a single header
line with inline elapsed time, so the block never grows during streaming and
never visibly shrinks on settlement. This version skips that: a lone
streaming tool renders with Pi's default live output and may shrink by a
line or two once it completes. Grouped calls are unaffected — a group's
render is fully owned by this extension either way.

## Why prototype patching

Pi exposes no public transcript/tool-grouping hook (checked against
`@earendil-works/pi-coding-agent` 0.84.1; the built-in `renderCall` /
`renderResult` / `renderShell: "self"` hooks style one call, not multiple
calls into one block). Grouping means patching two prototypes —
`ToolExecutionComponent` (per-row presentation) and `Container` (which rows
render as a block) — behind `Symbol.for(...)` idempotency guards and
`try`/`catch`, restored on `session_shutdown`. If Pi's internals change, this
silently no-ops back to Pi's default rendering rather than breaking the
session.

## Install

From this directory:

```sh
pi install .
```

This replaces `@pi-kaush/pi-tool-call-markers` — both patch the same two
prototypes, and only the first one to load wins, so don't run both. Remove
the old package first:

```sh
pi uninstall npm:@pi-kaush/pi-tool-call-markers
```

## Development

```sh
npm run typecheck
```
