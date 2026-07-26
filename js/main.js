// main.js — game bootstrap, state machine (menu → playing → paused → gameover),
// traffic/hazard spawning, collisions, scoring, levels, env cycling, render loop.
import * as THREE from '../lib/three.module.js';
import { createRoad, laneX, LANE_COUNT, groundMat, asphaltMat } from './road.js';
import { createPlayer, createTrafficCar, AIRBORNE_CLEAR_Y } from './car.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHazard } from './hazard.js';
import { ENVIRONMENTS, randomEnv, resolveEnv } from './environment.js';
import { startUpdateChecker } from './update-check.js';

// Auto-reload when scripts/deploy.sh publishes a new version.json
startUpdateChecker();

// ---------- tuning ----------
const SPEED_START = 18;        // world units/s  (~65 km/h shown)
const SPEED_MAX = 278;         //                (~1000 km/h shown)
const NITRO_MAX = 347;         //                (~1250 km/h shown, nitro on)
const SPEED_RAMP = 0.6;        // passive speed gain per second
const ACCEL_BOOST = 16;        // extra speed/s while holding up
const BRAKE_POWER = 30;        // speed loss/s while holding down
const SPAWN_Z = -260;          // where traffic appears (far ahead)
const DESPAWN_Z = 25;          // behind the camera -> remove
const KMH = 3.6;               // display conversion

// nitro bar tuning
const NITRO_DRAIN = 1 / 4;     // full -> empty in 4s of continuous use
const NITRO_REGEN = 1 / 15;    // empty -> full in 15s
const NITRO_MIN_USE = 0.12;    // must have this much charge to engage

// difficulty tuning (rises with distance, never stops growing)
const DIFFICULTY_PER_SCORE = 1 / 3000;   // +1.0 per 3000 points
const DIFFICULTY_CAP = 2.5;              // soft cap applied to some effects

// levels
const LEVEL_STEP = 1500;                 // points per level
const LEVEL_SPEED_KICK = 10;             // one-time speed bump on level-up
const LEVEL_DISPLAY_CAP = 20;

// hazards
const HAZARD_INTERVAL_MIN = 9;
const HAZARD_INTERVAL_MAX = 14;
const HAZARD_SCORE_BONUS = 40;
const HAZARD_MIN_DIFFICULTY = 0.4;

// environments
const ENV_CHANGE_MIN = 45;
const ENV_CHANGE_MAX = 75;
const ENV_TWEEN = 1.5;
const ENV_LS_KEY = 'turbolane_env';

