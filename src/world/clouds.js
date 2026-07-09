// Low-poly clouds: 5-6 squashed icosahedron blobs merged into one geometry
// per cloud, one shared material. Gameplay clouds (drag volumes) bob gently
// in place — their colliders stay static, the bob is small enough not to
// lie. Deco clouds are scenery and drift a little more.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLOUDS, CLOUD_DECO } from '../level/levelData.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildCloudGeometry(r, seed) {
  const rand = lcg(seed);
  const blobs = [];
  const count = 5 + Math.floor(rand() * 2);
  for (let k = 0; k < count; k++) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const sx = r[0] * (0.35 + rand() * 0.3);
    const sy = r[1] * (0.45 + rand() * 0.3);
    const sz = r[2] * (0.35 + rand() * 0.3);
    g.scale(sx, sy, sz);
    g.rotateY(rand() * Math.PI);
    g.translate(
      (rand() * 2 - 1) * (r[0] - sx) * 0.85,
      (rand() * 2 - 1) * (r[1] - sy) * 0.5,
      (rand() * 2 - 1) * (r[2] - sz) * 0.85
    );
    blobs.push(g);
  }
  const merged = mergeGeometries(blobs);
  for (const b of blobs) b.dispose();
  return merged;
}

export function createClouds(scene, { decoCount = CLOUD_DECO.length, lambert = false, mergeDeco = false } = {}) {
  // keep the undersides airy — a shadowed grey belly reads as a boulder
  const airy = { emissive: 0xf4f7f9, emissiveIntensity: 0.38 };
  const material = lambert
    ? new THREE.MeshLambertMaterial({
        color: 0xf4f7f9, flatShading: true, transparent: true, opacity: 0.88, ...airy,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xf4f7f9, flatShading: true, transparent: true, opacity: 0.88,
        roughness: 1, metalness: 0, ...airy,
      });

  const spawn = (def, seed) => {
    const mesh = new THREE.Mesh(buildCloudGeometry(def.r, seed), material);
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    scene.add(mesh);
    return { mesh, def };
  };

  const gameplay = CLOUDS.map((def, i) => spawn(def, 7001 + i * 131));

  // low tier: bake the scenery clouds into ONE static mesh (one draw call,
  // no per-frame drift); other tiers keep the individual drifting meshes
  let deco = [];
  if (mergeDeco) {
    const parts = CLOUD_DECO.slice(0, decoCount).map((def, i) => {
      const g = buildCloudGeometry(def.r, 9001 + i * 173);
      g.translate(def.pos[0], def.pos[1], def.pos[2]);
      return g;
    });
    if (parts.length) {
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      scene.add(new THREE.Mesh(merged, material));
    }
  } else {
    deco = CLOUD_DECO.slice(0, decoCount).map((def, i) => spawn(def, 9001 + i * 173));
  }

  function update(time) {
    for (let i = 0; i < gameplay.length; i++) {
      const c = gameplay[i];
      c.mesh.position.y = c.def.pos[1] + Math.sin(time * 0.25 + i * 1.7) * 1.5;
    }
    for (let i = 0; i < deco.length; i++) {
      const c = deco[i];
      c.mesh.position.x = c.def.pos[0] + Math.sin(time * 0.08 + i * 2.3) * 8;
      c.mesh.position.y = c.def.pos[1] + Math.sin(time * 0.19 + i) * 2;
    }
  }

  return { update };
}
