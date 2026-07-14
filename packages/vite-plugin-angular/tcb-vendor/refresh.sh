#!/usr/bin/env bash
#
# Reproducibly re-vendor Angular's `packages/compiler/src/typecheck/` subtree.
#
# This is a verbatim snapshot of the TypeScript-decoupled type-check-block
# generator from angular/angular. It is fetched, not hand-edited, so a refresh
# is `git diff`-clean against upstream. Any local adaptation (import rewiring,
# see VENDORING.md) lives in a SEPARATE, reviewable commit on top of the
# verbatim import — never edit the fetched files in place, or the next refresh
# silently clobbers the adaptation.
#
# Usage:  ./refresh.sh [<git-ref>]
#   e.g.  ./refresh.sh d5e0b13
#
# Requires only `curl` (uses raw.githubusercontent.com; the GitHub tree API is
# not reachable from this environment, so the file set is resolved by a BFS over
# in-subtree relative imports rather than a directory listing).

set -euo pipefail

REF="${1:-d5e0b13}"
ROOT="https://raw.githubusercontent.com/angular/angular/${REF}/packages/compiler/src"
DEST="$(cd "$(dirname "$0")" && pwd)/typecheck"

echo "Re-vendoring angular/angular@${REF} :: packages/compiler/src/typecheck -> ${DEST}"
rm -rf "$DEST"; mkdir -p "$DEST"

declare -A seen
# Seed with the type-check-block entry points; the BFS discovers the rest.
queue=(type_check_block api schema oob expression host_bindings comments)

fetch() {
  local rel="$1"
  [[ -n "${seen[$rel]:-}" ]] && return 0
  seen[$rel]=1
  local out="$DEST/$rel.ts"
  mkdir -p "$(dirname "$out")"
  local code
  code=$(curl -sS --max-time 30 -o "$out" -w "%{http_code}" "$ROOT/typecheck/$rel.ts")
  if [[ "$code" != "200" ]]; then
    rm -f "$out"          # a MISS here is an out-of-subtree import (expected)
    return 0
  fi
  local dir; dir=$(dirname "$rel"); [[ "$dir" == "." ]] && dir=""
  while IFS= read -r spec; do
    [[ -z "$spec" ]] && continue
    local resolved
    if [[ -n "$dir" ]]; then resolved=$(realpath -m "/$dir/$spec"); else resolved=$(realpath -m "/$spec"); fi
    resolved="${resolved#/}"
    [[ "$resolved" == ..* || "$resolved" == /* ]] && continue  # escapes subtree
    queue+=("$resolved")
  done < <(grep -oE "from '\.[^']+'" "$out" | sed "s/from '//;s/'//")
}

i=0
while (( i < ${#queue[@]} )); do
  item="${queue[$i]}"; i=$((i+1))
  [[ "$item" == ..* || "$item" == /* ]] && continue
  fetch "$item"
done

count=$(find "$DEST" -name '*.ts' | wc -l | tr -d ' ')
loc=$(find "$DEST" -name '*.ts' -exec cat {} + | wc -l | tr -d ' ')
echo "Vendored ${count} files (${loc} LOC) from angular/angular@${REF}"
echo "Remember to update the pinned ref + counts in VENDORING.md."