// ---------- renderer / scene ----------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 240);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 4.2, 7.5);
camera.lookAt(0, 1, -8);
const FOV_BASE = 70;
const FOV_NITRO = 86;

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a5f2a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
sun.position.set(-30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 150;
scene.add(sun);
scene.add(sun.target);

// ---------- world ----------
const road = createRoad(scene);
const player = createPlayer(scene);
const input = createInput();
const audio = createAudio();

// sun shadow follows the player so shadows stay crisp
sun.target.position.set(0, 0, -20);

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud'), menuEl = $('menu'), gameoverEl = $('gameover'), pauseEl = $('pause');
const scoreEl = $('score'), bestEl = $('best'), speedEl = $('speed');
const finalScoreEl = $('final-score'), finalBestEl = $('final-best'), newBestEl = $('new-best');
const nitroFillEl = $('nitro-fill'), nitroLabelEl = $('nitro-label');
const nitroOverlayEl = $('nitro-overlay'), levelLabelEl = $('level-label');
const envLabelEl = $('env-label'), levelToastEl = $('level-toast');
const pauseLevelEl = $('pause-level'), pauseEnvEl = $('pause-env');

// ---------- game state ----------
let mode = 'menu';            // 'menu' | 'playing' | 'paused' | 'gameover'
let speed = 0;
let score = 0;
let best = Number(localStorage.getItem('turbolane_best') || 0);
let traffic = [];
let hazards = [];
let spawnTimer = 0;
let hazardTimer = 0;
let crashShake = 0;
let difficulty = 0;           // rises with score, drives traffic density
let level = 1;
let prevLevel = 1;
const nitro = { amount: 1, active: false };

// environment state
let currentEnv = ENVIRONMENTS.highway;
let nextEnv = null;
let envTimer = 0;
let envTween = -1;            // -1 = idle, 0..1 = in progress
let envFrom = null;           // snapshot of colors at tween start
let selectedStartEnv = localStorage.getItem(ENV_LS_KEY) || 'highway';

bestEl.textContent = best;

// ---------- env helpers ----------
function randomEnvTimer() {
  return ENV_CHANGE_MIN + Math.random() * (ENV_CHANGE_MAX - ENV_CHANGE_MIN);
}

function snapshotEnvColors() {
  return {
    sky: scene.background.clone(),
    fog: scene.fog.color.clone(),
    ground: groundMat.color.clone(),
    asphalt: asphaltMat.color.clone(),
    sunColor: sun.color.clone(),
    sunIntensity: sun.intensity,
    hemiSky: hemi.color.clone(),
    hemiGround: hemi.groundColor.clone(),
    hemiIntensity: hemi.intensity,
    sunPos: sun.position.clone(),
    fogNear: scene.fog.near,
    fogFar: scene.fog.far,
  };
}

function applyEnvImmediate(env) {
  env = resolveEnv(env);
  currentEnv = env;
  nextEnv = null;
  envTween = -1;
  scene.background.set(env.sky);
  scene.fog.color.set(env.fog);
  scene.fog.near = env.fogNear;
  scene.fog.far = env.fogFar;
  groundMat.color.set(env.ground);
  asphaltMat.color.set(env.asphalt);
  sun.color.set(env.sunColor);
  sun.intensity = env.sunIntensity;
  sun.position.set(env.sunPos[0], env.sunPos[1], env.sunPos[2]);
  hemi.color.set(env.hemiSky);
  hemi.groundColor.set(env.hemiGround);
  hemi.intensity = env.hemiIntensity;
  road.setEnv(env);
  updateEnvLabel(env.name);
}

function updateEnvLabel(name) {
  if (!envLabelEl) return;
  envLabelEl.textContent = name;
  envLabelEl.classList.remove('swap');
  // reflow to restart animation
  void envLabelEl.offsetWidth;
  envLabelEl.classList.add('swap');
}

function startEnvTween(target) {
  envFrom = snapshotEnvColors();
  nextEnv = resolveEnv(target);
  envTween = 0;
  road.setEnv(nextEnv); // recycled segments adopt new props immediately
}

function updateEnvTween(dt) {
  if (envTween < 0 || !nextEnv || !envFrom) return;
  envTween = Math.min(1, envTween + dt / ENV_TWEEN);
  const t = envTween;
  const to = nextEnv;
  const from = envFrom;

  scene.background.copy(from.sky).lerp(new THREE.Color(to.sky), t);
  scene.fog.color.copy(from.fog).lerp(new THREE.Color(to.fog), t);
  scene.fog.near = from.fogNear + (to.fogNear - from.fogNear) * t;
  scene.fog.far = from.fogFar + (to.fogFar - from.fogFar) * t;
  groundMat.color.copy(from.ground).lerp(new THREE.Color(to.ground), t);
  asphaltMat.color.copy(from.asphalt).lerp(new THREE.Color(to.asphalt), t);
  sun.color.copy(from.sunColor).lerp(new THREE.Color(to.sunColor), t);
  sun.intensity = from.sunIntensity + (to.sunIntensity - from.sunIntensity) * t;
  hemi.color.copy(from.hemiSky).lerp(new THREE.Color(to.hemiSky), t);
  hemi.groundColor.copy(from.hemiGround).lerp(new THREE.Color(to.hemiGround), t);
  hemi.intensity = from.hemiIntensity + (to.hemiIntensity - from.hemiIntensity) * t;
  sun.position.set(
    from.sunPos.x + (to.sunPos[0] - from.sunPos.x) * t,
    from.sunPos.y + (to.sunPos[1] - from.sunPos.y) * t,
    from.sunPos.z + (to.sunPos[2] - from.sunPos.z) * t
  );

  if (t >= 1) {
    currentEnv = nextEnv;
    nextEnv = null;
    envTween = -1;
    envFrom = null;
    updateEnvLabel(currentEnv.name);
    envTimer = randomEnvTimer();
  }
}

// ---------- menu env picker ----------
function initEnvPicker() {
  const buttons = document.querySelectorAll('.env-btn');
  // restore selection
  let found = false;
  buttons.forEach((btn) => {
    const id = btn.dataset.env;
    if (id === selectedStartEnv) {
      btn.classList.add('selected');
      found = true;
    } else {
      btn.classList.remove('selected');
    }
  });
  if (!found) {
    selectedStartEnv = 'highway';
    buttons.forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.env === 'highway');
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedStartEnv = btn.dataset.env;
      localStorage.setItem(ENV_LS_KEY, selectedStartEnv);
      buttons.forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });
}
initEnvPicker();

