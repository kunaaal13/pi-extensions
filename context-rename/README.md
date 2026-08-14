# pi-context-rename

A host-agnostic Pi extension that generates a short title for the current conversation.

- Updates the Pi session name everywhere Pi runs.
- Emits the standard terminal-title escape sequence, which works in Terminal, Warp, iTerm, and most terminals.
- Herdr receives the terminal title; Pi session names remain available when no terminal integration exists.
- Automatically renames after the first real prompt, or manually with `/rename`.

## Install

From this directory:

```sh
pi install .
```

Run `/rename-model` once to choose an authenticated text model. Configuration is stored at `~/.pi/agent/config/pi-context-rename.json`.

## Development

```sh
npm run typecheck
```
