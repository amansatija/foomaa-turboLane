# Handoff Brief — for grok

You are taking ownership of implementing the **Jump, Levels & Environments**
feature set for the Turbo Lane 3D car racer. The spec and execution plan are
already written. Your job is to implement them.

## Where everything lives
- Repo root (where you should work): `workspace/3dcarracer/`
- Spec (read first): `workspace/3dcarracer/docs/plans/01-spec-jump-levels-environments.md`
- Execution plan (read second): `workspace/3dcarracer/docs/plans/02-execution-plan.md`
- Existing code: `workspace/3dcarracer/js/{main,car,road,input,audio}.js`, `css/style.css`, `index.html`

## How to work (parallel vs sequential)
The execution plan defines two waves:

**WAVE 1 — run these in parallel (5 independent files, no cross-deps):**
- `js/hazard.js` (new) — jumpable obstacles
- `js/environment.js` (new) — 4 biome definitions
- `js/input.js` (edit) — Space→jump, jump button
- `js/audio.js` (edit) — jump/land/levelUp SFX
- `css/style.css` (edit) — jump btn, toast, env picker, level flash

You may use your own subagents/Task tool to fan these out concurrently. Each
touches a different file so there are zero merge conflicts.

**WAVE 2 — strictly sequential (do in this order):**
1. `js/car.js` — jump arc + shadow (depends on nothing, but keep here)
2. `js/road.js` — shared mats + scenery + setEnv (BLOCKER: needs `environment.js` merged first)
3. `index.html` — DOM (class names must match the css from Wave 1)
4. `js/main.js` — the integrator (do LAST, alone; depends on ALL prior files)

**WAVE 3 — verify:** `python3 -m http.server 8000` from `workspace/3dcarracer/`,
open browser, run the functional checklist in `02-execution-plan.md` §3b.

## Hard constraints
- No npm, no build step, vendored Three.js only (`lib/three.module.js`).
- Match existing code style (ES modules, 2-space indent, header comment).
- Do not break the existing public API of any module.
- `highway` biome palette in `environment.js` MUST equal today's hardcoded colors (see `01-spec` §C1).
- Pause must freeze EVERYTHING (jump arc, env tween, timers).

## Tuning constants (single source of truth — see spec §Tuning)
JUMP_DURATION=0.7, JUMP_HEIGHT=2.6, AIRBORNE_CLEAR_Y=0.7, HAZARD_INTERVAL=9–14s,
HAZARD_SCORE_BONUS=40, LEVEL_STEP=1500, LEVEL_SPEED_KICK=10,
ENV_CHANGE_MIN/MAX=45/75s, ENV_TWEEN=1.5s.

## When you're done
Report: files created/edited, any deviations from spec + why, and the result of
the §3b functional checklist.
