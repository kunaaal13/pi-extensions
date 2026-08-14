# pi-session-recap

Writes a handoff recap into the transcript when a Pi session ends, so resuming
starts with where you left off:

```
※ recap: Goal was porting the SEO-audit parity backlog into the codebase; that's built,
         migrations are applied to prod, and PR #65 is pushed and verified to merge
         cleanly against main.
  Next: check the PR's CI status, then merge it.
```

## Behaviour

- The recap is generated when it is actually needed — on `session_shutdown`
  (quit, `/new`, `/resume`, `/fork`) and on `/recap`. Nothing runs in the
  background during normal work.
- `reload` shutdowns are skipped: the conversation continues, so a card would be noise.
- The recap is stored as a custom session entry, so it re-renders in place when the
  session is resumed, and it never enters LLM context.
- On quit, the same two lines are printed to the terminal after Pi exits.
- A mirror copy is written to `~/.pi/agent/state/session-recap/<session-id>.json`
  for other tools to read.
- If nothing happened since the last recap card, no new card is written.

## Commands

- `/recap` — generate a recap now and append it to the transcript.

## Install

From this directory:

```sh
pi install .
```

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

- `model` — `provider/modelId` used for the recap. Defaults to the active model.
- `auto` — when true, pre-warms the recap after the session has been idle for
  `idleDelayMs`, so quitting does not wait on a model call. Off by default.
- `exitTimeoutMs` — how long shutdown may wait for the recap before giving up.
- `printOnExit` — print the recap to the terminal after Pi exits.

## Development

```sh
npm run typecheck
```
