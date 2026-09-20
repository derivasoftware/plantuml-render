#!/usr/bin/env bash
# Write <dir>/SHA256SUMS covering every plantuml-render executable in <dir>
# (REQ-00022-1): one line per file in `sha256sum` format, sorted by name, so
# a downloader verifies its file with `sha256sum -c SHA256SUMS --ignore-missing`
# (`shasum -a 256 -c` on macOS). Default <dir>: dist.
set -euo pipefail
dir=${1:-dist}
cd "$dir"
if command -v sha256sum >/dev/null 2>&1; then
  hash() { sha256sum "$@"; }
else
  hash() { shasum -a 256 "$@"; }
fi
files=$(ls plantuml-render-* 2>/dev/null | LC_ALL=C sort)
[ -n "$files" ] || { echo "checksums: no plantuml-render-* files in $dir" >&2; exit 1; }
# shellcheck disable=SC2086
hash $files > SHA256SUMS
echo "checksums: $dir/SHA256SUMS ($(wc -l < SHA256SUMS | tr -d ' ') files)"
