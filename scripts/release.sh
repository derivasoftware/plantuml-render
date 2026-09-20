#!/usr/bin/env bash
# Publish plantuml-render <version> on GitHub (REQ-00014-1, REQ-00022-1):
# the tag must already exist on main (`git tag -a vX.Y.Z && git push origin
# github vX.Y.Z`). Builds the executables (with their smoke test and
# SHA256SUMS), packs the npm tarball, uploads every asset one by one and
# publishes the release as latest. Needs bun, gh (authenticated) and a
# notes file: scripts/release.sh 0.13.0 notes.md
set -euo pipefail
cd "$(dirname "$0")/.."
version=${1:?usage: scripts/release.sh <version> <notes.md>}
notes=${2:?usage: scripts/release.sh <version> <notes.md>}
repo=${GITHUB_REPO:-derivasoftware/plantuml-render}
tag="v$version"
[ "$(node -p "require('./package.json').version")" = "$version" ] || { echo "package.json is not $version" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "tag $tag does not exist locally" >&2; exit 1; }
rm -rf dist && npm run binaries
npm pack >/dev/null
gh release view "$tag" --repo "$repo" >/dev/null 2>&1 ||
  gh release create "$tag" --repo "$repo" --title "plantuml-render $version" --notes-file "$notes" --draft
# One upload per call: a single call with ~400 MB of assets is fragile.
for asset in dist/plantuml-render-"$version"-* dist/SHA256SUMS "plantuml-render-$version.tgz"; do
  gh release upload "$tag" "$asset" --repo "$repo" --clobber
  echo "uploaded $(basename "$asset")"
done
gh release edit "$tag" --repo "$repo" --draft=false --latest
gh release view "$tag" --repo "$repo" --json url,assets --jq '.url, (.assets[] | "\(.name)\t\(.size)")'
