#!/usr/bin/env bash
# Copy only Chrome extension runtime files for local Load unpacked testing.
# Usage:
#   scripts/copy-extension.sh
#   scripts/copy-extension.sh /tmp/threads-ai-extension-test
#   scripts/copy-extension.sh extension-test

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-"$ROOT/extension"}"

if [[ "$DEST" != /* ]]; then
  DEST="$ROOT/$DEST"
fi

case "$DEST" in
  "$ROOT"|"$ROOT/"|"/"|"")
    echo "Refusing to overwrite unsafe destination: $DEST" >&2
    exit 1
    ;;
  "$ROOT/.git"|"$ROOT/.git/"*|"$ROOT/icons"|"$ROOT/icons/"*|"$ROOT/popup"|"$ROOT/popup/"*|"$ROOT/scripts"|"$ROOT/scripts/"*|"$ROOT/tests"|"$ROOT/tests/"*|"$ROOT/threads-ai-commenter"|"$ROOT/threads-ai-commenter/"*)
    echo "Refusing to overwrite source folder: $DEST" >&2
    exit 1
    ;;
esac

RUNTIME_FILES=(
  "manifest.json"
  "background.js"
  "content.js"
  "popup/popup.html"
  "popup/popup.js"
  "popup/popup.css"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

rm -rf "$DEST"
mkdir -p "$DEST"

for file in "${RUNTIME_FILES[@]}"; do
  mkdir -p "$DEST/$(dirname "$file")"
  cp "$ROOT/$file" "$DEST/$file"
done

echo "Copied extension files to: $DEST"
echo "Load unpacked: $DEST"
echo "Skipped non-extension folders, including: threads-ai-commenter, tests, dist, .git"