function resolveStartEnv() {
  if (selectedStartEnv === 'surprise') return randomEnv();
  return resolveEnv(selectedStartEnv);
}

// ---------- level toast ----------
let toastHideTimer = 0;
function showLevelToast(n) {
  if (!levelToastEl) return;
  levelToastEl.textContent = 'LEVEL ' + n;
  levelToastEl.classList.add('show');
  toastHideTimer = 1.8;
}

function updateToast(dt) {
  if (toastHideTimer <= 0) return;
  toastHideTimer -= dt;
  if (toastHideTimer <= 0) {
    toastHideTimer = 0;
    levelToastEl.classList.remove('show');
  }
}

// ---------- clear helpers ----------
function clearTraffic() {
  for (const t of traffic) scene.remove(t.group);
  traffic = [];
}

function clearHazards() {
  for (const h of hazards) scene.remove(h.group);
  hazards = [];
}

function resetGame() {
  clearTraffic();
  clearHazards();
  speed = SPEED_START;
  score = 0;
  spawnTimer = 0.8;
  hazardTimer = HAZARD_INTERVAL_MIN + Math.random() * (HAZARD_INTERVAL_MAX - HAZARD_INTERVAL_MIN);
  crashShake = 0;
  difficulty = 0;
  level = 1;
  prevLevel = 1;
  nitro.amount = 1;
  nitro.active = false;
  player.setNitro(false);
  player.resetJump();
  player.state.targetLane = Math.floor(LANE_COUNT / 2);
  player.state.lane = player.state.targetLane;
  player.state.x = laneX(player.state.lane);
  player.group.position.x = player.state.x;
  player.group.rotation.set(0, 0, 0);
  envTimer = randomEnvTimer();
  envTween = -1;
  nextEnv = null;
  envFrom = null;
  levelLabelEl.textContent = 'LV 1';
  levelLabelEl.classList.remove('flash');
  if (levelToastEl) levelToastEl.classList.remove('show');
  toastHideTimer = 0;
}

function startGame() {
  audio.init();
  // apply chosen start biome before reset so road/scenery match
  const startEnv = resolveStartEnv();
  applyEnvImmediate(startEnv);
  if (typeof road.rebuildAll === 'function') road.rebuildAll();
  resetGame();
  // re-apply after reset (reset doesn't touch env colors, but ensure label)
  applyEnvImmediate(startEnv);
  mode = 'playing';
  audio.startEngine();
  hudEl.classList.remove('hidden');
  menuEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  if (pauseEl) pauseEl.classList.add('hidden');
}

function endGame() {
  mode = 'gameover';
  audio.crash();
  crashShake = 1;
  player.setNitro(false);
  nitro.active = false;
  nitroOverlayEl.classList.add('hidden');
  nitroOverlayEl.classList.remove('active');
  camera.fov = FOV_BASE;
  camera.updateProjectionMatrix();
  const finalScore = Math.floor(score);
  const isNewBest = finalScore > best;
  if (isNewBest) {
    best = finalScore;
    localStorage.setItem('turbolane_best', best);
  }
  finalScoreEl.textContent = finalScore;
  finalBestEl.textContent = best;
  bestEl.textContent = best;
  newBestEl.classList.toggle('hidden', !isNewBest);
  hudEl.classList.add('hidden');
  gameoverEl.classList.remove('hidden');
  if (pauseEl) pauseEl.classList.add('hidden');
  if (levelToastEl) levelToastEl.classList.remove('show');
}

