# pi-context-rename

[![npm](https://img.shields.io/npm/v/pi-context-rename.svg)](https://www.npmjs.com/package/pi-context-rename)
[![license](https://img.shields.io/npm/l/pi-context-rename.svg)](./LICENSE)

A [Pi](https://github.com/earendil-works/pi) extension that names your chat from
its own content, and propagates that title to the host terminal.

```
you: port the SEO audit backlog into the codebase
     → session renamed to "porting seo audit backlog"
     → terminal tab title updated
```

## Install

```sh
pi install npm:pi-context-rename
```

Or from a checkout of this repository:

```sh
pi install .
```

## How it works

- After the first real prompt of a new session, the recent conversation is sent
  to the active model, which returns a short lowercase title.
- The title becomes the Pi session name, so it shows up in `/resume`.
- The title is also emitted as an OSC 0 terminal escape sequence, understood by
  Terminal.app, iTerm2, Warp, Kitty, WezTerm, Ghostty, and tmux.
- When `HERDR_PANE_ID` is set, the [herdr](https://herdr.dev) pane is renamed
  too — and the tab as well, if the tab holds a single pane. Host integration is
  best-effort: if it fails, the Pi session name is still set.
- Resumed sessions, and sessions that already carry a name, are never renamed
  automatically. Use `/rename` for those.

## Commands

| Command | Description |
|---------|-------------|
| `/rename` | Regenerate the title from the recent conversation and apply it. |

## Configuration

Optional, at `~/.pi/agent/config/pi-context-rename.json`:

```json
{
  "model": "anthropic/claude-haiku-4-5-20251001",
  "maxWords": 5,
  "maxChars": 50
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `model` | active model | `provider/modelId` used to generate the title. Defaults to the active model. |
| `maxWords` | `5` | Maximum words in the generated title. |
| `maxChars` | `50` | Maximum characters in the generated title. |

## Development

```sh
npm install
npm run typecheck
npm run pack:dry-run
```

## License

MIT © [kunaaal13](https://github.com/kunaaal13)
