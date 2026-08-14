# Changelog

All notable changes to `pi-session-recap` are documented here. This project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-08-15

Initial release.

### Added

- **Recap on session end** — generates a handoff recap on `session_shutdown`
  (quit, `/new`, `/resume`, `/fork`) and appends it to the transcript.
- **`/recap` command** — generates a recap on demand at any point in a session.
- **Custom entry renderer** — the recap is stored as a `session-recap` custom
  session entry, so it re-renders in place on resume and never enters LLM
  context.
- **Incremental recaps** — a resumed session reuses its last recap as the base,
  so the next recap updates the story instead of restarting it.
- **Exit printing** — on quit, the recap is written to the terminal after Pi
  exits (`printOnExit`, on by default).
- **State mirror** — a copy is written to
  `~/.pi/agent/state/session-recap/<session-id>.json` for other tools to read.
- **Optional idle pre-warm** — with `auto: true`, the recap is generated after
  `idleDelayMs` of inactivity so quitting does not wait on a model call.
- **Configuration** at `~/.pi/agent/config/pi-session-recap.json`:
  `model`, `auto`, `idleDelayMs`, `exitTimeoutMs`, `printOnExit`.
