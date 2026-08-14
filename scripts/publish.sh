#!/usr/bin/env bash
#
# Publish the pi extension packages in this repo to npm.
#
#   scripts/publish.sh                      # publish every package that needs it
#   scripts/publish.sh session-recap        # publish one package
#   scripts/publish.sh --dry-run            # rehearse, touch nothing
#   scripts/publish.sh --otp 123456         # pass a 2FA code through to npm
#
# Every package is gated on: clean git tree, typecheck passing, and the version
# in package.json not already existing on the registry. Packages whose current
# version is already published are skipped, not failed — so re-running after a
# partial publish is safe.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

dry_run=""
otp=""
allow_dirty=""
targets=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     dry_run="1" ;;
    --otp)         otp="${2:?--otp needs a code}"; shift ;;
    --otp=*)       otp="${1#--otp=}" ;;
    --allow-dirty) allow_dirty="1" ;;
    -h|--help)     awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    -*)            echo "unknown flag: $1" >&2; exit 2 ;;
    *)             targets+=("$1") ;;
  esac
  shift
done

die()  { printf '\033[31merror\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
skip() { printf '\033[33m  skip\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m  ok\033[0m %s\n' "$*"; }

# Discover packages: any top-level directory whose package.json carries a "pi"
# manifest field. Keeps working when packages are added or removed.
discover() {
  for dir in */; do
    dir="${dir%/}"
    [ -f "$dir/package.json" ] || continue
    node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pi ? 0 : 1)' \
      "$dir/package.json" 2>/dev/null && echo "$dir"
  done
}

if [ ${#targets[@]} -eq 0 ]; then
  while IFS= read -r line; do targets+=("$line"); done < <(discover)
fi
[ ${#targets[@]} -gt 0 ] || die "no pi packages found in $root"

if [ -z "$allow_dirty" ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  die "working tree is dirty; commit first or pass --allow-dirty"
fi

whoami_out="$(npm whoami 2>/dev/null || true)"
[ -n "$whoami_out" ] || die "not logged in to npm; run 'npm login' first"
info "publishing as $whoami_out${dry_run:+ (dry run)}"

if [ -z "$otp" ] && [ -z "$dry_run" ] && [ ! -t 0 ]; then
  echo "  note: no TTY and no --otp. If your account enforces 2FA on writes," >&2
  echo "        npm cannot prompt and the publish will fail with EOTP." >&2
fi

published=0
for pkg in "${targets[@]}"; do
  [ -d "$pkg" ] || die "no such directory: $pkg"
  [ -f "$pkg/package.json" ] || die "$pkg has no package.json"

  name="$(node -p "require('./$pkg/package.json').name")"
  version="$(node -p "require('./$pkg/package.json').version")"
  info "$name@$version"

  if npm view "$name@$version" version >/dev/null 2>&1; then
    skip "$version is already on the registry — bump the version to release again"
    continue
  fi

  (cd "$pkg" && npm run --silent typecheck) || die "$name failed typecheck"
  ok "typecheck"

  args=(publish --access public)
  [ -n "$dry_run" ] && args+=(--dry-run)
  [ -n "$otp" ] && args+=(--otp "$otp")

  (cd "$pkg" && npm "${args[@]}" >/dev/null) || die "$name failed to publish"
  ok "published${dry_run:+ (dry run)}"
  published=$((published + 1))
done

info "$published package(s) published${dry_run:+ (dry run)}"
