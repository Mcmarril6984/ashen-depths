#!/usr/bin/env bash
# Publish docs/ from the current branch to the gh-pages branch root (the live GitHub Pages site).
# Usage: tools/publish.sh   (run from the repo root with a clean working tree)
#
# Phones cache each file for ~10 minutes on their own clock, so a page could mix new and old code modules and fail
# to start. To prevent that, the code is published into a folder named after the commit (src-<sha>/) and the page
# points at it; the last few versions stay online so a slightly stale page still finds its own code.
set -euo pipefail
src=$(git rev-parse --abbrev-ref HEAD)
sha=$(git rev-parse --short HEAD)
keep=5
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
tmp=$(mktemp -d)
cp -r docs/. "$tmp"/
cp -r "$tmp/src" "$tmp/src-$sha"   # src/ stays too, for pages cached before versioned folders existed
sed -i "s#const CODE = 'src/';#const CODE = 'src-$sha/';#" "$tmp/index.html"
grep -q "const CODE = 'src-$sha/';" "$tmp/index.html" || { echo "Could not point index.html at src-$sha"; exit 1; }
# list of code files the page pre-fetches with retries before starting the game
(cd "$tmp/src-$sha" && find . -name '*.js' | sed 's#^\./##' | sort > modules.txt)
cp "$tmp/src-$sha/modules.txt" "$tmp/src/modules.txt"
git fetch -q origin gh-pages
git checkout -q gh-pages
git pull -q origin gh-pages
# keep the newest earlier code folders (listed in versions.txt, newest last), drop everything else
touch versions.txt
grep -vx "$sha" versions.txt | tail -n $((keep - 1)) > "$tmp/versions.prev" || true
for d in src-*; do [ -d "$d" ] && grep -qx "${d#src-}" "$tmp/versions.prev" && cp -r "$d" "$tmp/"; done
cat "$tmp/versions.prev" > "$tmp/versions.txt"; echo "$sha" >> "$tmp/versions.txt"; rm "$tmp/versions.prev"
git rm -rq --ignore-unmatch . >/dev/null
cp -r "$tmp"/. .
touch .nojekyll
git add -A
git commit -qm "Publish docs/ from $src ($sha)" || echo "Nothing changed."
git push -q origin gh-pages
git checkout -q "$src"
rm -rf "$tmp"
echo "Published $sha. Live in about a minute: https://mcmarril6984.github.io/ashen-depths/"
