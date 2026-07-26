#!/usr/bin/env python3
"""Detect uncommitted changes that full deploy would destroy.

Full deploy (`scripts/deploy.sh`) runs:
  git checkout -- index.html js css
so only **non-stamp** dirty content under those paths must force WIP deploy.

Exit codes:
  0  — real uncommitted changes in stamp-restored paths (use WIP deploy)
  1  — safe for full deploy (clean, or only stamp-only dirt / other files)
  2  — usage / internal error

Stamp-only means the working tree differs from HEAD only by `?v=...` query
strings on asset URLs / ES module imports (what stamp_assets.py writes).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

STAMP_RE = re.compile(r"\?v=[A-Za-z0-9._-]+")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


def normalize_stamps(text: str) -> str:
    return STAMP_RE.sub("", text)


def is_protected_path(path: str) -> bool:
    """Paths full deploy resets via git checkout."""
    if path == "index.html":
        return True
    return path.startswith("js/") or path.startswith("css/")


def porcelain_paths() -> list[tuple[str, str]]:
    out = git("status", "--porcelain", "-u")
    rows: list[tuple[str, str]] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        status = line[:2]
        rest = line[3:]
        if " -> " in rest:
            path = rest.split(" -> ", 1)[1]
        else:
            path = rest
        rows.append((status, path))
    return rows


def path_has_real_diff(path: str) -> bool:
    """True if path differs from HEAD after stripping stamp query strings."""
    try:
        head = git("show", f"HEAD:{path}")
    except subprocess.CalledProcessError:
        # New file under protected paths → real (would be lost on checkout? 
        # untracked files are NOT removed by git checkout -- paths; only tracked mods.
        # Untracked protected files are safe for full deploy. Return False for ??.
        return False

    work_path = ROOT / path
    if not work_path.is_file():
        # deleted tracked file under protected path
        return True
    work = work_path.read_text(encoding="utf-8", errors="replace")
    return normalize_stamps(work) != normalize_stamps(head)


def main() -> int:
    try:
        rows = porcelain_paths()
    except subprocess.CalledProcessError as e:
        print(f"git status failed: {e}", file=sys.stderr)
        return 2

    real: list[str] = []
    for status, path in rows:
        if not is_protected_path(path):
            continue
        # Untracked files are not wiped by `git checkout -- index.html js css`
        if status.strip() == "??" or status[0] == "?" or status[1] == "?":
            continue
        # Deleted / modified / staged protected paths
        if path_has_real_diff(path):
            real.append(f"{status} {path}")

    if real:
        print("real_changes (would be wiped by full deploy):")
        for p in real:
            print(f"  {p}")
        return 0

    print("no_real_changes (safe for full deploy)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
