// Big voxel letters floating in the air ("LEVEL {N}", tutorial hints).
// Glyphs are classic 5x7 pixel-font bitmaps built from boxes and merged into
// ONE geometry per text — no font assets, one draw call, real shadows, and
// blocky letters that match the box-world aesthetic. Multiple texts can be
// alive at once (a level banner plus a tutorial hint).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const POP_TIME = 0.45;

function buildTextGeometry(text, cell, depth) {
  const boxes = [];
  let cursor = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) { cursor += 3 * cell; continue; } // space
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== '1') continue;
        const box = new THREE.BoxGeometry(cell * 0.96, cell * 0.96, depth);
        box.translate(cursor + col * cell, (6 - row) * cell, 0);
        boxes.push(box);
      }
    }
    cursor += 6 * cell; // 5 cells + 1 spacing
  }
  const merged = mergeGeometries(boxes);
  for (const b of boxes) b.dispose();
  merged.center();
  return merged;
}

const easeOutBack = (t) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function createLevelText(scene) {
  const active = [];

  function dispose(entry) {
    scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    active.splice(active.indexOf(entry), 1);
  }

  // opts: { cell, color, hold } — big slate banner by default
  function show(text, position, opts = {}) {
    const { cell = 1.0, color = 0x3d4a5c, hold = 2.6 } = opts;
    // replace an existing text with the same content class (same string)
    const dupe = active.find((e) => e.text === text);
    if (dupe) dispose(dupe);

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45, // keeps its hue even with the sun behind it
      roughness: 0.6,
      metalness: 0,
      transparent: true,
    });
    const mesh = new THREE.Mesh(buildTextGeometry(text, cell, cell * 1.3), material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.scale.setScalar(0.001);
    scene.add(mesh);
    active.push({ mesh, text, age: 0, baseY: position.y, hold, fade: 0.8 });
  }

  function update(dt, cameraPos) {
    for (let i = active.length - 1; i >= 0; i--) {
      const entry = active[i];
      entry.age += dt;
      const { mesh, age, baseY, hold, fade } = entry;

      if (age >= hold + fade) { dispose(entry); continue; }

      const pop = Math.min(age / POP_TIME, 1);
      mesh.scale.setScalar(Math.max(easeOutBack(pop), 0.001));
      mesh.position.y = baseY + age * 1.1 + Math.sin(age * 2.1) * 0.25;
      mesh.lookAt(cameraPos.x, cameraPos.y, cameraPos.z);
      mesh.material.opacity = age < hold ? 1 : 1 - (age - hold) / fade;
    }
  }

  return { show, update };
}
