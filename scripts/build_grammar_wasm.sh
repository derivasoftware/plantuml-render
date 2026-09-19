#!/usr/bin/env bash
# Rebuild grammar/tree-sitter-plantuml.wasm from the tag package.json pins
# (config.grammar). Run after every grammar repin; commit the result.
set -euo pipefail
cd "$(dirname "$0")/.."
spec=$(node -p "require('./package.json').config.grammar")
tag=${spec##*#}; repo=${spec#git+}; repo=${repo%#*}
tmp=$(mktemp -d)
git clone -q --depth 1 --branch "$tag" "$repo" "$tmp"
(cd "$tmp" && npx --yes tree-sitter-cli@0.26.12 build --wasm -o "$OLDPWD/grammar/tree-sitter-plantuml.wasm")
rm -rf "$tmp"
echo "grammar/tree-sitter-plantuml.wasm built from $tag"
