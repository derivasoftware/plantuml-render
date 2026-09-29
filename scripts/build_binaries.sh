#!/usr/bin/env bash
# Build the standalone executables (REQ-00014-1): one file per platform with
# the grammar wasm, the web-tree-sitter runtime and the manual embedded.
# Needs bun (https://bun.sh); cross-compiles from any host.
#
# `--define self=undefined`: bun defines `self` in its main thread, and
# elkjs' worker module treats "self without document" as running inside a
# web worker, so it installs a message handler instead of exporting its
# Worker class and `new ELK()` then fails at start-up. With `self` compiled
# out, elkjs takes the same module path it takes under node.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run compile >/dev/null
mkdir -p dist
version=$(node -p "require('./package.json').version")
for target in linux-x64 linux-arm64 windows-x64 darwin-arm64 darwin-x64; do
  out="dist/plantuml-render-${version}-${target}"
  bun build --compile --target="bun-${target}" --define self=undefined \
    scripts/standalone.mjs --outfile "$out" >/dev/null
  echo "built ${out}$( [ "$target" = windows-x64 ] && echo .exe )"
done

# Smoke test of the host's executable. The assertions live in
# scripts/smoke_binary.sh so that this host check and the per-platform
# jobs on the mirror (.github/workflows/binaries.yml) verify the same
# thing; the other four binaries are cross-compiled here and can only be
# run on their own platform.
host="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')"
smoke="dist/plantuml-render-${version}-${host}"
if [ -x "$smoke" ]; then
  bash scripts/smoke_binary.sh "$smoke" "$version"
else
  echo "smoke test skipped: no executable for host ${host}"
fi

# SHA256SUMS next to the executables (REQ-00022-1): the tag job and the
# release script publish it with them.
bash scripts/checksums.sh dist
