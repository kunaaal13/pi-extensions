# pi-session-recap

[![npm](https://img.shields.io/npm/v/pi-session-recap.svg)](https://www.npmjs.com/package/pi-session-recap)
[![license](https://img.shields.io/npm/l/pi-session-recap.svg)](./LICENSE)

A [Pi](https://github.com/earendil-works/pi) extension that writes a handoff
recap into the transcript when a session ends, so resuming starts with where you
left off.

```
※ recap: Goal was porting the SEO-audit parity backlog into the codebase; that's built,
         migrations are applied to prod, and PR #65 is pushed and verified to merge
         cleanly against main.
  Next: check the PR's CI status, then merge it.
```

## Install

```sh
pi install npm:pi-session-recap
```

Or from a checkout of this repository:

```sh
pi install .
```

## How it works

- The recap is generated when it is actually needed — on `session_shutdown`
  (quit, `/new`, `/resume`, `/fork`) and on `/recap`. Nothing runs in the
  background during normal work.
- `reload` shutdowns are skipped: the conversation continues, so a card there
  would be noise.
- The recap is stored as a custom session entry, so it re-renders in place when
  the session is resumed, and it never enters LLM context.
- A resumed session reuses its last recap as the base, so each new recap updates
  the story instead of restarting it.
- On quit, the same two lines are printed to the terminal after Pi exits.
- A mirror copy is written to
  `~/.pi/agent/state/session-recap/<session-id>.json` for other tools to read.
- If nothing happened since the last recap card, no new card is written.

## Commands

| Command | Description |
|---------|-------------|
| `/recap` | Generate a recap now and append it to the transcript. |

## Configuration

Optional, at `~/.pi/agent/config/pi-session-recap.json`:

```json
{
  "model": "anthropic/claude-haiku-4-5-20251001",
  "auto": false,
  "idleDelayMs": 20000,
  "exitTimeoutMs": 15000,
  "printOnExit": true
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `model` | active model | `provider/modelId` used to generate the recap. |
| `auto` | `false` | Pre-warm the recap after `idleDelayMs` of inactivity, so quitting does not wait on a model call. |
| `idleDelayMs` | `20000` | Idle time before the pre-warm runs (only used when `auto` is `true`). |
| `exitTimeoutMs` | `15000` | How long shutdown may wait for the recap before giving up. |
| `printOnExit` | `true` | Print the recap to the terminal after Pi exits. |

## Development

```sh
npm install
npm run typecheck
npm run pack:dry-run
```

## License

MIT © [kunaaal13](https://github.com/kunaaal13)
