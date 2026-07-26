// car.js — low-poly box-built cars: the player car and a traffic-car factory.
import * as THREE from '../lib/three.module.js';
import { laneX, LANE_COUNT } from './road.js';

export const CAR_WIDTH = 1.6;
export const CAR_LENGTH = 3.4;

// jump tuning (exported for main.js collision guard)
export const JUMP_DURATION = 0.7;
export const JUMP_HEIGHT = 2.6;
export const AIRBORNE_CLEAR_Y = 0.7;

const LAND_SQUASH_DUR = 0.12; // seconds for land squash recover

const TRAFFIC_COLORS = [0xe53935, 0x8e24aa, 0x3949ab, 0x00acc1, 0xfdd835, 0xf4511e, 0xc0ca33, 0x6d4c41];

// Shared geometry/materials (cheap)
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.15, metalness: 0.6 });

function buildCar(bodyColor, { isPlayer = false } = {}) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.3 });

  // main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.55, CAR_LENGTH), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;

  // cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH * 0.85, 0.5, CAR_LENGTH * 0.45), glassMat);
  cabin.position.set(0, 1.05, 0.15);
  cabin.castShadow = true;

  car.add(body, cabin);

  // wheels
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1], [-0.85, -1.1], [0.85, -1.1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    car.add(w);
    wheels.push(w);
  }

  // headlights (front = -z) / taillights — cosmetic boxes; player SpotLights toggle via setHeadlights
  const headGeo = new THREE.BoxGeometry(0.3, 0.12, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfffde7 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
  const headLamps = [];
  for (const x of [-0.5, 0.5]) {
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.set(x, 0.62, -CAR_LENGTH / 2 - 0.01);
    car.add(h);
    headLamps.push(h);
    const t = new THREE.Mesh(headGeo, tailMat);
    t.position.set(x, 0.62, CAR_LENGTH / 2 + 0.01);
    car.add(t);
  }

  // player gets a little spoiler for style
  if (isPlayer) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH * 0.9, 0.08, 0.35), bodyMat);
    spoiler.position.set(0, 1.0, CAR_LENGTH / 2 - 0.2);
    car.add(spoiler);
  }

  return { group: car, wheels, headMat, headLamps };
}

// Player headlights: one SpotLight (no shadow) + additive beam cones for readability
const HEADLIGHT_INTENSITY = 28;
const HEADLIGHT_DISTANCE = 60;
const HEADLIGHT_ANGLE = 0.52;
const HEADLIGHT_PENUMBRA = 0.45;
const HEADLIGHT_ON_COLOR = 0xfff8e1;
const HEADLIGHT_OFF_COLOR = 0x4a4a40;

function makeHeadlights(carGroup) {
  const root = new THREE.Group();
  root.name = 'headlights';

  // Functional beam — lights asphalt / hazards / traffic ahead (MeshStandardMaterial)
  const light = new THREE.SpotLight(
    0xfff2cc,
    0, // start off; setHeadlights enables
    HEADLIGHT_DISTANCE,
    HEADLIGHT_ANGLE,
    HEADLIGHT_PENUMBRA,
    1.8
  );
  light.position.set(0, 0.7, -CAR_LENGTH / 2 + 0.1);
  light.castShadow = false;
  // Target ahead on the road so the cone points forward (−z), slightly down
  const target = new THREE.Object3D();
  target.position.set(0, 0.15, -45);
  root.add(light);
  root.add(target);
  light.target = target;

  // Soft additive cones (visual only) — same cheap style as nitro flames
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2cc,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beams = [];
  for (const x of [-0.35, 0.35]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 18, 12, 1, true), beamMat);
    // Cone default points +Y; -X rot aims apex toward −z (road ahead)
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(x, 0.55, -CAR_LENGTH / 2 - 8.5);
    beam.visible = false;
    root.add(beam);
    beams.push(beam);
  }

  carGroup.add(root);
  return { root, light, target, beams, beamMat };
}

// ---------- nitro exhaust flames (player only) ----------
function makeFlames() {
  const group = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x40c4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
  });
  const flames = [];
  for (const x of [-0.5, 0.5]) {
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.2, 8), flameMat);
    outer.rotation.x = -Math.PI / 2;          // point backward (+z)
    outer.position.set(x, 0.55, CAR_LENGTH / 2 + 0.5);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8, 8), coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.set(x, 0.55, CAR_LENGTH / 2 + 0.35);
    group.add(outer, core);
    flames.push({ outer, core });
  }
  group.visible = false;
  return { group, flames };
}

