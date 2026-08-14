# pi-extensions

Extensions for [Pi](https://github.com/earendil-works/pi), each published as its
own npm package.

| Package | What it does | Install |
|---------|--------------|---------|
| [`pi-session-recap`](./session-recap) | Writes a handoff recap — a short summary plus the next action — into the transcript when a session ends, so resuming starts with where you left off. | `pi install npm:pi-session-recap` |
| [`pi-context-rename`](./context-rename) | Names your chat from its own content and propagates the title to the terminal tab (and to herdr panes, when present). | `pi install npm:pi-context-rename` |

Each package is self-contained: its own `package.json`, `README.md`,
`CHANGELOG.md`, and `LICENSE`. Nothing is shared across them, so any package can
be installed, versioned, and released on its own.

## Layout

```
session-recap/
  extensions/recap.ts     # the extension entry, referenced by pi.extensions
  package.json            # npm + pi manifest
  README.md CHANGELOG.md LICENSE tsconfig.json
context-rename/
  extensions/rename.ts
  package.json
  README.md CHANGELOG.md LICENSE tsconfig.json
```

The `pi` field in each `package.json` is what makes it a Pi package:

```json
{
  "pi": { "extensions": ["./extensions/recap.ts"] }
}
```

Pi resolves those paths relative to the package root when the package is
installed from npm, from git, or from a local path.

## Install

From npm:

```sh
pi install npm:pi-session-recap
pi install npm:pi-context-rename
```

From this repository:

```sh
pi install git:github.com/kunaaal13/pi-extensions
```

Or from a local checkout, one package at a time:

```sh
pi install ./session-recap
pi install ./context-rename
```

## Development

Each package installs and checks independently:

```sh
cd session-recap
npm install
npm run typecheck
npm run pack:dry-run
```

## Publishing

```sh
npm login
cd session-recap && npm publish --access public
cd ../context-rename && npm publish --access public
```

Bump the version in `package.json` and add a `CHANGELOG.md` entry before each
release.

## License

MIT © [kunaaal13](https://github.com/kunaaal13)
