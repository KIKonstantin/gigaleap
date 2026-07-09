// Storm rain — one LineSegments of ~1800 streaks in a box around the camera.
// Lines, not points: at 60-90 m/s a drop crosses 1-1.5 m per frame, so a
// 2 m slanted streak IS its own motion blur. Positions live in world space
// and wrap toroidally around the camera, so streaks never stick to the view.
// Driven by the sea's storm factor: invisible (and CPU-free) until level ~7.
import * as THREE from 'three';

const COUNT = 1800;
const BOX = { x: 260, y: 200, z: 260 };

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createRain(scene, { count = COUNT } = {}) {
  const rand = lcg(777);
  const positions = new Float32Array(count * 6);
  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      x: rand() * BOX.x,
      y: rand() * BOX.y,
      z: rand() * BOX.z,
      vy: -(60 + rand() * 30),
      vx: (rand() - 0.5) * 14,
      vz: (rand() - 0.5) * 14,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x9fb4c4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const mod = (v, m) => ((v % m) + m) % m;

  let active = count;

  function update(dt, cameraPos, storm) {
    if (storm <= 0.25) {
      mesh.visible = false;
      return; // no storm, no CPU
    }
    mesh.visible = true;
    material.opacity = 0.35 * Math.min(1, (storm - 0.25) / 0.5);

    const ox = cameraPos.x - BOX.x / 2;
    const oy = cameraPos.y - BOX.y / 2;
    const oz = cameraPos.z - BOX.z / 2;
    for (let i = 0; i < active; i++) {
      const d = drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      // world-space toroidal wrap into the camera box
      const wx = ox + mod(d.x - ox, BOX.x);
      const wy = oy + mod(d.y - oy, BOX.y);
      const wz = oz + mod(d.z - oz, BOX.z);
      const o = i * 6;
      const s = 0.028;
      positions[o] = wx;
      positions[o + 1] = wy;
      positions[o + 2] = wz;
      positions[o + 3] = wx + d.vx * s;
      positions[o + 4] = wy + d.vy * s;
      positions[o + 5] = wz + d.vz * s;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  // governor hook: clamp the live streak count without rebuilding buffers
  function setCount(n) {
    active = Math.max(0, Math.min(count, n));
    geometry.setDrawRange(0, active * 2);
  }

  return { update, visible: () => mesh.visible, setCount };
}
