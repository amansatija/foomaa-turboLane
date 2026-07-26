#!/usr/bin/env bash
# Deploy TurboLane: pull latest, stamp assets with git SHA, write version.json.
# Usage:
#   ./scripts/deploy.sh                          # current branch
#   ./scripts/deploy.sh releases/v1.1.0-bgEnvNJump
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-}"

echo "==> repo: $ROOT"

# Drop previous ?v= stamps on tracked files so pull/checkout stays clean.
# Does not delete untracked files (keeps version.json, local notes, etc.).
if [[ -n "$(git status --porcelain -- index.html js css)" ]]; then
  echo "==> restoring stamped tracked files (index/js/css)"
  git checkout -- index.html js css 2>/dev/null || git checkout -- .
fi

echo "==> fetching"
git fetch --all --prune --tags

if [[ -n "$BRANCH" ]]; then
  echo "==> checking out $BRANCH"
  git checkout "$BRANCH"
fi

echo "==> pulling"
git pull --ff-only

BUILD="$(git rev-parse --short HEAD)"
FULL="$(git rev-parse HEAD)"
SUBJECT="$(git log -1 --pretty=%s)"
WHEN="$(git log -1 --pretty=%cI)"

echo "==> build $BUILD — $SUBJECT"

python3 "$ROOT/scripts/stamp_assets.py" "$BUILD"

# Never cache this file — clients poll it to detect new releases
cat > "$ROOT/version.json" <<EOF
{
  "v": "$BUILD",
  "full": "$FULL",
  "subject": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$SUBJECT"),
  "builtAt": "$WHEN"
}
EOF

echo "==> wrote version.json"
cat "$ROOT/version.json"
echo
echo "Deploy complete. Browsers will pick this up on next load (or within ~30s if a tab is open)."
echo "No pm2/npm rebuild needed — nginx serves this folder as static files."
