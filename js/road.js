// road.js — endless scrolling road, lane markings, and roadside scenery.
// The world moves TOWARD the camera (+z) and recycles, faking forward motion.
import * as THREE from '../lib/three.module.js';

export const LANE_COUNT = 5;
export const LANE_WIDTH = 2.4;
export const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;      // 12
export const laneX = (i) => (i - (LANE_COUNT - 1) / 2) * LANE_WIDTH; // i: 0..4

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 8;                                 // covers ~320 units ahead

// ---------- helpers to build one segment ----------
function makeAsphalt() {
  const geo = new THREE.PlaneGeometry(ROAD_WIDTH + 2, SEGMENT_LENGTH);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function makeGrass() {
  const geo = new THREE.PlaneGeometry(120, SEGMENT_LENGTH);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
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
  // Red/white rumble strips at both road edges
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

// ---------- scenery (trees + light poles) ----------
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

// One recycled slice of world: road + markings + scenery
function makeSegment() {
  const seg = new THREE.Group();
  seg.add(makeGrass(), makeAsphalt(), makeLaneDashes(), makeShoulderStripes());

  // scenery on both sides
  for (const side of [-1, 1]) {
    const pole = makeLightPole(side);
    pole.position.set(side * (ROAD_WIDTH / 2 + 2.2), 0, -SEGMENT_LENGTH / 4);
    seg.add(pole);

    for (let i = 0; i < 3; i++) {
      const tree = makeTree();
      const x = side * (ROAD_WIDTH / 2 + 5 + Math.random() * 14);
      const z = -SEGMENT_LENGTH / 2 + Math.random() * SEGMENT_LENGTH;
      const s = 0.8 + Math.random() * 0.9;
      tree.scale.setScalar(s);
      tree.position.set(x, 0, z);
      seg.add(tree);
    }
  }
  return seg;
}

// ---------- public API ----------
export function createRoad(scene) {
  const segments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const seg = makeSegment();
    // first segment centered near camera, rest stretch into -z
    seg.position.z = SEGMENT_LENGTH / 2 - i * SEGMENT_LENGTH;
    scene.add(seg);
    segments.push(seg);
  }

  // Scroll the world toward the camera; recycle segments that pass behind.
  function update(speed, dt) {
    for (const seg of segments) {
      seg.position.z += speed * dt;
      if (seg.position.z - SEGMENT_LENGTH / 2 > SEGMENT_LENGTH) {
        seg.position.z -= SEGMENT_COUNT * SEGMENT_LENGTH;
      }
    }
  }

  return { update };
}
