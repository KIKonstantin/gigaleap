// Crumbling bridge segments — pure JS state machine (node-testable), with
// optional mesh animation for the browser.
//
// Lifecycle: intact -> armed (touched: shakes for ARM_DELAY) -> falling
// (collider removed instantly, mesh drops away). At sprint speed you spend
// ~0.27 s per segment and outrun the collapse; at walk speed (~1.6 s per
// segment) the floor drops out from under you.
const ARM_DELAY = 0.55;
const KILL_Y = -1e6;
const FALL_ACCEL = 120; // mesh falls faster than the player so it pulls away

export function initCrumble(colliders) {
  const crumblers = [];
  for (const c of colliders) {
    if (!c.def.crumble) continue;
    c.crumbleState = 'intact';
    c.armTimer = 0;
    c.fallVel = 0;
    c.fallY = 0;
    c.baseMinY = c.min.y;
    c.baseMaxY = c.max.y;
    crumblers.push(c);
  }
  return crumblers;
}

// runs in the fixed physics step, after the player has moved
export function stepCrumble(crumblers, dt, groundPlatform) {
  for (const c of crumblers) {
    if (c.crumbleState === 'intact') {
      if (groundPlatform === c) {
        c.crumbleState = 'armed';
        c.armTimer = ARM_DELAY;
      }
    } else if (c.crumbleState === 'armed') {
      c.armTimer -= dt;
      if (c.armTimer <= 0) {
        c.crumbleState = 'falling';
        c.min.y = KILL_Y - 1; // collider gone — anyone on it is airborne now
        c.max.y = KILL_Y;
      }
    } else {
      c.fallVel += FALL_ACCEL * dt;
      c.fallY -= c.fallVel * dt; // visual only, the collider is already dead
    }
  }
}

// bring the whole bridge back (respawn / restart)
export function restoreCrumble(crumblers) {
  for (const c of crumblers) {
    c.crumbleState = 'intact';
    c.armTimer = 0;
    c.fallVel = 0;
    c.fallY = 0;
    c.min.y = c.baseMinY;
    c.max.y = c.baseMaxY;
    if (c.mesh) {
      c.mesh.position.set(c.def.pos[0], c.def.pos[1], c.def.pos[2]);
      c.mesh.visible = true;
    }
    c.material.emissiveIntensity = c.baseEmissive;
  }
}

// render-rate: shake while armed, drop while falling
export function syncCrumbleMeshes(crumblers, time) {
  for (const c of crumblers) {
    if (!c.mesh) continue;
    if (c.crumbleState === 'armed') {
      c.mesh.position.x = c.def.pos[0] + Math.sin(time * 55) * 0.09;
      c.mesh.position.z = c.def.pos[2] + Math.cos(time * 47) * 0.09;
      c.material.emissiveIntensity = 0.3 + 0.2 * Math.sin(time * 40);
    } else if (c.crumbleState === 'falling') {
      c.mesh.position.y = c.def.pos[1] + c.fallY;
      if (c.fallY < -400) c.mesh.visible = false;
    }
  }
}
