// Wind gust zones — pure JS (node-testable). Axis-aligned boxes spanning a
// hop's flight corridor; while airborne inside one, the controller adds a
// steady sideways acceleration. Weak enough to counter-steer (AIR_ACCEL 60
// vs strength 8) but a clean miss if you don't notice: an attention tax,
// telegraphed by the streak lines (world/windStreaks.js) and the gust audio.
export function initWind(defs) {
  return defs.map((def) => ({
    def,
    min: { x: def.min[0], y: def.min[1], z: def.min[2] },
    max: { x: def.max[0], y: def.max[1], z: def.max[2] },
  }));
}

export function pointInWind(zones, pos) {
  for (const z of zones) {
    if (
      pos.x >= z.min.x && pos.x <= z.max.x &&
      pos.y >= z.min.y && pos.y <= z.max.y &&
      pos.z >= z.min.z && pos.z <= z.max.z
    ) return z;
  }
  return null;
}
