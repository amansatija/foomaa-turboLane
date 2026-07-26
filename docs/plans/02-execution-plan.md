# Execution Plan — Phases, Parallelism & Dependencies

> Companion to `01-spec-jump-levels-environments.md`.
> Read this before writing any code. It tells you WHAT is independent
> (safe to parallelize via subagents) and WHAT MUST be sequential
> (integration steps that touch the same file or depend on prior work).

**All paths below are relative to `workspace/3dcarracer/`.**

---

## Dependency map at a glance

```
Phase 1 (WAVE 1 — fully parallel, no shared files)
 ├─ [1a] js/hazard.js        (NEW file)        ──┐
 ├─ [1b] js/environment.js   (NEW file)        ──┤
 ├─ [1c] js/input.js         (EDIT — jump key) ──┤
 ├─ [1d] js/audio.js         (EDIT — 3 SFX)    ──┤
 └─ [1e] css/style.css       (EDIT — UI)       ──┘
        (each touches a DIFFERENT file → safe to run concurrently)

Phase 2 (WAVE 2 — sequential, single integrator)
 └─ [2a] js/car.js           (EDIT — jump arc, shadow)
        depends on: nothing (can even start in Wave 1 if careful,
        but keep it here to avoid merge friction)
 └─ [2b] js/road.js          (EDIT — shared mats, scenery, setEnv)
        depends on: [1b] environment.js must export ENVIRONMENTS shape first
 └─ [2c] index.html          (EDIT — jump btn, toast, picker, pause info)
        depends on: css classes from [1e] exist (names must match)
 └─ [2d] js/main.js          (EDIT — THE integrator)
        depends on: ALL of 1a–1e, 2a, 2b, 2c
        This is the single biggest edit. Do it LAST and alone.

Phase 3 (WAVE 3 — sequential verification)
 └─ [3a] Run http server, manual + console check
        depends on: 2d complete
 └─ [3b] Fix any regressions (loop back to the relevant file)
```

---

## PHASE 1 — Parallel wave (dispatch as independent subagents)

These five edits touch **five different files** with **no cross-deps**. Run them
concurrently for speed. Each subagent gets ONE file + the exact spec section.

| ID | File | Type | Spec ref | Key outputs |
|----|------|------|----------|-------------|
| 1a | `js/hazard.js` | NEW | Feature B | `createHazard(scene)`, `HAZARD_WIDTH/LENGTH/HEIGHT`, 3 factories (barrier/cones/drum) |
| 1b | `js/environment.js` | NEW | C1 | `ENVIRONMENTS` map (4 biomes), `ENV_LIST`, `randomEnv(except)`. **`highway` palette must equal today's hardcoded constants** |
| 1c | `js/input.js` | EDIT | Feature A (input) | `Space→jump` one-shot, `jump` in state + poll, `#jump-btn` press handler, quick-tap = jump+confirm |
| 1d | `js/audio.js` | EDIT | Feature A (audio) | add `jump()`, `land()`, `levelUp()` to the returned object (do not break existing API) |
| 1e | `css/style.css` | EDIT | Cross-cutting | `.jump-btn` (mirror `.nitro-btn`, blue, bottom-LEFT, touch-only via existing media query), `#level-toast`, `#env-label` badge, `.env-btn`+`.env-btn.selected`, `#level-label.flash` |

### Contracts every Wave-1 subagent must respect
- **Do NOT edit `js/main.js`, `js/road.js`, `js/car.js`, or `index.html`** — those are Phase 2.
- **Do NOT import from each other** except: `1a` may import constants from `road.js` (already exists); `1b` is standalone.
- Keep the existing code style (ES modules, JSDoc-free header comment, 2-space indent, `const`-first).
- No new npm deps. No build step. Vendored Three.js only.

---

## PHASE 2 — Sequential integration (one editor at a time)

Order matters here. Do them in this order.

### [2a] `js/car.js` — jump arc + ground shadow
- Spec: Feature A (Player section).
- Edit `createPlayer`: extend `state`, add `jump()`, add ground-shadow blob mesh (parent to `scene`, track for position updates), update `update(dt)` with parabola + land squash.
- Export `JUMP_DURATION`, `JUMP_HEIGHT`, `AIRBORNE_CLEAR_Y` so `main.js` can read the clear threshold.
- **Testable in isolation?** No — needs `main.js` to call `player.jump()`. So validate only after 2d.

### [2b] `js/road.js` — shared mats + scenery + setEnv
- Spec: C2. **Blocker**: requires `ENVIRONMENTS` shape from task `1b`. Confirm `1b` is merged before starting.
- Hoist `groundMat` + `asphaltMat` to module scope (singletons). Update `makeGrass`/`makeAsphalt` to use them.
- Add `makePalm()`, `makeCactus()`, `makeRock()`, `makeBuilding()`.
- Add module-level `activeEnv` (default `ENVIRONMENTS.highway`). Rewrite `makeSegment()` to read `activeEnv.scenery`.
- Change `createRoad` return to `{ update, setEnv }`. `setEnv(env)` = store `activeEnv = ENVIRONMENTS[env.id||env]`.
- Segment recycle (z-wrap) unchanged.

