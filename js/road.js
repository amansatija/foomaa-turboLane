// road.js — endless scrolling road, lane markings, and roadside scenery.
// The world moves TOWARD the camera (+z) and recycles, faking forward motion.
// Scenery set is driven by activeEnv (from environment.js via setEnv).
import * as THREE from '../lib/three.module.js';
import { ENVIRONMENTS, resolveEnv } from './environment.js';

export const LANE_COUNT = 5;
export const LANE_WIDTH = 2.4;
export const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;      // 12
export const laneX = (i) => (i - (LANE_COUNT - 1) / 2) * LANE_WIDTH; // i: 0..4

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 8;                                 // covers ~320 units ahead

// Shared materials — color-tweened by main.js when environments change
export const groundMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
export const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.95 });

// Active biome scenery flags (default = highway)
let activeEnv = ENVIRONMENTS.highway;

// ---------- helpers to build one segment ----------
function makeAsphalt() {
  const geo = new THREE.PlaneGeometry(ROAD_WIDTH + 2, SEGMENT_LENGTH);
  const mesh = new THREE.Mesh(geo, asphaltMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function makeGrass() {
  const geo = new THREE.PlaneGeometry(120, SEGMENT_LENGTH);
  const mesh = new THREE.Mesh(geo, groundMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.05;
  mesh.receiveShadow = true;
  return mesh;
}

function makeLaneDashes() {
  // Dashed white lines between lanes (4 dividers)
  const group = new THREE.Group();
  const dashGeo = new THREE.PlaneGeometry(0.14, 2.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let d = 1; d < LANE_COUNT; d++) {
    const x = laneX(d) - LANE_WIDTH / 2;
    for (let z = -SEGMENT_LENGTH / 2; z < SEGMENT_LENGTH / 2; z += 6) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, z + 1);
      group.add(dash);
    }
  }
  return group;
}

function makeShoulderStripes() {
  // Red/white rumble strips at both road edges (all biomes)
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.5, 2);
  const red = new THREE.MeshBasicMaterial({ color: 0xd32f2f });
  const white = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  for (const side of [-1, 1]) {
    const x = side * (ROAD_WIDTH / 2 + 0.55);
    for (let i = 0, z = -SEGMENT_LENGTH / 2; z < SEGMENT_LENGTH / 2; z += 2, i++) {
      const s = new THREE.Mesh(geo, i % 2 ? red : white);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.02, z + 1);
      group.add(s);
    }
  }
  return group;
}

// ---------- scenery factories ----------
function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1 })
  );
  trunk.position.y = 0.6;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 1 })
  );
  crown.position.y = 2.2;
  crown.castShadow = true;
  g.add(trunk, crown);
  return g;
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 3.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 1 })
  );
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  g.add(trunk);
  // fronds as thin cones fanned out
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.6, 5), frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 0.5, 3.0, Math.sin(a) * 0.5);
    frond.rotation.z = Math.cos(a) * 0.9;
    frond.rotation.x = Math.sin(a) * 0.9;
    frond.castShadow = true;
    g.add(frond);
  }
  return g;
}

function makeCactus() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 8), mat);
  body.position.y = 1.1;
  body.castShadow = true;
  // arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 6), mat);
  arm.position.set(0.35, 1.4, 0);
  arm.rotation.z = -Math.PI / 2.4;
  arm.castShadow = true;
  const armTip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 6), mat);
  armTip.position.set(0.7, 1.7, 0);
  armTip.castShadow = true;
  g.add(body, arm, armTip);
  return g;
}

