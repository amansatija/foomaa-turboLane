#!/usr/bin/env bash
# Smart deploy for TurboLane (static nginx folder).
#
# Auto mode (default):
#   - Real uncommitted product changes → WIP deploy (stamp working tree, no pull/checkout)
#   - Clean tree (or only stamp-only dirt) → full deploy (fetch/pull + stamp)
#
# Usage:
#   ./scripts/deploy_smart.sh                 # auto
#   ./scripts/deploy_smart.sh --wip           # force working-tree deploy
#   ./scripts/deploy_smart.sh --full [branch] # force full deploy (optional branch)
#   ./scripts/deploy_smart.sh --subject "msg" # subject line for WIP version.json
#   ./scripts/deploy_smart.sh --dry-run       # print mode only, do not stamp
#
# Never commits or pushes. Stamp dirt left on index/js is expected after deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="auto"          # auto | wip | full
BRANCH=""
SUBJECT_OVERRIDE=""
DRY_RUN=0

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wip) MODE="wip"; shift ;;
    --full) MODE="full"; shift ;;
    --subject)
      SUBJECT_OVERRIDE="${2:-}"
      [[ -n "$SUBJECT_OVERRIDE" ]] || usage
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    -*)
      echo "unknown flag: $1" >&2
      usage
      ;;
    *)
      # positional branch only valid for full/auto→full
      BRANCH="$1"
      shift
      ;;
  esac
done

echo "==> repo: $ROOT"
echo "==> mode request: $MODE"

if [[ "$MODE" == "auto" ]]; then
  DETECT_OUT="$(mktemp)"
  set +e
  python3 "$ROOT/scripts/has_real_changes.py" >"$DETECT_OUT" 2>&1
  DETECT_RC=$?
  set -e
  if [[ "$DETECT_RC" -eq 0 ]]; then
    MODE="wip"
    echo "==> detected REAL uncommitted changes → WIP deploy (will NOT git checkout/pull)"
    cat "$DETECT_OUT"
  elif [[ "$DETECT_RC" -eq 1 ]]; then
    MODE="full"
    echo "==> tree clean (or stamp-only dirt) → FULL deploy"
    cat "$DETECT_OUT"
  else
    echo "has_real_changes.py failed:" >&2
    cat "$DETECT_OUT" >&2
    rm -f "$DETECT_OUT"
    exit 2
  fi
  rm -f "$DETECT_OUT"
fi

write_version() {
  local build="$1" full="$2" subject="$3" when="$4"
  cat > "$ROOT/version.json" <<EOF
{
  "v": "$build",
  "full": "$full",
  "subject": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$subject"),
  "builtAt": "$when"
}
EOF
  echo "==> wrote version.json"
  cat "$ROOT/version.json"
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> dry-run: would run MODE=$MODE BRANCH=${BRANCH:-"(current)"}"
  exit 0
fi

if [[ "$MODE" == "full" ]]; then
  if [[ -n "$BRANCH" ]]; then
    exec "$ROOT/scripts/deploy.sh" "$BRANCH"
  else
    exec "$ROOT/scripts/deploy.sh"
  fi
fi

# ---------- WIP / working-tree deploy ----------
# Never restore/checkout — preserve uncommitted work. Stamp as-is.
SHORT="$(git rev-parse --short HEAD)"
FULL="$(git rev-parse HEAD)"
BUILD="${SHORT}-wip"
WHEN="$(date -Iseconds)"
if [[ -n "$SUBJECT_OVERRIDE" ]]; then
  SUBJECT="$SUBJECT_OVERRIDE"
else
  SUBJECT="WIP working-tree deploy (uncommitted changes on ${SHORT})"
fi

echo "==> WIP build $BUILD — $SUBJECT"
python3 "$ROOT/scripts/stamp_assets.py" "$BUILD"
write_version "$BUILD" "$FULL" "$SUBJECT" "$WHEN"
echo
echo "WIP deploy complete. Browsers pick this up on next load (or ~30s if a tab is open)."
echo "NOTE: uncommitted work is live; stamps dirtied index.html / js imports (do not commit stamps)."
echo "Full deploy (pull+clean stamp) is blocked until you commit or discard real changes — or pass --full."
