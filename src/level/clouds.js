// Cloud volumes — pure JS (node-testable). Gameplay clouds are static
// ellipsoids sitting in the middle of chosen hops; while airborne inside one
// the controller clamps air control and drags horizontal velocity, so the
// Ctrl air-dash is the only way across (see controller.js CLOUD_* tuning).
export function initClouds(defs) {
  return defs.map((def) => ({
    def,
    cx: def.pos[0],
    cy: def.pos[1],
    cz: def.pos[2],
    irx2: 1 / (def.r[0] * def.r[0]),
    iry2: 1 / (def.r[1] * def.r[1]),
    irz2: 1 / (def.r[2] * def.r[2]),
  }));
}

export function pointInCloud(clouds, pos) {
  for (const c of clouds) {
    const dx = pos.x - c.cx, dy = pos.y - c.cy, dz = pos.z - c.cz;
    if (dx * dx * c.irx2 + dy * dy * c.iry2 + dz * dz * c.irz2 <= 1) return true;
  }
  return false;
}