function makeRock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 1 });
  const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.4, 0), mat);
  a.position.y = 0.35;
  a.rotation.set(Math.random(), Math.random(), Math.random());
  a.scale.set(1, 0.6 + Math.random() * 0.4, 1);
  a.castShadow = true;
  a.receiveShadow = true;
  g.add(a);
  if (Math.random() > 0.5) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), mat);
    b.position.set(0.4, 0.2, 0.2);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function makeBuilding() {
  const g = new THREE.Group();
  const h = 4 + Math.random() * 10;
  const w = 1.6 + Math.random() * 2.2;
  const d = 1.6 + Math.random() * 2.0;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: [0x37474f, 0x455a64, 0x263238, 0x1a237e, 0x4a148c][(Math.random() * 5) | 0],
    roughness: 0.7,
    metalness: 0.15,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // neon window strips
  const windowMat = new THREE.MeshBasicMaterial({
    color: [0xffeb3b, 0x40c4ff, 0xe040fb, 0x69f0ae][(Math.random() * 4) | 0],
  });
  const rows = Math.max(2, (h / 1.4) | 0);
  for (let r = 0; r < rows; r++) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, 0.35, 0.06), windowMat);
      win.position.set(side * w * 0.28, 1.2 + r * 1.3, d / 2 + 0.02);
      g.add(win);
    }
  }
  return g;
}

function makeLightPole(side) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 6), mat);
  pole.position.y = 2.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), mat);
  arm.position.set(-side * 0.7, 5, 0);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xfff9c4 })
  );
  lamp.position.set(-side * 1.35, 4.95, 0);
  g.add(pole, arm, lamp);
  return g;
}

// Pick a prop factory based on activeEnv.scenery flags
function pickScenery() {
  const s = activeEnv.scenery || {};
  const pool = [];
  if (s.trees) pool.push(makeTree);
  if (s.palms) pool.push(makePalm);
  if (s.cacti) pool.push(makeCactus);
  if (s.rocks) pool.push(makeRock);
  if (s.buildings) pool.push(makeBuilding);
  if (!pool.length) pool.push(makeTree);
  return pool[(Math.random() * pool.length) | 0];
}

// One recycled slice of world: road + markings + scenery
function makeSegment() {
  const seg = new THREE.Group();
  seg.add(makeGrass(), makeAsphalt(), makeLaneDashes(), makeShoulderStripes());

  const s = activeEnv.scenery || {};
  for (const side of [-1, 1]) {
    if (s.poles) {
      const pole = makeLightPole(side);
      pole.position.set(side * (ROAD_WIDTH / 2 + 2.2), 0, -SEGMENT_LENGTH / 4);
      seg.add(pole);
    }

    // buildings sit closer to the road; natural props farther out
    const count = s.buildings ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const prop = pickScenery()();
      const near = s.buildings ? 3.5 + Math.random() * 6 : 5 + Math.random() * 14;
      const x = side * (ROAD_WIDTH / 2 + near);
      const z = -SEGMENT_LENGTH / 2 + Math.random() * SEGMENT_LENGTH;
      const scale = s.buildings ? 1 : (0.8 + Math.random() * 0.9);
      prop.scale.setScalar(scale);
      prop.position.set(x, 0, z);
      seg.add(prop);
    }
  }
  return seg;
}

// ---------- public API ----------
export function createRoad(scene) {
  const segments = [];

  function rebuildAll() {
    for (const seg of segments) scene.remove(seg);
    segments.length = 0;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = makeSegment();
      seg.position.z = SEGMENT_LENGTH / 2 - i * SEGMENT_LENGTH;
      scene.add(seg);
      segments.push(seg);
    }
  }

  rebuildAll();

  // Scroll the world toward the camera; recycle segments that pass behind.
  // On recycle, rebuild with current activeEnv so scenery swaps naturally.
  function update(speed, dt) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      seg.position.z += speed * dt;
      if (seg.position.z - SEGMENT_LENGTH / 2 > SEGMENT_LENGTH) {
        const newZ = seg.position.z - SEGMENT_COUNT * SEGMENT_LENGTH;
        scene.remove(seg);
        // dispose not critical for low-poly loop; GC handles ephemeral geos
        const fresh = makeSegment();
        fresh.position.z = newZ;
        scene.add(fresh);
        segments[i] = fresh;
      }
    }
  }

  function setEnv(env) {
    activeEnv = resolveEnv(env);
  }

  return { update, setEnv, rebuildAll, groundMat, asphaltMat };
}
