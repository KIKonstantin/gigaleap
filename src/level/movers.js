// Moving-platform math — pure JS (no three.js) so the physics can be
// node-tested. A mover oscillates around its base position along `dir`:
//   offset(t) = dir * amplitude * sin(2*pi*t / period + phase)
// stepMovers runs in the fixed physics step: it updates each collider's
// AABB and stores the per-step delta the controller uses to carry/push
// the player. prev/current offsets let the renderer interpolate meshes.
export function initMovers(colliders) {
  const movers = [];
  for (const c of colliders) {
    if (!c.def.move) continue;
    c.baseMin = { ...c.min };
    c.baseMax = { ...c.max };
    c.moveOffset = { x: 0, y: 0, z: 0 };
    c.movePrev = { x: 0, y: 0, z: 0 };
    c.delta = { x: 0, y: 0, z: 0 };
    movers.push(c);
  }
  return movers;
}

export function stepMovers(movers, time) {
  for (const m of movers) {
    const { dir, amplitude, period, phase } = m.def.move;
    const s = amplitude * Math.sin((time * Math.PI * 2) / period + phase);
    // recycle the retiring prev-offset object instead of allocating — this
    // runs per mover per physics step, and slow devices multiply the steps
    const next = m.movePrev;
    next.x = dir[0] * s;
    next.y = dir[1] * s;
    next.z = dir[2] * s;
    setMoverOffset(m, next);
  }
}

export function setMoverOffset(m, offset) {
  m.movePrev = m.moveOffset;
  m.moveOffset = offset;
  m.delta.x = offset.x - m.movePrev.x;
  m.delta.y = offset.y - m.movePrev.y;
  m.delta.z = offset.z - m.movePrev.z;
  m.min.x = m.baseMin.x + offset.x;
  m.min.y = m.baseMin.y + offset.y;
  m.min.z = m.baseMin.z + offset.z;
  m.max.x = m.baseMax.x + offset.x;
  m.max.y = m.baseMax.y + offset.y;
  m.max.z = m.baseMax.z + offset.z;
}
