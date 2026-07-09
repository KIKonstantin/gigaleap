// One InstancedMesh for all level platforms — previously 108 meshes with 108
// unique MeshStandardMaterials (one per platform so landing pulses could
// drive emissiveIntensity), which cost ~108 draw calls twice over per frame
// (color pass + shadow pass). Per-instance matrix carries position/size,
// instanceColor the base color, and a custom aEmissive attribute the
// per-platform emissive radiance.
//
// The existing mutation API is preserved via plain "view records": c.mesh
// becomes { position, rotation, scale, visible } and c.material becomes
// { emissiveIntensity }, so movers sync / crumble.js / unstable.js /
// bouncePads.js / platformPulse.js keep working unchanged — including their
// `if (!c.mesh)` guards for headless node runs. sync() flushes the records
// into the instance buffers once per frame, after all writers have run.
import * as THREE from 'three';

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0); // hides an instance in color AND shadow passes

function makeMaterial(lambert) {
  const material = lambert
    ? new THREE.MeshLambertMaterial({ color: 0xffffff }) // instanceColor multiplies in
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });

  // Per-instance emissive: three premultiplies emissiveIntensity into the
  // `emissive` uniform CPU-side, so the attribute carries full radiance and
  // simply replaces that uniform. The anchor line is identical in the
  // lambert and standard shader sources (r185) — guard it loudly anyway.
  material.onBeforeCompile = (shader) => {
    const vsAnchor = '#include <begin_vertex>';
    const fsAnchor = 'vec3 totalEmissiveRadiance = emissive;';
    if (!shader.vertexShader.includes(vsAnchor) || !shader.fragmentShader.includes(fsAnchor)) {
      console.error('platformMeshes: emissive injection anchors missing — a three.js upgrade changed the shader chunks');
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute vec3 aEmissive;\nvarying vec3 vEmissive;\n#include <common>')
      .replace(vsAnchor, vsAnchor + '\n\tvEmissive = aEmissive;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'varying vec3 vEmissive;\n#include <common>')
      .replace(fsAnchor, 'vec3 totalEmissiveRadiance = vEmissive;');
  };
  material.customProgramCacheKey = () => `platform-instanced-emissive-${lambert ? 'lambert' : 'standard'}`;
  return material;
}

export function createPlatformInstances(scene, colliders, { lambert = false } = {}) {
  const n = colliders.length;
  const geometry = new THREE.BoxGeometry(1, 1, 1); // instance scale carries def.size
  const aEmissive = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  aEmissive.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aEmissive', aEmissive);

  const mesh = new THREE.InstancedMesh(geometry, makeMaterial(lambert), n);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // instances span the whole tower — effectively always in view, and 108
  // boxes are ~1.3k tris, so skip culling instead of maintaining fat bounds
  mesh.frustumCulled = false;

  // linear-space per-instance colors (THREE.Color converts the hex)
  const emissiveBase = new Float32Array(n * 3);
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const c = colliders[i];
    const [x, y, z] = c.def.pos;
    color.set(c.def.color);
    mesh.setColorAt(i, color);
    color.set(c.def.unstable ? 0xff5533 : c.def.color);
    emissiveBase[i * 3] = color.r;
    emissiveBase[i * 3 + 1] = color.g;
    emissiveBase[i * 3 + 2] = color.b;

    // view records — the compatibility layer every existing mutator writes to
    c.mesh = {
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      visible: true,
    };
    c.material = { emissiveIntensity: c.baseEmissive };
  }
  scene.add(mesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();

  // flush records -> instance buffers; must run AFTER all record writers
  // (movers -> crumble -> pulse -> bounce -> unstable) each frame
  function sync() {
    const em = aEmissive.array;
    for (let i = 0; i < n; i++) {
      const c = colliders[i];
      const rec = c.mesh;
      if (!rec.visible) {
        mesh.setMatrixAt(i, ZERO_SCALE);
      } else {
        const [w, h, d] = c.def.size;
        _q.setFromEuler(rec.rotation);
        _s.set(w * rec.scale.x, h * rec.scale.y, d * rec.scale.z);
        _m.compose(rec.position, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      const e = c.material.emissiveIntensity;
      em[i * 3] = emissiveBase[i * 3] * e;
      em[i * 3 + 1] = emissiveBase[i * 3 + 1] * e;
      em[i * 3 + 2] = emissiveBase[i * 3 + 2] * e;
    }
    mesh.instanceMatrix.needsUpdate = true;
    aEmissive.needsUpdate = true;
  }

  return { sync, mesh };
}
