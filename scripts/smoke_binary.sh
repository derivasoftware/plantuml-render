#!/usr/bin/env bash
# What "this executable works" means, in one place (REQ-00028-1).
#
# The compiled binary is never exercised by the node test suite, so
# runtime-only breakage — a dependency taking a browser code path under
# bun, a missing embedded asset — is visible only by running the file.
# scripts/build_binaries.sh calls this for the host's binary and the
# mirror's workflow calls it once per platform, so "verified" means the
# same thing wherever it is claimed.
#
# Usage: scripts/smoke_binary.sh <executable> <expected version>
set -euo pipefail

bin=$1
expected=$2
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf '@startuml\nclass Order {\n  +total(): Money\n}\nclass Line\nOrder *-- Line\n@enduml\n' \
  > "$tmp/smoke.puml"

got=$("$bin" --version)
[ "$got" = "$expected" ] || {
  echo "smoke: --version printed '$got', expected '$expected'" >&2
  exit 1
}

"$bin" "$tmp/smoke.puml" -o "$tmp/smoke.svg" >/dev/null
grep -q '<svg' "$tmp/smoke.svg" || { echo "smoke: no SVG produced" >&2; exit 1; }
grep -q 'Order' "$tmp/smoke.svg" || {
  echo "smoke: the SVG does not name the class it drew" >&2
  exit 1
}

echo "smoke passed: $(basename "$bin") (--version, render)"