### [2c] `index.html` — DOM for jump/toast/picker/pause
- Spec: Feature A (HUD), C4, C5, D.
- Add `#jump-btn` next to `#nitro-btn`.
- Add `#level-toast` (fixed center-top, hidden by default).
- Add `#env-label` badge in `#hud-top-right` (under level).
- Add env picker row in `#menu` (5 buttons with `data-env` attrs; `.env-btn` class).
- Add `#pause-level` + `#pause-env` lines in `#pause` overlay.
- Update `.controls-hint`: add `SPACE / JUMP btn — jump`.
- **Class names MUST match `css/style.css` from task `1e`** (coordinate or verify after).

### [2d] `js/main.js` — THE integrator (do last, alone)
- Spec: Feature A (collision), B (spawn/loop), C3 (env cycling), D (levels), Cross-cutting (reset/quit).
- This file depends on the public API of **every** other task. Read each new/edited file's exports before writing.
- Edit checklist:
  1. Import `createHazard`, `ENVIRONMENTS`, `randomEnv`, jump constants.
  2. Add `let hazards=[]; let hazardTimer=0; let level=1, prevLevel=1;` and env state (`currentEnv`, `nextEnv`, `envTimer`, `envTween`).
  3. Capture refs to `sun`, `hemi` (already in scope — just reference them).
  4. In `updatePlaying`: handle `keys.jump` → `player.jump()`; update hazards loop with airborne-guarded AABB + clear bonus; advance env timer/tween; detect `level>prevLevel` → toast+kick+chime+flash.
  5. Guard traffic collision AABB with `&& player.state.jumpY < AIRBORNE_CLEAR_Y`.
  6. Update `#level-label` from `level` (replace old formula).
  7. `resetGame`: also reset jump state, `hazards`, `hazardTimer`, `level`/`prevLevel`, `envTimer`, apply `selectedStartEnv`.
  8. `quitToMenu`: clear hazards.
  9. `startGame`: read selected env from picker, call `road.setEnv(...)`, apply biome colors immediately.
  10. Wire `#jump-btn`, `#level-toast`, `#env-label`, env picker buttons, `#pause-level`/`#pause-env` (set text on pause).

---

## PHASE 3 — Verification (sequential)

### [3a] Smoke test
```bash
cd workspace/3dcarracer
python3 -m http.server 8000
# open http://localhost:8000 in a browser
```
- No red errors in DevTools console.
- Module imports all resolve (no 404s, no circular import crashes).

### [3b] Functional checklist (play through)
- [ ] Press Space → car jumps in an arc, lands with thud; shadow shrinks at apex.
- [ ] Jump over a traffic car mid-air → no crash; near-miss does NOT fire.
- [ ] Walk into a traffic car on the ground → crash.
- [ ] Barrier/cone/drum spawns after difficulty>0.4; jump over → +40 + whoosh; hit on ground → crash.
- [ ] Cross 1500 pts → toast slides, speed bumps, chime plays, label flashes.
- [ ] Pick each of the 5 menu options → correct start biome; `Surprise` = random.
- [ ] Wait 45–75s → biome tweens smoothly (sky/ground/asphalt/sun all lerp); scenery swaps as segments recycle; `#env-label` updates.
- [ ] Pause (P/ESC/button) → everything freezes including jump arc + env tween; pause screen shows LEVEL + ENV; resume continues cleanly.
- [ ] Touch: JUMP button and NITRO button both work; swipe steers.
- [ ] Best score still persists across reloads.
- [ ] No regressions in steering feel, nitro, near-miss whoosh.

### [3c] Regression fixes
- Loop back to the specific Phase-2 file that owns the failing behavior; do not blindly edit `main.js`.

---

## Summary: parallel vs sequential

| Can run in PARALLEL (subagents) | MUST be SEQUENTIAL |
|--------------------------------|--------------------|
| 1a hazard.js                   | 1b → 2b (road needs ENVIRONMENTS shape) |
| 1b environment.js              | 1e → 2c (html class names must match css) |
| 1c input.js                    | 2a,2b,2c → 2d (main.js integrates all) |
| 1d audio.js                    | 2d → 3a (verify after integration) |
| 1e style.css                   | 3a → 3b (smoke test before playthrough) |

**Recommended cadence:**
1. Dispatch 1a–1e together (5 subagents or 5 quick sequential edits).
2. Verify the 5 files compile/parse, then do 2a → 2b → 2c → 2d in order.
3. Run 3a, then 3b, then fix in 3c.

---

## Commit strategy (matches repo convention: `feat:` / `chore:` lowercase)
- One commit per Wave-1 file is fine, OR one `feat: add jump, hazards, levels, environments` after 2d.
- Keep commits atomic and reviewable; do not bundle unrelated refactors.
