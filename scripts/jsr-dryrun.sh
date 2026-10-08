#!/usr/bin/env bash
# Local JSR publish dry-run helper.
#
# Generated declarations (adjacent `.d.ts` files under the noflo package's
# `src/`) are git-ignored (build artifacts, never committed), but JSR's
# underlying `deno publish` honors `.gitignore` and would otherwise drop
# them. CI un-ignores them at publish time (see
# `.github/workflows/publish.yml`); this script does the same for a local
# dry-run and restores `.gitignore` exactly as it was on exit.
#
# Usage:
#   scripts/jsr-dryrun.sh                 # dry-run every JSR package
#   scripts/jsr-dryrun.sh noflo           # dry-run one package
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITIGNORE="$ROOT/.gitignore"
NEGLINES=(
  '!packages/noflo/src/**/*.d.ts'
)

# Snapshot .gitignore so we can restore it verbatim (even on error / Ctrl-C).
backup="$(mktemp)"
cp "$GITIGNORE" "$backup"
trap 'cp "$backup" "$GITIGNORE"; rm -f "$backup"' EXIT

# Un-ignore the generated declarations for the duration of this run.
for line in "${NEGLINES[@]}"; do
  grep -qxF "$line" "$GITIGNORE" || printf '\n%s\n' "$line" >> "$GITIGNORE"
done

# Regenerate declarations so the dry-run reflects current source.
(cd "$ROOT" && npm run types --workspaces --if-present) >/dev/null 2>&1 || true

# Discover JSR packages (dirs carrying a jsr.json), or use the given names.
declare -a packages=()
if [ "$#" -gt 0 ]; then
  packages=("$@")
  for p in "${packages[@]}"; do
    if [ ! -f "$ROOT/packages/$p/jsr.json" ]; then
      echo "::error::Package '$p' has no jsr.json under packages/" >&2
      exit 1
    fi
  done
else
  for jsr in "$ROOT"/packages/*/jsr.json; do
    [ -e "$jsr" ] || break  # no matches → empty list
    packages+=("$(basename "$(dirname "$jsr")")")
  done
fi

if [ "${#packages[@]}" -eq 0 ]; then
  echo "No JSR packages yet (no packages/*/jsr.json) — nothing to dry-run."
  exit 0
fi

for p in "${packages[@]}"; do
  name="$(node -p "require('$ROOT/packages/$p/jsr.json').name")"
  echo "=== $name ==="
  # deno >= 2 ships native `deno publish`; the standalone jsr CLI (npx)
  # embeds an older deno that panics on some declaration rewrites
  #
  # --allow-slow-types is INTERIM: the @noflo/noflo type-surface audit
  # (work document #7, GitHub #1035/#1036/#1037) is the real fix —
  # roughly 200 public-API members need explicit types in JSDoc source.
  # Remove the flag once the audit lands so the gate bites again.
  (cd "$ROOT/packages/$p" && deno publish --dry-run --allow-dirty --no-check --allow-slow-types)
done
