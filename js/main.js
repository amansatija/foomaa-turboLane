// main.js — game bootstrap, state machine (menu → playing → gameover),
// traffic spawning, collisions, scoring, and the render loop.
import * as THREE from '../lib/three.module.js';
import { createRoad, laneX, LANE_COUNT } from './road.js';
import { createPlayer, createTrafficCar } from './car.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

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
const hudEl = $('hud'), menuEl = $('menu'), gameoverEl = $('gameover');
const scoreEl = $('score'), bestEl = $('best'), speedEl = $('speed');
const finalScoreEl = $('final-score'), finalBestEl = $('final-best'), newBestEl = $('new-best');
const nitroFillEl = $('nitro-fill'), nitroLabelEl = $('nitro-label');
const nitroOverlayEl = $('nitro-overlay'), levelLabelEl = $('level-label');

// ---------- game state ----------
let mode = 'menu';            // 'menu' | 'playing' | 'gameover'
let speed = 0;
let score = 0;
let best = Number(localStorage.getItem('turbolane_best') || 0);
let traffic = [];
let spawnTimer = 0;
let crashShake = 0;
let difficulty = 0;           // rises with score, drives traffic density
const nitro = { amount: 1, active: false };

bestEl.textContent = best;

function resetGame() {
  for (const t of traffic) scene.remove(t.group);
  traffic = [];
  speed = SPEED_START;
  score = 0;
  spawnTimer = 0.8;
  crashShake = 0;
  difficulty = 0;
  nitro.amount = 1;
  nitro.active = false;
  player.setNitro(false);
  player.state.targetLane = Math.floor(LANE_COUNT / 2);
  player.state.lane = player.state.targetLane;
  player.state.x = laneX(player.state.lane);
  player.group.position.x = player.state.x;
  player.group.rotation.set(0, 0, 0);
}

function startGame() {
  audio.init();
  resetGame();
  mode = 'playing';
  audio.startEngine();
  hudEl.classList.remove('hidden');
  menuEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
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
}

$('start-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', startGame);

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

// ---------- per-frame update while playing ----------
function updatePlaying(dt) {
  const keys = input.poll();

  if (keys.steerLeft) player.steer(-1);
  if (keys.steerRight) player.steer(1);

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

  // world scroll + player animation
  road.update(speed, dt);
  player.state.wheelSpeed = speed * 1.5;
  player.update(dt);

  // spawn traffic (count scales with difficulty)
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = spawnInterval() * (0.7 + Math.random() * 0.6);
    const count = spawnCount();
    for (let i = 0; i < count; i++) spawnTraffic();
  }

  // move traffic, check collisions & near-misses
  const p = player.state;
  for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i];
    t.group.position.z += (speed - t.speed) * dt;   // relative motion
    for (const w of t.wheels) w.rotation.x -= t.speed * 1.5 * dt;

    const z = t.group.position.z;

    // AABB overlap (x and z)
    if (Math.abs(z) < (t.length + p.length) / 2 &&
        Math.abs(t.group.position.x - p.x) < (t.width + p.width) / 2 - 0.1) {
      endGame();
      return;
    }

    // near-miss bonus: passed by us in an adjacent lane, close call
    if (!t.passed && z > p.length) {
      t.passed = true;
      if (Math.abs(t.group.position.x - p.x) < t.width * 1.6) {
        score += 25;
        audio.whoosh();
      }
    }

    if (z > DESPAWN_Z) {
      scene.remove(t.group);
      traffic.splice(i, 1);
    }
  }

  // scoring: distance (+ small nitro risk bonus)
  score += speed * dt;
  if (nitro.active) score += speed * dt * 0.5;

  // audio + HUD
  audio.setEngineSpeed((speed - SPEED_START) / (NITRO_MAX - SPEED_START));
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.round(speed * KMH);
  levelLabelEl.textContent = 'LV ' + (1 + Math.floor(difficulty * 2));

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
  camera.lookAt(p.x * 0.5, 1, -8);
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
  } else {
    if (input.poll().confirm) startGame();
    updateIdle(dt, elapsed);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

frame();
