#!/usr/bin/env bash
# Publish docs/ from the current branch to the gh-pages branch root (the live GitHub Pages site).
# Usage: tools/publish.sh   (run from the repo root with a clean working tree)
set -euo pipefail
src=$(git rev-parse --abbrev-ref HEAD)
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
tmp=$(mktemp -d)
cp -r docs/. "$tmp"/
git fetch origin gh-pages
git checkout -q gh-pages
git pull -q origin gh-pages
git rm -rq --ignore-unmatch . >/dev/null
cp -r "$tmp"/. .
touch .nojekyll
git add -A
git commit -qm "Publish docs/ from $src ($(git rev-parse --short "$src"))" || echo "Nothing changed."
git push -q origin gh-pages
git checkout -q "$src"
rm -rf "$tmp"
echo "Published. Live in about a minute: https://mcmarril6984.github.io/ashen-depths/"
