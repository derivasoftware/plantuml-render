#!/usr/bin/env bash
# Build the standalone executables (REQ-00014-1): one file per platform with
# the grammar wasm, the web-tree-sitter runtime and the manual embedded.
# Needs bun (https://bun.sh); cross-compiles from any host.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run compile >/dev/null
mkdir -p dist
version=$(node -p "require('./package.json').version")
for target in linux-x64 linux-arm64 windows-x64 darwin-arm64 darwin-x64; do
  out="dist/plantuml-render-${version}-${target}"
  bun build --compile --target="bun-${target}" scripts/standalone.mjs --outfile "$out" >/dev/null
  echo "built ${out}$( [ "$target" = windows-x64 ] && echo .exe )"
done
