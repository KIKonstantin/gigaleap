// Remote-player ghosts: one low-poly blocky figure per connected player,
// colored by their server-assigned hue, with a color-matched name sprite
// overhead. Positions arrive in 10 Hz server batches; each avatar renders
// from a snapshot ring buffer delayed 120 ms so motion stays smooth across
// network jitter. Ghosts are never registered as colliders — players pass
// straight through each other.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RENDER_DELAY_MS = 120; // ~1 server tick of buffer
const MAX_SNAPSHOTS = 10;
const LABEL_Y = 1.35; // above AABB center, just over the head

// One merged body geometry shared by every avatar (single draw call each).
// Origin sits at the AABB center to match player.pos semantics (feet at
// -0.9); the nose points down -Z so group.rotation.y = yaw matches the
// camera convention (cameras look down -Z at yaw 0).
function buildBodyGeometry() {
  const part = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  return mergeGeometries([
    part(0.56, 0.55, 0.4, 0, -0.62, 0), // legs
    part(0.7, 0.85, 0.5, 0, 0.08, 0), // torso
    part(0.48, 0.42, 0.48, 0, 0.72, 0), // head
    part(0.18, 0.12, 0.16, 0, 0.74, -0.32), // nose: facing cue
  ]);
}

function makeLabelSprite(name, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 30px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#dfe8f0'; // sky color halo so names read against anything
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = `hsl(${hue}, 70%, 42%)`;
  ctx.fillText(name, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.y = LABEL_Y;
  return sprite;
}

export function createRemotePlayers(scene) {
  const bodyGeometry = buildBodyGeometry();
  const ghosts = new Map(); // id -> { group, material, sprite, snaps: [{t,x,y,z,yaw}] }

  function add(id, hue, name, s = null) {
    if (ghosts.has(id)) return;
    const color = new THREE.Color().setHSL(hue / 360, 0.7, 0.55);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0,
      emissive: color,
      emissiveIntensity: 0.25, // keeps distant ghosts legible through the fog
    });
    const body = new THREE.Mesh(bodyGeometry, material);
    body.castShadow = true;
    const sprite = makeLabelSprite(name, hue);
    const group = new THREE.Group();
    group.add(body, sprite);
    group.visible = false; // hidden until the first snapshot places it
    scene.add(group);
    const ghost = { group, material, sprite, snaps: [] };
    ghosts.set(id, ghost);
    if (s) pushSnap(ghost, s, performance.now());
  }

  function remove(id) {
    const ghost = ghosts.get(id);
    if (!ghost) return;
    ghosts.delete(id);
    scene.remove(ghost.group);
    ghost.material.dispose();
    ghost.sprite.material.map.dispose();
    ghost.sprite.material.dispose();
  }

  function clear() {
    for (const id of [...ghosts.keys()]) remove(id);
  }

  function pushSnap(ghost, s, t) {
    ghost.snaps.push({ t, x: s[0], y: s[1], z: s[2], yaw: s[3] });
    if (ghost.snaps.length > MAX_SNAPSHOTS) ghost.snaps.shift();
  }

  // s: { id: [x,y,z,yaw,g,w] } from a server states batch
  function applyStates(s, recvT, selfId) {
    for (const id in s) {
      if (id === selfId) continue;
      const ghost = ghosts.get(id);
      if (ghost) pushSnap(ghost, s[id], recvT);
    }
  }

  function update() {
    const renderT = performance.now() - RENDER_DELAY_MS;
    for (const ghost of ghosts.values()) {
      const snaps = ghost.snaps;
      if (snaps.length === 0) continue;
      ghost.group.visible = true;

      let a = snaps[0], b = snaps[snaps.length - 1];
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].t <= renderT) {
          a = snaps[i - 1];
          b = snaps[i];
          break;
        }
      }
      // past the newest snapshot (packet gap / paused tab): freeze in place —
      // no extrapolation, a still ghost is correct for a paused player
      let f = b.t > a.t ? (renderT - a.t) / (b.t - a.t) : 1;
      f = Math.max(0, Math.min(1, f));

      ghost.group.position.set(
        a.x + (b.x - a.x) * f,
        a.y + (b.y - a.y) * f,
        a.z + (b.z - a.z) * f
      );
      // shortest-arc yaw lerp so a 350° -> 10° turn doesn't spin the long way
      let dyaw = b.yaw - a.yaw;
      dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
      ghost.group.rotation.y = a.yaw + dyaw * f;
    }
  }

  return {
    add,
    remove,
    clear,
    applyStates,
    update,
    has: (id) => ghosts.has(id),
    count: () => ghosts.size,
    debugPos: (id) => {
      const ghost = ghosts.get(id);
      return ghost ? ghost.group.position.toArray() : null;
    },
  };
}
