// Builds collider AABBs from the level data; the visual side is one
// InstancedMesh (see platformMeshes.js), which attaches plain view records
// as c.mesh / c.material so the pulse/crumble/unstable/bounce writers keep
// their per-platform mutation API (fx/platformPulse.js drives per-instance
// emissive through it). Moving platforms' AABBs advance in the physics step
// (movers.js); their records are interpolated here at render rate.
import * as THREE from 'three';
import { PLATFORMS } from './levelData.js';
import { createPlatformInstances } from './platformMeshes.js';
import { initMovers } from './movers.js';
import { initCrumble } from './crumble.js';
import { initUnstable } from './unstable.js';

export function buildLevel(scene, opts = {}) {
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

    // collider order is load-bearing: platforms[1] aims the spawn camera,
    // main.js indexes into it for hints, the headless bot replays it
    colliders.push({
      min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
      max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
      def,
      baseEmissive,
    });

    if (def.goal) addGoalBeacon(scene, x, y + h / 2, z);
  }

  const platformView = createPlatformInstances(scene, colliders, opts);
  const movers = initMovers(colliders);
  const crumblers = initCrumble(colliders);
  const unstables = initUnstable(colliders);
  return { colliders, movers, crumblers, unstables, platformView };
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
