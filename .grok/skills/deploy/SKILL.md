---
name: deploy
description: >
  Smart-deploy TurboLane (static nginx site): auto-picks WIP working-tree deploy
  when there are uncommitted product changes, or full pull+stamp deploy when the
  tree is clean. Use when the user says "deploy", "redeploy", "ship it", "publish
  to the server", "stamp assets", "update version.json", or runs /deploy.
metadata:
  short-description: "Smart full or WIP deploy"
---

# /deploy — Smart TurboLane deploy

Nginx serves this repo folder as static files. Deploy = **stamp asset URLs** +
write **`version.json`** (clients poll it and reload). No npm/pm2.

## When to use

User asks to deploy / redeploy / publish / stamp / update the live site, or
runs `/deploy`.

## Hard rules

1. **Never** run bare `./scripts/deploy.sh` when there are **real uncommitted
   product changes** — that script `git checkout`s `index.html` / `js` / `css`
   and **wipes WIP**.
2. **Never commit or push** as part of deploy unless the user explicitly asks.
3. After deploy, stamp dirt on `index.html` + `js/*` imports is **expected**.
   Do not stage/commit `?v=` stamps. `version.json` stays untracked.
4. Prefer the smart entrypoint; do not re-implement stamping by hand unless the
   scripts are missing.

## Procedure

### 1. Run smart deploy

From repo root (`/var/www/html/foomaa-turboLane` or workspace root):

```bash
./scripts/deploy_smart.sh
```

Optional flags:

| Flag | Effect |
|------|--------|
| *(none)* | **Auto**: real uncommitted changes → WIP; clean/stamp-only → full |
| `--wip` | Force working-tree deploy (no fetch/pull/checkout) |
| `--full` | Force full deploy (`deploy.sh`: fetch, pull, stamp) |
| `--full <branch>` | Full deploy after checkout of branch |
| `--subject "msg"` | Custom `version.json` subject (WIP) |
| `--dry-run` | Print chosen mode only |

If the user names a release branch (e.g. `releases/v1.1.0-bgEnvNJump`) **and**
the tree has no real WIP, use:

```bash
./scripts/deploy_smart.sh --full releases/v1.1.0-bgEnvNJump
```

If they name a branch **but have real uncommitted work**, **refuse full
checkout** unless they confirm discarding/stashing — default to `--wip` and
warn.

### 2. Confirm result

Show the user:

- Mode used: **WIP** vs **FULL**
- `version.json` contents (`v`, `subject`, `builtAt`)
- That open tabs reload within ~30s (or hard-refresh)

```bash
cat version.json
grep -E 'style\.css|main\.js' index.html
```

### 3. Mode selection (what auto does)

`scripts/has_real_changes.py` decides based on paths that **full deploy
resets** (`git checkout -- index.html js css`):

- **Real changes** (exit 0): tracked modifications under `index.html`, `js/`,
  or `css/` that still differ from HEAD after stripping `?v=...` stamps
  → **WIP deploy**
  - Build id: `<shortsha>-wip`
  - Stamps the current working tree in place
  - Does **not** `git fetch` / `pull` / `checkout` (preserves WIP)
- **No real changes** (exit 1): clean protected paths, or only stamp-only dirt
  (or dirty files outside those paths, e.g. README / skills / scripts)
  → **FULL deploy** via `scripts/deploy.sh`
  - Restores stamp dirt, pulls, stamps with clean short SHA

`version.json` and untracked files never force WIP mode (checkout does not
delete them).

## Manual fallback (only if scripts missing)

**WIP:**

```bash
BUILD="$(git rev-parse --short HEAD)-wip"
python3 scripts/stamp_assets.py "$BUILD"
# write version.json with v=$BUILD, full=HEAD, subject=WIP..., builtAt=now
```

**FULL:**

```bash
./scripts/deploy.sh
# or: ./scripts/deploy.sh <branch>
```

## Do not

- Do not `git checkout -- index.html js css` when the user is mid-feature.
- Do not commit stamp query strings or `version.json`.
- Do not assume deploy implies push to GitHub.

## Quick reference

| Situation | Command |
|-----------|---------|
| “deploy so I can test this WIP” | `./scripts/deploy_smart.sh` (auto → WIP) |
| “deploy the committed release” | `./scripts/deploy_smart.sh` (auto → full) or `--full` |
| “force live my dirty tree” | `./scripts/deploy_smart.sh --wip` |
| “pull + deploy branch X” | only if clean: `./scripts/deploy_smart.sh --full X` |
