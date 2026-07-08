// Wind gust telegraphs: streaming line segments inside each gust zone,
// drifting along the wind direction. One LineSegments per zone, positions
// rewritten at render rate — 4 zones x 40 lines is trivial.
import * as THREE from 'three';
import { WIND_ZONES } from '../level/levelData.js';

const LINES_PER_ZONE = 40;
const LINE_LENGTH = 7;
const DRIFT_SPEED = 28;

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createWindStreaks(scene) {
  const material = new THREE.LineBasicMaterial({
    color: 0xcfd8dc,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const zones = WIND_ZONES.map((def, zi) => {
    const rand = lcg(4200 + zi * 97);
    const size = [
      def.max[0] - def.min[0],
      def.max[1] - def.min[1],
      def.max[2] - def.min[2],
    ];
    // distance travelled along the wind before wrapping
    const along = Math.abs(def.dir[0]) * size[0] + Math.abs(def.dir[2]) * size[2];
    const seeds = [];
    const positions = new Float32Array(LINES_PER_ZONE * 6);
    for (let i = 0; i < LINES_PER_ZONE; i++) {
      seeds.push({
        x: def.min[0] + rand() * size[0],
        y: def.min[1] + rand() * size[1],
        z: def.min[2] + rand() * size[2],
        offset: rand() * along,
        speed: DRIFT_SPEED * (0.7 + rand() * 0.6),
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { def, size, along, seeds, positions, attr: geometry.attributes.position };
  });

  let time = 0;
  const mod = (v, m) => ((v % m) + m) % m;

  function update(dt) {
    time += dt;
    for (const zone of zones) {
      const { def, size, seeds, positions } = zone;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        // drift along the wind, toroidal wrap inside the box
        const travel = s.offset + time * s.speed;
        const x = def.min[0] + mod(s.x - def.min[0] + def.dir[0] * travel, size[0]);
        const z = def.min[2] + mod(s.z - def.min[2] + def.dir[2] * travel, size[2]);
        const o = i * 6;
        positions[o] = x;
        positions[o + 1] = s.y;
        positions[o + 2] = z;
        positions[o + 3] = x + def.dir[0] * LINE_LENGTH;
        positions[o + 4] = s.y;
        positions[o + 5] = z + def.dir[2] * LINE_LENGTH;
      }
      zone.attr.needsUpdate = true;
    }
  }

  return { update };
}
