#!/usr/bin/env bash
# Publish site/ to https://github.com/augmented-noticing/augmented-noticing.github.io (GitHub Pages).
# The research repository keeps site/ as source; the Pages repo only ever receives a fresh snapshot.
set -euo pipefail
SITE="$(cd "$(dirname "$0")" && pwd)"
REPO="git@github.com:augmented-noticing/augmented-noticing.github.io.git"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --depth 1 "$REPO" "$WORK" 2>/dev/null || git -C "$WORK" init --quiet -b main
git -C "$WORK" remote get-url origin >/dev/null 2>&1 || git -C "$WORK" remote add origin "$REPO"
find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
rsync -a --exclude '.DS_Store' --exclude '__pycache__' "$SITE/" "$WORK/"
touch "$WORK/.nojekyll"
git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then echo "Nothing to deploy."; exit 0; fi
git -C "$WORK" -c user.name="Botao Amber Hu" -c user.email="amber@reality.design" commit --quiet -m "Deploy site $(date -u +%Y-%m-%dT%H:%MZ)"
git -C "$WORK" push --quiet -u origin main
echo "Deployed → https://augmented-noticing.github.io/"
