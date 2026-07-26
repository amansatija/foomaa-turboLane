#!/usr/bin/env python3
"""Stamp static asset URLs with a build id so browsers fetch a fresh module graph.

Rewrites (in-place, intended for deploy working trees only):
  - index.html: css + entry script query string
  - js/*.js: static import specifiers that end in .js

Run via scripts/deploy.sh (which restores a clean tree first).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stamp_index(html: str, build: str) -> str:
    html = re.sub(
        r'(href=")(css/style\.css)(\?v=[^"]*)?(")',
        rf"\1\2?v={build}\4",
        html,
    )
    html = re.sub(
        r'(src=")(js/main\.js)(\?v=[^"]*)?(")',
        rf"\1\2?v={build}\4",
        html,
    )
    return html


# from './x.js' | from "../lib/x.js" | from './x.js?v=old'
IMPORT_RE = re.compile(
    r"""(?P<prefix>from\s+['"])(?P<path>\.{1,2}/[^'"]+?\.js)(?:\?v=[^'"]*)?(?P<suffix>['"])"""
)


def stamp_imports(source: str, build: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return f"{m.group('prefix')}{m.group('path')}?v={build}{m.group('suffix')}"

    return IMPORT_RE.sub(repl, source)


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("usage: stamp_assets.py <build-id>", file=sys.stderr)
        return 2

    build = re.sub(r"[^A-Za-z0-9._-]", "", sys.argv[1].strip())
    if not build:
        print("invalid build id", file=sys.stderr)
        return 2

    index_path = ROOT / "index.html"
    index_path.write_text(stamp_index(index_path.read_text(encoding="utf-8"), build), encoding="utf-8")

    for path in sorted((ROOT / "js").glob("*.js")):
        path.write_text(stamp_imports(path.read_text(encoding="utf-8"), build), encoding="utf-8")

    print(f"stamped assets with v={build}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
