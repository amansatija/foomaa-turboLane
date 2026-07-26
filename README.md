# Turbo Lane — 3D Car Racer

A lightweight, endless 3D traffic-dodger that runs entirely in your browser.
No game engines, no npm, no build step — Three.js is vendored locally so it
even works offline.

## Run it

Any static file server works. The simplest (Python 3 ships with macOS):

```bash
cd 3dcarracer
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> Note: opening `index.html` directly via double-click won't work because
> browsers block ES modules on `file://` — you need the tiny local server above.

## Production deploy (this server)

No npm build and no process manager. Nginx serves this folder as static files.

```bash
cd /var/www/html/foomaa-turboLane
./scripts/deploy.sh releases/v1.1.0-bgEnvNJump   # or omit branch to stay on current
```

What that does:

1. `git fetch` + `git pull` (optionally checkout the release branch)
2. Stamps every JS import + `index.html` assets with `?v=<gitsha>` so browsers
   cannot reuse an old module graph
3. Writes `version.json` (not committed). Open tabs poll it every ~30s and
   auto-reload when the SHA changes

After the **first** visit that has the update checker, later deploys refresh
themselves. Brand-new visitors always get the stamped URLs from HTML.

## How to play

| Action        | Keys                          | Touch                    |
| ------------- | ----------------------------- | ------------------------ |
| Steer         | ← / → or A / D                | swipe left / right       |
| Speed up      | ↑ or W                        | (auto; nitro for boost)  |
| Brake         | ↓ or S                        | swipe down               |
| Jump          | Space / JUMP btn              | swipe up / JUMP btn      |
| Start / retry | Enter (or click the button)   | tap                      |

- Your speed rises automatically — dodge the slower traffic.
- **+25 points** for every near-miss.
- Score = distance travelled + near-miss bonuses. Best score is saved locally.
- Crash into another car and it's game over.

## Project layout

```
index.html          page, HUD, menus
css/style.css       HUD + menu styling
lib/three.module.js Three.js r160 (vendored, offline-ready)
js/main.js          game loop, spawning, collisions, scoring, states
js/road.js          endless scrolling road + scenery (trees, light poles)
js/car.js           low-poly player car + traffic car factory
js/input.js         keyboard + touch input
js/audio.js         synthesized engine / crash / whoosh sounds (Web Audio)
```

## Tuning

All the gameplay knobs (speeds, spawn rates, lane count) are constants at the
top of `js/main.js` and `js/road.js` — tweak and refresh.
