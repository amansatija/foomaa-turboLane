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

## How to play

| Action        | Keys                          | Touch                    |
| ------------- | ----------------------------- | ------------------------ |
| Steer         | ← / → or A / D                | swipe left / right       |
| Speed up      | ↑ or W                        | hold top of screen       |
| Brake         | ↓ or S                        | hold bottom of screen    |
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
