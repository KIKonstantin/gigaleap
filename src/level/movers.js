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
    setMoverOffset(m, { x: dir[0] * s, y: dir[1] * s, z: dir[2] * s });
  }
}

export function setMoverOffset(m, offset) {
  m.movePrev = m.moveOffset;
  m.moveOffset = offset;
  m.delta = {
    x: offset.x - m.movePrev.x,
    y: offset.y - m.movePrev.y,
    z: offset.z - m.movePrev.z,
  };
  for (const axis of ['x', 'y', 'z']) {
    m.min[axis] = m.baseMin[axis] + offset[axis];
    m.max[axis] = m.baseMax[axis] + offset[axis];
  }
}