function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused';
  if (pauseLevelEl) pauseLevelEl.textContent = String(Math.min(level, LEVEL_DISPLAY_CAP));
  if (pauseEnvEl) pauseEnvEl.textContent = currentEnv.name;
  if (pauseEl) pauseEl.classList.remove('hidden');
}

function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  if (pauseEl) pauseEl.classList.add('hidden');
}

function quitToMenu() {
  clearTraffic();
  clearHazards();
  player.setNitro(false);
  player.resetJump();
  nitro.active = false;
  nitroOverlayEl.classList.add('hidden');
  nitroOverlayEl.classList.remove('active');
  camera.fov = FOV_BASE;
  camera.updateProjectionMatrix();
  audio.stopEngine();
  mode = 'menu';
  hudEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  if (pauseEl) pauseEl.classList.add('hidden');
  if (levelToastEl) levelToastEl.classList.remove('show');
  menuEl.classList.remove('hidden');
  applyEnvImmediate(ENVIRONMENTS.highway);
  if (typeof road.rebuildAll === 'function') road.rebuildAll();
}

$('start-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', startGame);
if ($('resume-btn')) $('resume-btn').addEventListener('click', resumeGame);
if ($('quit-btn')) $('quit-btn').addEventListener('click', quitToMenu);

// ---------- traffic spawning ----------
function spawnInterval() {
  // denser traffic as speed AND difficulty rise
  const t = (speed - SPEED_START) / (NITRO_MAX - SPEED_START);
  return Math.max(0.32, 1.5 - t * 0.6 - difficulty * 0.45);
}

function spawnTraffic() {
  const car = createTrafficCar(scene);
  car.lane = (Math.random() * LANE_COUNT) | 0;
  // traffic drives slower than player; spread widens with difficulty
  // higher difficulty => more slow "obstacle" cars that close faster
  let base = 8 + Math.random() * 12;
  const slowChance = 0.15 + Math.min(0.35, difficulty * 0.12);
  if (Math.random() < slowChance) base = 3 + Math.random() * 6;
  car.speed = base;
  car.group.position.set(laneX(car.lane), 0, SPAWN_Z - Math.random() * 30);

  // don't spawn directly on top of an existing car in the same lane
  for (const t of traffic) {
    if (t.lane === car.lane && Math.abs(t.group.position.z - car.group.position.z) < 25) {
      scene.remove(car.group);
      return false;
    }
  }
  // also avoid stacking on a hazard
  for (const h of hazards) {
    if (h.lane === car.lane && Math.abs(h.group.position.z - car.group.position.z) < 20) {
      scene.remove(car.group);
      return false;
    }
  }
  traffic.push(car);
  return true;
}

// how many cars to try spawning in one beat (rises with difficulty)
function spawnCount() {
  let n = 1;
  if (difficulty > 0.6 && Math.random() < (difficulty - 0.6) * 0.5) n++;
  if (difficulty > 1.3 && Math.random() < (difficulty - 1.3) * 0.4) n++;
  return n;
}

// ---------- hazard spawning ----------
function spawnHazard() {
  const haz = createHazard(scene);
  haz.lane = (Math.random() * LANE_COUNT) | 0;
  haz.group.position.set(laneX(haz.lane), 0, SPAWN_Z - Math.random() * 20);

  for (const t of traffic) {
    if (t.lane === haz.lane && Math.abs(t.group.position.z - haz.group.position.z) < 20) {
      scene.remove(haz.group);
      return false;
    }
  }
  for (const h of hazards) {
    if (h.lane === haz.lane && Math.abs(h.group.position.z - haz.group.position.z) < 25) {
      scene.remove(haz.group);
      return false;
    }
  }
  hazards.push(haz);
  return true;
}

