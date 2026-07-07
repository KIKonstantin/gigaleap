// Pure AABB collision helpers. Everything in the game is an axis-aligned box,
// so per-axis overlap resolution is exact — no degenerate cases.
// Tunneling is impossible by construction: max displacement per step is
// 28 m/s / 60 Hz = 0.467 m and every platform is >= 0.6 m thick.
const EPS = 0.001;

export function overlaps(pos, half, box) {
  return (
    pos.x - half.x < box.max.x && pos.x + half.x > box.min.x &&
    pos.y - half.y < box.max.y && pos.y + half.y > box.min.y &&
    pos.z - half.z < box.max.z && pos.z + half.z > box.min.z
  );
}

// Call AFTER moving `pos` along one axis. Snaps out of any overlapping
// platform along that axis only, based on the movement direction.
// Returns which face was hit and the last platform touched.
export function resolveAxis(pos, half, velAxis, platforms, axis) {
  let hitNeg = false; // hit while moving toward -axis (for Y: landed)
  let hitPos = false; // hit while moving toward +axis (for Y: head bonk)
  let hitRef = null;

  for (const p of platforms) {
    if (!overlaps(pos, half, p)) continue;
    if (velAxis > 0) {
      pos[axis] = p.min[axis] - half[axis] - EPS;
      hitPos = true;
      hitRef = p;
    } else if (velAxis < 0) {
      pos[axis] = p.max[axis] + half[axis] + EPS;
      hitNeg = true;
      hitRef = p;
    }
  }
  return { hitNeg, hitPos, hitRef };
}
