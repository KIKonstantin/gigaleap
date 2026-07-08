// Unstable platforms — pure JS state machine (node-testable), with optional
// mesh animation for the browser. Stand on one for a total of FALL_DELAY
// seconds and it lets go; step off and the timer drains back down, so quick
// crossings and brief landings are safe — camping is not.
//
// Lifecycle: solid (timer accumulates while stood on, drains while not)
//         -> falling (collider removed instantly, mesh drops away)
const FALL_DELAY = 2.0;
const DRAIN_RATE = 1.0; // timer seconds recovered per second off the platform
const KILL_Y = -1e6;
const FALL_ACCEL = 120; // mesh falls faster than the player so it pulls away

export function initUnstable(colliders) {
  const unstables = [];
  for (const c of colliders) {
    if (!c.def.unstable) continue;
    c.unstableState = 'solid';
    c.standTimer = 0;
    c.fallVel = 0;
    c.fallY = 0;
    c.baseMinY = c.min.y;
    c.baseMaxY = c.max.y;
    unstables.push(c);
  }
  return unstables;
}

// runs in the fixed physics step, after the player has moved
export function stepUnstable(unstables, dt, groundPlatform) {
  for (const c of unstables) {
    if (c.unstableState === 'solid') {
      if (groundPlatform === c) {
        c.standTimer += dt;
        if (c.standTimer >= FALL_DELAY) {
          c.unstableState = 'falling';
          c.min.y = KILL_Y - 1; // collider gone — anyone on it is airborne now
          c.max.y = KILL_Y;
        }
      } else if (c.standTimer > 0) {
        c.standTimer = Math.max(0, c.standTimer - DRAIN_RATE * dt);
      }
    } else {
      c.fallVel += FALL_ACCEL * dt;
      c.fallY -= c.fallVel * dt; // visual only, the collider is already dead
    }
  }
}

// bring them all back (respawn / restart)
export function restoreUnstable(unstables) {
  for (const c of unstables) {
    c.unstableState = 'solid';
    c.standTimer = 0;
    c.fallVel = 0;
    c.fallY = 0;
    c.min.y = c.baseMinY;
    c.max.y = c.baseMaxY;
    if (c.mesh) {
      c.mesh.position.set(c.def.pos[0], c.def.pos[1], c.def.pos[2]);
      c.mesh.rotation.set(0, 0, 0);
      c.mesh.visible = true;
    }
    c.material.emissiveIntensity = c.baseEmissive;
  }
}

// render-rate: wobble harder as the timer climbs, drop while falling
export function syncUnstableMeshes(unstables, time) {
  for (const c of unstables) {
    if (!c.mesh) continue;
    if (c.unstableState === 'solid') {
      const t = c.standTimer / FALL_DELAY;
      if (t > 0.001) {
        c.mesh.rotation.x = Math.sin(time * 31) * 0.05 * t;
        c.mesh.rotation.z = Math.cos(time * 27) * 0.05 * t;
        c.mesh.position.y = c.def.pos[1] - 0.6 * t; // sagging under you
        c.material.emissiveIntensity = c.baseEmissive + t * 0.7;
      } else if (c.mesh.rotation.x !== 0) {
        c.mesh.rotation.set(0, 0, 0);
        c.mesh.position.y = c.def.pos[1];
        c.material.emissiveIntensity = c.baseEmissive;
      }
    } else {
      c.mesh.position.y = c.def.pos[1] + c.fallY;
      c.mesh.rotation.x += 0.01; // tumbles as it goes
      c.mesh.rotation.z += 0.013;
      if (c.fallY < -400) c.mesh.visible = false;
    }
  }
}
