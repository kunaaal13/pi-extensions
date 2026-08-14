# Changelog

All notable changes to `pi-context-rename` are documented here. This project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-08-15

Initial release.

### Added

- **Automatic rename** — generates a short title from the conversation after the
  first real prompt of a new session, and sets it as the Pi session name.
- **`/rename` command** — regenerate the title from the recent conversation at
  any point.
- **Terminal title propagation** — emits the OSC 0 escape sequence, understood
  by Terminal.app, iTerm2, Warp, Kitty, WezTerm, Ghostty, and tmux.
- **Optional herdr integration** — when `HERDR_PANE_ID` is set, renames the pane,
  and the tab too when the tab holds a single pane. Failures are silent; Pi
  session naming still succeeds.
- **Resume-safe** — resumed sessions and sessions that already carry a name are
  never automatically renamed.
- **Configuration** at `~/.pi/agent/config/pi-context-rename.json`:
  `model`, `maxWords`, `maxChars`.
