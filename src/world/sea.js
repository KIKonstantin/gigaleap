// Low-poly sea at the bottom of the world. CPU-displaced sine waves on a
// coarse plane; flatShading derives face normals in the fragment shader, so
// only positions update per frame. The mesh follows the player (like the old
// void-cover floor) but waves are sampled in WORLD space, so the surface
// doesn't slide along with you.
//
// Weather follows progress: chill through level 6, then the storm rolls in —
// taller, faster, choppier waves and a darker water color. You mostly meet
// the sea while falling, which is precisely when it should look angry.
import * as THREE from 'three';

const SIZE = 3200;
const SEGS = 80;
const BASE_Y = -70;
const CALM_COLOR = new THREE.Color(0x9fd8dc);
const ROUGH_COLOR = new THREE.Color(0x46748e);
const STORM_FROM_LEVEL = 6; // calm through here, ramps to full storm at 9

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createSea(scene, { getLevel }) {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geometry.rotateX(-Math.PI / 2);

  // break the grid once: static XZ jitter makes the facets read as water,
  // not as a displaced checkerboard
  const pos = geometry.attributes.position;
  const rand = lcg(31337);
  const cell = SIZE / SEGS;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (rand() - 0.5) * cell * 0.45);
    pos.setZ(i, pos.getZ(i) + (rand() - 0.5) * cell * 0.45);
  }

  const material = new THREE.MeshStandardMaterial({
    color: CALM_COLOR.clone(),
    flatShading: true,
    roughness: 0.75,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = BASE_Y;
  scene.add(mesh);

  let storm = 0; // 0 = chill, 1 = level-9 rage

  function update(time, dt, playerPos) {
    mesh.position.x = playerPos.x;
    mesh.position.z = playerPos.z;

    // the weather changes like weather — slowly
    const target = Math.min(Math.max((getLevel() - STORM_FROM_LEVEL) / 3, 0), 1);
    storm += (target - storm) * (1 - Math.exp(-0.6 * dt));

    const swell = 3.5 + 11 * storm; // long rolling waves
    const chop = 1.6 + 6.5 * storm; // short angry ones
    const speed = 0.5 + 1.3 * storm;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + mesh.position.x;
      const wz = pos.getZ(i) + mesh.position.z;
      const y =
        swell * Math.sin(wx * 0.012 + time * speed)
          * Math.cos(wz * 0.010 + time * speed * 0.8) +
        chop * Math.sin(wx * 0.031 - time * speed * 1.7)
          * Math.cos(wz * 0.027 + time * speed * 1.3);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    material.color.copy(CALM_COLOR).lerp(ROUGH_COLOR, storm);
  }

  return { update, storm: () => storm };
}
