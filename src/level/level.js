// Builds meshes and collider AABBs from the level data.
// Each platform gets its own material so landing pulses can drive
// emissiveIntensity per-platform (see fx/platformPulse.js).
// Moving platforms' AABBs advance in the physics step (movers.js);
// their meshes are interpolated here at render rate.
import * as THREE from 'three';
import { PLATFORMS } from './levelData.js';
import { initMovers } from './movers.js';
import { initCrumble } from './crumble.js';
import { initUnstable } from './unstable.js';

export function buildLevel(scene) {
  const colliders = [];

  for (const def of PLATFORMS) {
    const [w, h, d] = def.size;
    const [x, y, z] = def.pos;

    // movers glow faintly so they read as "alive"; crumbling bridge segments
    // glow warm so the danger lane is legible through the fog; dash targets
    // glow periwinkle so the "you need the dash" cue carries across the gap;
    // unstable platforms glow DANGER RED as their stand-timer climbs
    const baseEmissive = def.goal ? 1.4 : def.checkpoint ? 0.55
      : def.move ? 0.18 : def.crumble ? 0.14 : def.dash ? 0.3
      : def.bounce ? 0.2 : def.unstable ? 0.1 : 0;
    const material = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.85,
      metalness: 0,
      emissive: def.unstable ? 0xff5533 : def.color,
      emissiveIntensity: baseEmissive,
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    colliders.push({
      min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
      max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
      def,
      mesh,
      material,
      baseEmissive,
    });

    if (def.goal) addGoalBeacon(scene, x, y + h / 2, z);
  }

  const movers = initMovers(colliders);
  const crumblers = initCrumble(colliders);
  const unstables = initUnstable(colliders);
  return { colliders, movers, crumblers, unstables };
}

// meshes follow the physics AABBs, interpolated for high-refresh displays
export function syncMoverMeshes(movers, alpha) {
  for (const m of movers) {
    m.mesh.position.set(
      m.def.pos[0] + m.movePrev.x + (m.moveOffset.x - m.movePrev.x) * alpha,
      m.def.pos[1] + m.movePrev.y + (m.moveOffset.y - m.movePrev.y) * alpha,
      m.def.pos[2] + m.movePrev.z + (m.moveOffset.z - m.movePrev.z) * alpha
    );
  }
}

// A soft vertical light beam above the goal so it reads through the fog.
function addGoalBeacon(scene, x, topY, z) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 5.5, 400, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  beam.position.set(x, topY + 200, z);
  scene.add(beam);
}
