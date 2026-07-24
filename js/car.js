// car.js — low-poly box-built cars: the player car and a traffic-car factory.
import * as THREE from '../lib/three.module.js';
import { laneX, LANE_COUNT } from './road.js';

export const CAR_WIDTH = 1.6;
export const CAR_LENGTH = 3.4;

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

  // headlights (front = -z) / taillights
  const headGeo = new THREE.BoxGeometry(0.3, 0.12, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfffde7 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
  for (const x of [-0.5, 0.5]) {
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.set(x, 0.62, -CAR_LENGTH / 2 - 0.01);
    car.add(h);
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

  return { group: car, wheels };
}

// ---------- player ----------
export function createPlayer(scene) {
  const { group, wheels } = buildCar(0x2196f3, { isPlayer: true });
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
  };

  function steer(dir) { // dir: -1 left, +1 right
    state.targetLane = Math.min(LANE_COUNT - 1, Math.max(0, state.targetLane + dir));
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

    // spin wheels proportional to speed set by main loop
    for (const w of wheels) w.rotation.x -= (state.wheelSpeed || 0) * dt;
  }

  return { group, state, steer, update };
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
