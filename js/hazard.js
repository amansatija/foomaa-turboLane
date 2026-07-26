// hazard.js — low road obstacles that force a jump (or careful steer).
// Barriers, cone clusters, and oil drums. All ~0.5 tall so a jump clears them.
import * as THREE from '../lib/three.module.js';

export const HAZARD_WIDTH = 1.4;
export const HAZARD_LENGTH = 1.2;
export const HAZARD_HEIGHT = 0.5;

// ----- factories -----
function makeBarrier() {
  const g = new THREE.Group();
  // striped red/white jersey barrier
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(HAZARD_WIDTH, 0.55, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
  );
  body.position.y = 0.28;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // red stripes painted as thin boxes on the face
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.56, 0.48), stripeMat);
    s.position.set(-0.42 + i * 0.42, 0.28, 0);
    s.castShadow = true;
    g.add(s);
  }
  // feet
  const footMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.9 });
  for (const x of [-0.5, 0.5]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.7), footMat);
    foot.position.set(x, 0.04, 0);
    g.add(foot);
  }
  return g;
}

function makeCones() {
  const g = new THREE.Group();
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6d00, roughness: 0.55 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.9 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  // three cones in a small triangle
  const positions = [[-0.4, -0.25], [0.4, -0.25], [0, 0.35]];
  for (const [x, z] of positions) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), baseMat);
    base.position.set(x, 0.03, z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), coneMat);
    cone.position.set(x, 0.35, z);
    cone.castShadow = true;
    // white reflective band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 8), stripeMat);
    band.position.set(x, 0.28, z);
    g.add(base, cone, band);
  }
  return g;
}

function makeDrum() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.45, metalness: 0.35 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.7, 12), bodyMat);
  body.position.y = 0.35;
  body.castShadow = true;
  body.receiveShadow = true;
  // yellow hazard bands
  for (const y of [0.2, 0.5]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.08, 12), rimMat);
    band.position.y = y;
    g.add(band);
  }
  g.add(body);
  // slightly tipped for variety
  g.rotation.z = (Math.random() - 0.5) * 0.15;
  return g;
}

const FACTORIES = [makeBarrier, makeCones, makeDrum];

/**
 * Create a jumpable hazard and add it to the scene.
 * @returns {{ group, lane, width, length, speed, cleared }}
 */
export function createHazard(scene) {
  const factory = FACTORIES[(Math.random() * FACTORIES.length) | 0];
  const group = factory();
  scene.add(group);
  return {
    group,
    lane: 0,
    width: HAZARD_WIDTH,
    length: HAZARD_LENGTH,
    speed: 0,          // static obstacle (world-scroll only)
    cleared: false,    // score-bonus flag once passed
  };
}
