# Pi UI customization design

## Goal

Add a reusable Pi UI customization extension to the tracked local extension
packages and the active `~/.pi/agent` installation. The extension should make
the TUI resemble the provided Codex reference while keeping the status bar
minimal.

## Behavior

The header renders two compact lines:

```text
~/dev (session duration)
Pi
```

The working directory is abbreviated relative to the user home directory. The
session duration starts when the Pi session starts and is refreshed while the
TUI renders. The title is always `Pi`.

The footer renders one responsive line. The left column contains context usage
and token speed; the right column contains the active model and thinking level.
It does not render directory, Git, pull-request, cost, or extension-status
details. ANSI-aware truncation keeps both columns usable at narrow widths.

## Architecture

Create a standalone `pi-ui-customization` package under
`mine/pi-extensions/pi-ui-customization` with one extension entry point. It
uses Pi's public `setHeader`, `setFooter`, `ReadonlyFooterDataProvider`, and
model-info event APIs. It does not patch Pi internals.

Add the package to `~/.pi/agent/settings.json` and copy the entry point into
`~/.pi/agent/extensions` so both the tracked package and active installation
are covered.

## Verification

- Typecheck the new extension.
- Validate the settings/package wiring.
- Exercise the pure formatting helpers with a focused test or equivalent
  render check for normal and narrow widths.
