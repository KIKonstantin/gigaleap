// Bounce pad squash-and-stretch: the mesh compresses on launch and springs
// back with an overshoot. Visual only — the collider never moves.
const DURATION = 0.5;

// piecewise scale curve over normalized t: 1 -> 0.5 (impact) -> 1.15 -> 1
function squashCurve(t) {
  if (t < 0.16) return 1 - (t / 0.16) * 0.5;
  if (t < 0.5) return 0.5 + ((t - 0.16) / 0.34) * 0.65;
  return 1.15 - ((t - 0.5) / 0.5) * 0.15;
}

import { on } from '../core/events.js';

export function createBouncePads(colliders) {
  const pads = colliders.filter((c) => c.def.bounce);
  const active = new Map(); // pad -> age

  on('bounce', ({ platform }) => {
    if (platform.def.bounce) active.set(platform, 0);
  });

  function update(dt) {
    for (const [pad, age] of active) {
      const t = (age + dt) / DURATION;
      if (t >= 1) {
        pad.mesh.scale.y = 1;
        pad.mesh.position.y = pad.def.pos[1];
        active.delete(pad);
        continue;
      }
      const s = squashCurve(t);
      const h = pad.def.size[1];
      pad.mesh.scale.y = s;
      // bottom-anchored: the pad's underside stays put while the top squashes
      pad.mesh.position.y = (pad.def.pos[1] - h / 2) + (s * h) / 2;
      active.set(pad, age + dt);
    }
  }

  return { update, count: () => pads.length };
}