// ground shadow blob (parented to scene so it stays on the road while car rises)
function makeShadow() {
  const geo = new THREE.CircleGeometry(1.1, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

// ---------- player ----------
export function createPlayer(scene) {
  const { group, wheels, headMat } = buildCar(0x2196f3, { isPlayer: true });
  const flameFx = makeFlames();
  group.add(flameFx.group);
  const headlightFx = makeHeadlights(group);
  // Day default: dim cosmetic lamps until City (night) enables them
  headMat.color.setHex(HEADLIGHT_OFF_COLOR);
  const shadow = makeShadow();
  scene.add(shadow);

  const START_LANE = Math.floor(LANE_COUNT / 2);
  group.position.set(laneX(START_LANE), 0, 0);
  scene.add(group);

  const state = {
    group,
    lane: START_LANE,
    targetLane: START_LANE,
    x: laneX(START_LANE),
    width: CAR_WIDTH,
    length: CAR_LENGTH,
    nitro: false,
    headlights: false,
    jumping: false,
    jumpT: 0,
    jumpY: 0,
    grounded: true,
    landFlash: 0,       // countdown for land squash (seconds remaining)
    justLanded: false,  // one-frame flag for main/audio to play land sfx
  };

  function steer(dir) { // dir: -1 left, +1 right
    state.targetLane = Math.min(LANE_COUNT - 1, Math.max(0, state.targetLane + dir));
  }

  function setNitro(on) {
    state.nitro = !!on;
    flameFx.group.visible = state.nitro;
  }

  /** Auto-toggled by main.js when env.isNight (City). intensity 0..1 fades during env tween. */
  function setHeadlights(on, intensity = 1) {
    const enabled = !!on;
    const level = enabled ? Math.min(1, Math.max(0, intensity)) : 0;
    state.headlights = enabled && level > 0.02;
    headlightFx.light.intensity = HEADLIGHT_INTENSITY * level;
    headMat.color.setHex(state.headlights ? HEADLIGHT_ON_COLOR : HEADLIGHT_OFF_COLOR);
    for (const beam of headlightFx.beams) {
      beam.visible = state.headlights;
      headlightFx.beamMat.opacity = 0.08 + 0.14 * level;
    }
  }

  function jump() {
    if (!state.grounded) return false;
    state.jumping = true;
    state.jumpT = 0;
    state.grounded = false;
    state.justLanded = false;
    return true;
  }

  function resetJump() {
    state.jumping = false;
    state.jumpT = 0;
    state.jumpY = 0;
    state.grounded = true;
    state.landFlash = 0;
    state.justLanded = false;
    group.position.y = 0;
    group.rotation.x = 0;
    group.scale.set(1, 1, 1);
    shadow.scale.set(1, 1, 1);
    shadow.material.opacity = 0.35;
  }

  function update(dt) {
    // smooth lane-change lerp + a tilt while changing lanes
    const targetX = laneX(state.targetLane);
    const dx = targetX - state.x;
    state.x += dx * Math.min(1, dt * 8);
    group.position.x = state.x;
    group.rotation.z = -dx * 0.12;           // body roll
    group.rotation.y = -dx * 0.08;           // slight yaw into the turn
    if (Math.abs(dx) < 0.05) state.lane = state.targetLane;

    // ---- jump arc ----
    state.justLanded = false;
    if (state.jumping) {
      state.jumpT += dt / JUMP_DURATION;
      const t = Math.min(1, Math.max(0, state.jumpT));
      // parabola peaking at t=0.5: 4*t*(1-t)
      state.jumpY = JUMP_HEIGHT * 4 * t * (1 - t);
      group.position.y = state.jumpY;
      // nose up at apex
      group.rotation.x = -Math.sin(t * Math.PI) * 0.12;

      if (t >= 1) {
        state.jumping = false;
        state.grounded = true;
        state.jumpY = 0;
        state.jumpT = 0;
        group.position.y = 0;
        group.rotation.x = 0;
        state.landFlash = LAND_SQUASH_DUR;
        state.justLanded = true;
      }
    }

    // land squash: scale.y 0.85 → 1 over LAND_SQUASH_DUR
    if (state.landFlash > 0) {
      state.landFlash = Math.max(0, state.landFlash - dt);
      const u = 1 - state.landFlash / LAND_SQUASH_DUR; // 0 → 1
      const sy = 0.85 + 0.15 * u;
      group.scale.set(1, sy, 1);
    } else {
      group.scale.set(1, 1, 1);
    }

    // ground shadow follows x/z, shrinks/fades with height
    shadow.position.x = state.x;
    shadow.position.z = group.position.z;
    const height01 = Math.min(1, state.jumpY / JUMP_HEIGHT);
    const sScale = 1 - height01 * 0.45;
    shadow.scale.set(sScale, sScale, sScale);
    shadow.material.opacity = 0.35 * (1 - height01 * 0.55);

    // spin wheels proportional to speed set by main loop
    for (const w of wheels) w.rotation.x -= (state.wheelSpeed || 0) * dt;

    // animate nitro flames (flicker + length pulse)
    if (state.nitro) {
      for (const f of flameFx.flames) {
        const flick = 0.7 + Math.random() * 0.6;
        f.outer.scale.set(0.8 + Math.random() * 0.3, flick, 0.8 + Math.random() * 0.3);
        f.core.scale.set(1, flick * 0.9, 1);
        f.outer.material.opacity = 0.6 + Math.random() * 0.3;
      }
    }
  }

  return { group, state, steer, update, setNitro, setHeadlights, jump, resetJump };
}

// ---------- traffic ----------
export function createTrafficCar(scene) {
  const color = TRAFFIC_COLORS[(Math.random() * TRAFFIC_COLORS.length) | 0];
  const { group, wheels } = buildCar(color);
  group.rotation.y = Math.PI; // faces +z (same direction as travel looks correct from behind)
  scene.add(group);
  return {
    group,
    wheels,
    lane: 0,
    speed: 0,               // its own forward speed (world units/s)
    width: CAR_WIDTH,
    length: CAR_LENGTH,
    passed: false,          // for near-miss detection
  };
}
