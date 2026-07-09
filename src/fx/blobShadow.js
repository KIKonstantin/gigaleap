// Low-tier stand-in for the directional shadow map: a soft dark disc under
// the player, snapped to the highest platform top below the feet. In a
// precision platformer the shadow is landing-aim feedback, not decoration —
// this keeps that signal for the cost of one tiny transparent quad.
// Reads the same collider AABBs the physics uses (movers/crumblers included,
// so the disc rides movers and vanishes with collapsed segments).
import * as THREE from 'three';

const MAX_DROP = 60; // beyond this the landing point is your problem

export function createBlobShadow(scene, colliders, player) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(20, 26, 34, 0.5)');
  grad.addColorStop(1, 'rgba(20, 26, 34, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1; // after the opaque platform top it floats above
  mesh.visible = false;
  scene.add(mesh);

  function update() {
    const px = player.pos.x;
    const pz = player.pos.z;
    const feet = player.feetY();
    let top = -Infinity;
    for (const c of colliders) {
      if (px < c.min.x || px > c.max.x || pz < c.min.z || pz > c.max.z) continue;
      if (c.max.y <= feet + 0.01 && c.max.y > top) top = c.max.y;
    }
    const drop = feet - top;
    if (top === -Infinity || drop > MAX_DROP) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set(px, top + 0.03, pz); // nudged off the surface, no z-fight
    mesh.scale.setScalar(1 + drop * 0.05); // spreads as you rise
    mesh.material.opacity = Math.max(0.15, 1 - drop / MAX_DROP);
  }

  return { update };
}