// ---------- per-frame update while playing ----------
function updatePlaying(dt) {
  const keys = input.poll();

  if (keys.pause) {
    pauseGame();
    return;
  }

  if (keys.steerLeft) player.steer(-1);
  if (keys.steerRight) player.steer(1);

  // ---- jump ----
  if (keys.jump) {
    if (player.jump()) audio.jump();
  }

  // ---- nitro bar ----
  const wantNitro = keys.nitro && nitro.amount > NITRO_MIN_USE;
  nitro.active = wantNitro;
  if (nitro.active) {
    nitro.amount = Math.max(0, nitro.amount - NITRO_DRAIN * dt);
    if (nitro.amount <= 0) nitro.active = false;
  } else {
    nitro.amount = Math.min(1, nitro.amount + NITRO_REGEN * dt);
  }
  player.setNitro(nitro.active);

  // ---- speed model ----
  const effectiveMax = nitro.active ? NITRO_MAX : SPEED_MAX;
  speed += SPEED_RAMP * dt;
  if (keys.accel) speed += ACCEL_BOOST * dt;
  if (nitro.active) speed += ACCEL_BOOST * 2.0 * dt; // nitro kick
  if (keys.brake) speed -= BRAKE_POWER * dt;
  speed = Math.max(6, Math.min(effectiveMax, speed));

  // ---- difficulty ramps with distance ----
  difficulty = Math.min(DIFFICULTY_CAP, score * DIFFICULTY_PER_SCORE);

  // ---- levels ----
  level = 1 + Math.floor(score / LEVEL_STEP);
  if (level > prevLevel) {
    const kickLevels = level - prevLevel;
    speed = Math.min(effectiveMax, speed + LEVEL_SPEED_KICK * kickLevels);
    showLevelToast(Math.min(level, LEVEL_DISPLAY_CAP));
    audio.levelUp();
    levelLabelEl.classList.remove('flash');
    void levelLabelEl.offsetWidth;
    levelLabelEl.classList.add('flash');
    setTimeout(() => levelLabelEl.classList.remove('flash'), 500);
    prevLevel = level;
  }

  // world scroll + player animation
  road.update(speed, dt);
  player.state.wheelSpeed = speed * 1.5;
  player.update(dt);
  if (player.state.justLanded) audio.land();

  // ---- environment timer / tween (only advances while playing → freezes on pause) ----
  if (envTween >= 0) {
    updateEnvTween(dt);
  } else {
    envTimer -= dt;
    if (envTimer <= 0) {
      startEnvTween(randomEnv(currentEnv));
    }
  }

  // spawn traffic (count scales with difficulty)
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = spawnInterval() * (0.7 + Math.random() * 0.6);
    const count = spawnCount();
    for (let i = 0; i < count; i++) spawnTraffic();
  }

  // spawn hazards once difficulty is past the gentle early phase
  if (difficulty > HAZARD_MIN_DIFFICULTY) {
    hazardTimer -= dt;
    if (hazardTimer <= 0) {
      hazardTimer = HAZARD_INTERVAL_MIN + Math.random() * (HAZARD_INTERVAL_MAX - HAZARD_INTERVAL_MIN);
      spawnHazard();
    }
  }

  // move traffic, check collisions & near-misses
  const p = player.state;
  const airborne = p.jumpY >= AIRBORNE_CLEAR_Y;

  for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i];
    t.group.position.z += (speed - t.speed) * dt;   // relative motion
    for (const w of t.wheels) w.rotation.x -= t.speed * 1.5 * dt;

    const z = t.group.position.z;

    // AABB overlap (x and z) — skipped while airborne above clear height
    if (!airborne &&
        Math.abs(z) < (t.length + p.length) / 2 &&
        Math.abs(t.group.position.x - p.x) < (t.width + p.width) / 2 - 0.1) {
      endGame();
      return;
    }

    // near-miss bonus: passed by us in an adjacent lane, close call
    // only while grounded (airborne jump-over is a different skill)
    if (!t.passed && z > p.length) {
      t.passed = true;
      if (!airborne && Math.abs(t.group.position.x - p.x) < t.width * 1.6) {
        score += 25;
        audio.whoosh();
      }
    }

    if (z > DESPAWN_Z) {
      scene.remove(t.group);
      traffic.splice(i, 1);
    }
  }

  // move hazards (static obstacles: full speed scroll), collide / clear
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.group.position.z += speed * dt;
    const z = h.group.position.z;

    if (!airborne &&
        Math.abs(z) < (h.length + p.length) / 2 &&
        Math.abs(h.group.position.x - p.x) < (h.width + p.width) / 2 - 0.1) {
      endGame();
      return;
    }

    // cleared: jumped over / passed for score bonus
    if (!h.cleared && z > p.length) {
      h.cleared = true;
      // only bonus if player was roughly over this lane (or jumped through)
      if (Math.abs(h.group.position.x - p.x) < h.width * 1.8) {
        score += HAZARD_SCORE_BONUS;
        audio.whoosh();
      }
    }

    if (z > DESPAWN_Z) {
      scene.remove(h.group);
      hazards.splice(i, 1);
    }
  }

  // scoring: distance (+ small nitro risk bonus)
  score += speed * dt;
  if (nitro.active) score += speed * dt * 0.5;

  // toast timer
  updateToast(dt);

  // audio + HUD
  audio.setEngineSpeed((speed - SPEED_START) / (NITRO_MAX - SPEED_START));
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.round(speed * KMH);
  levelLabelEl.textContent = 'LV ' + Math.min(level, LEVEL_DISPLAY_CAP);

  // nitro HUD + overlay
  nitroFillEl.style.transform = `scaleX(${nitro.amount})`;
  nitroFillEl.classList.toggle('active', nitro.active);
  nitroFillEl.classList.toggle('empty', nitro.amount <= 0.001);
  nitroLabelEl.classList.toggle('active', nitro.active);
  nitroLabelEl.classList.toggle('ready', !nitro.active && nitro.amount >= 0.999);
  nitroLabelEl.classList.toggle('empty', nitro.amount < NITRO_MIN_USE && !nitro.active);
  nitroOverlayEl.classList.toggle('active', nitro.active);
  nitroOverlayEl.classList.toggle('hidden', !nitro.active);

  // camera: fov kicks in with nitro + subtle sway with lane position
  const targetFov = nitro.active ? FOV_NITRO : FOV_BASE;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
  camera.position.x += (p.x * 0.35 - camera.position.x) * Math.min(1, dt * 4);
  // slight camera lift while jumping for readability
  const camY = 4.2 + Math.min(1.2, p.jumpY * 0.25);
  camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 6);
  camera.lookAt(p.x * 0.5, 1 + p.jumpY * 0.15, -8);
}

// ---------- crash shake + idle camera for menu ----------
function updateIdle(dt, elapsed) {
  road.update(4, dt); // gentle drift so the menu feels alive
  camera.position.x = Math.sin(elapsed * 0.3) * 2.5;
  camera.lookAt(0, 1.2, -10);
  if (crashShake > 0) {
    crashShake = Math.max(0, crashShake - dt * 1.5);
    camera.position.x += (Math.random() - 0.5) * crashShake * 0.8;
    camera.position.y = 4.2 + (Math.random() - 0.5) * crashShake * 0.8;
  } else {
    camera.position.y = 4.2;
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch spikes
  elapsed += dt;

  if (mode === 'playing') {
    updatePlaying(dt); // polls input itself
  } else if (mode === 'paused') {
    // freeze everything: no road scroll, no jump advance, no env tween
    const keys = input.poll();
    if (keys.pause || keys.confirm) resumeGame();
  } else {
    // menu / gameover
    const keys = input.poll();
    if (keys.confirm) startGame();
    updateIdle(dt, elapsed);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ensure env label starts correct
updateEnvLabel(currentEnv.name);

frame();
