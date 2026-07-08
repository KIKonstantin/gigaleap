// Kinematic first-person character controller. No physics engine — hand-tuned
// game feel: coyote time, jump buffering, variable jump height, air control.
// Pure JS (no three.js import) so it can be unit-tested in node.
import { resolveAxis, overlaps } from './collision.js';
import { pointInCloud } from '../level/clouds.js';
import { pointInWind } from '../level/wind.js';
import { emit } from '../core/events.js';

// HEAVY hulk tuning: asymmetric gravity — you launch hard against 35 m/s²
// but fall under 70 m/s², so the whole ~110 m arc lasts only ~4.3 s and the
// descent slams. Terminal velocity 130 m/s; sprint 35 m/s covers the ~100 m
// gaps; huge air accel lets you steer onto far platforms mid-flight.
// Mutable so the debug panel can live-tune; read per-step inside step().
export const TUNING = {
  GRAVITY_UP: 35, // while rising
  GRAVITY_DOWN: 70, // while falling — heaviness lives here
  TERMINAL_VELOCITY: 130, // platforms are >= 2.5 thick (no-tunnel contract)
  JUMP_SPEED: 88, // apex ~110.6 m
  WALK_SPEED: 6,
  SPRINT_SPEED: 35, // hold Shift
  AIR_SPEED: 35, // full aerial control regardless of Shift
  GROUND_ACCEL: 80,
  AIR_ACCEL: 60,
  DASH_SPEED: 70, // Ctrl mid-air burst along the facing direction
  DASH_DECAY: 0.8, // /s — surplus above AIR_SPEED bleeds off smoothly
  FRICTION: 160, // scaled to sprint 35 — release keys, stop in ~3.8 m
  CLOUD_DRAG: 2.0, // /s — horizontal velocity bleed while inside a cloud
  CLOUD_AIR_ACCEL: 10, // air control barely works in there — dash through
  BOUNCE_VY: 119, // bounce pad launch (~1.35x jump, apex ~202 m)
};
export const TUNING_DEFAULTS = Object.freeze({ ...TUNING });

const LANDING_PLANT = 0.2; // horizontal vel multiplier on hands-off landings
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.12;
const JUMP_CUT = 0.45; // vel.y multiplier when Space released while rising
const HALF = { x: 0.35, y: 0.9, z: 0.35 }; // 1.8 m tall
const EYE_ABOVE_CENTER = 0.72; // eye at feet + 1.62 m
const RESPAWN_DROP = 700; // failsafe — normally the sun eats you well before this
const LAND_FX_MIN_IMPACT = 8;

export function createController(platforms, clouds = [], winds = []) {
  const startPad = platforms[0];

  const c = {
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    half: HALF,
    eyeAboveCenter: EYE_ABOVE_CENTER,
    grounded: false,
    groundPlatform: null,
    dashAvailable: true, // one dash per airtime, restored on landing
    won: false,
    activeCheckpoint: startPad,
    coyoteTimer: 0,
    bufferTimer: 0,
    jumpCutDone: true,
    inCloud: false, // airborne inside a drag cloud (see level/clouds.js)
    inWind: null, // airborne inside a gust zone (see level/wind.js)
    flying: false, // debug noclip: WASD + Space up / Ctrl down, no collision
    flySpeed: 40,
    invincible: false, // debug: fall failsafe off, sun refuses to eat
    feetY: () => c.pos.y - HALF.y,
    step,
    reset,
    devour, // the sun got you: respawn at the checkpoint
    knockback, // sun ray blast: shove + pop airborne
    placeAt: null, // assigned below (debug teleport)
  };
  c.placeAt = placeOn;

  function placeOn(platform) {
    c.pos.x = (platform.min.x + platform.max.x) / 2;
    c.pos.z = (platform.min.z + platform.max.z) / 2;
    // spawn within one gravity tick (0.0067 m) of the surface so the first
    // step immediately re-grounds — no spurious airborne frame
    c.pos.y = platform.max.y + HALF.y + 0.002;
    c.prevPos.x = c.pos.x; c.prevPos.y = c.pos.y; c.prevPos.z = c.pos.z;
    c.vel.x = c.vel.y = c.vel.z = 0;
    c.grounded = true;
    c.dashAvailable = true;
  }

  function reset() {
    c.activeCheckpoint = startPad;
    c.won = false;
    c.coyoteTimer = 0;
    c.bufferTimer = 0;
    placeOn(startPad);
  }

  function devour() {
    if (c.grounded || c.won) return;
    placeOn(c.activeCheckpoint);
    emit('respawn');
  }

  // A sun ray blast: horizontal shove is SET (deterministic), the vertical
  // pop launches you airborne so ground friction can't eat the push. The
  // airborne dash-surplus decay bounds the shove exactly like a dash.
  function knockback(vec) {
    if (c.won) return;
    c.vel.x = vec.x;
    c.vel.z = vec.z;
    c.vel.y = Math.max(c.vel.y, vec.y);
    c.grounded = false;
    c.groundPlatform = null;
    c.coyoteTimer = 0; // no free jump off a blast
    c.jumpCutDone = true; // releasing Space must not cut blast velocity
    c.dashAvailable = true; // the dash is your recovery tool
  }

  function step(dt, input) {
    const T = TUNING;
    c.prevPos.x = c.pos.x; c.prevPos.y = c.pos.y; c.prevPos.z = c.pos.z;

    // --- debug fly/noclip: no gravity, no collision, no events ---
    if (c.flying) {
      if (c.inCloud) {
        c.inCloud = false;
        emit('cloudexit');
      }
      if (c.inWind) {
        c.inWind = null;
        emit('windexit');
      }
      input.jumpQueued = false;
      input.dashQueued = false;
      const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
      const speed = c.flySpeed * (input.sprint ? 3 : 1);
      const n = Math.hypot(fwd, strafe) || 1;
      c.vel.x = ((-sin * fwd + cos * strafe) / n) * speed;
      c.vel.z = ((-cos * fwd - sin * strafe) / n) * speed;
      c.vel.y = ((input.jumpHeld ? 1 : 0) - (input.dashHeld ? 1 : 0)) * speed;
      c.pos.x += c.vel.x * dt;
      c.pos.y += c.vel.y * dt;
      c.pos.z += c.vel.z * dt;
      c.grounded = false;
      c.groundPlatform = null;
      return;
    }

    // --- moving platforms: ride the one you stand on, get pushed by others ---
    if (c.grounded && c.groundPlatform?.delta) {
      const d = c.groundPlatform.delta;
      c.pos.x += d.x; c.pos.y += d.y; c.pos.z += d.z;
    }
    for (const p of platforms) {
      if (!p.delta || p === c.groundPlatform) continue;
      if ((p.delta.x || p.delta.y || p.delta.z) && overlaps(c.pos, HALF, p)) {
        c.pos.x += p.delta.x; c.pos.y += p.delta.y; c.pos.z += p.delta.z;
      }
    }

    // --- clouds: inside one, air control dies and speed bleeds (below) ---
    const wasInCloud = c.inCloud;
    c.inCloud = !c.grounded && pointInCloud(clouds, c.pos);
    if (c.inCloud !== wasInCloud) emit(c.inCloud ? 'cloudenter' : 'cloudexit');

    // --- wind: a steady sideways shove while airborne in a gust zone ---
    const wasInWind = c.inWind;
    c.inWind = !c.grounded ? pointInWind(winds, c.pos) : null;
    if (!!c.inWind !== !!wasInWind) emit(c.inWind ? 'windenter' : 'windexit');

    c.coyoteTimer -= dt;
    c.bufferTimer -= dt;
    if (input.jumpQueued) {
      c.bufferTimer = JUMP_BUFFER;
      input.jumpQueued = false;
    }

    // --- horizontal movement in camera-yaw space ---
    const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let wishX = 0, wishZ = 0;
    if (fwd !== 0 || strafe !== 0) {
      const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
      wishX = -sin * fwd + cos * strafe;
      wishZ = -cos * fwd - sin * strafe;
      const len = Math.hypot(wishX, wishZ);
      wishX /= len; wishZ /= len;

      const accel = c.grounded ? T.GROUND_ACCEL
        : c.inCloud ? T.CLOUD_AIR_ACCEL : T.AIR_ACCEL;
      // in the air, steering may never CLAMP AWAY dash surplus — input can't
      // add speed beyond AIR_SPEED but keeps whatever the dash granted
      const preSpeed = Math.hypot(c.vel.x, c.vel.z);
      const maxSpeed = c.grounded
        ? (input.sprint ? T.SPRINT_SPEED : T.WALK_SPEED)
        : Math.max(T.AIR_SPEED, preSpeed);
      c.vel.x += wishX * accel * dt;
      c.vel.z += wishZ * accel * dt;
      const speed = Math.hypot(c.vel.x, c.vel.z);
      if (speed > maxSpeed) {
        c.vel.x *= maxSpeed / speed;
        c.vel.z *= maxSpeed / speed;
      }
    } else if (c.grounded) {
      const speed = Math.hypot(c.vel.x, c.vel.z);
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - T.FRICTION * dt);
        c.vel.x *= newSpeed / speed;
        c.vel.z *= newSpeed / speed;
      }
    }

    // --- jump: buffered press + grounded or coyote ---
    if (c.bufferTimer > 0 && (c.grounded || c.coyoteTimer > 0)) {
      c.vel.y = T.JUMP_SPEED;
      c.bufferTimer = 0;
      c.coyoteTimer = 0;
      c.grounded = false;
      c.jumpCutDone = false;
      emit('jump');
    }

    // variable jump height: releasing Space while rising cuts the jump
    if (!c.jumpCutDone && !input.jumpHeld && c.vel.y > 3) {
      c.vel.y *= JUMP_CUT;
      c.jumpCutDone = true;
    }

    // --- air dash: Ctrl, mid-air only, once per airtime ---
    if (input.dashQueued) {
      input.dashQueued = false;
      if (!c.grounded && c.dashAvailable) {
        c.dashAvailable = false;
        c.vel.x = -Math.sin(input.yaw) * T.DASH_SPEED;
        c.vel.z = -Math.cos(input.yaw) * T.DASH_SPEED;
        if (c.vel.y < 0) c.vel.y = 0; // the dash catches you mid-fall
        emit('dash');
      }
    }
    // dash surplus bleeds off so the burst is punchy but bounded
    if (!c.grounded) {
      const airSpeed = Math.hypot(c.vel.x, c.vel.z);
      if (airSpeed > T.AIR_SPEED) {
        const target = T.AIR_SPEED + (airSpeed - T.AIR_SPEED) * Math.exp(-T.DASH_DECAY * dt);
        c.vel.x *= target / airSpeed;
        c.vel.z *= target / airSpeed;
      }
      // cloud drag: the cloud swallows ordinary momentum — but dash surplus
      // punches through untouched (stacking both would kill the dash too)
      if (c.inCloud) {
        const spd = Math.hypot(c.vel.x, c.vel.z);
        if (spd <= T.AIR_SPEED + 0.5) {
          const f = Math.exp(-T.CLOUD_DRAG * dt);
          c.vel.x *= f;
          c.vel.z *= f;
        }
      }
      // wind shove. Added velocity survives the input clamp (it measures
      // pre-input speed) and only bleeds via the dash-surplus decay.
      if (c.inWind) {
        c.vel.x += c.inWind.def.dir[0] * c.inWind.def.strength * dt;
        c.vel.z += c.inWind.def.dir[2] * c.inWind.def.strength * dt;
      }
    }

    // --- gravity (always applied, so the ground re-collides every step);
    // falling pulls much harder than rising resists ---
    c.vel.y -= (c.vel.y > 0 ? T.GRAVITY_UP : T.GRAVITY_DOWN) * dt;
    if (c.vel.y < -T.TERMINAL_VELOCITY) c.vel.y = -T.TERMINAL_VELOCITY;

    // --- integrate + resolve, horizontal axes before vertical ---
    const wasGrounded = c.grounded;
    const preVy = c.vel.y;
    c.grounded = false;

    c.pos.x += c.vel.x * dt;
    if (resolveAxis(c.pos, HALF, c.vel.x, platforms, 'x').hitRef) c.vel.x = 0;

    c.pos.z += c.vel.z * dt;
    if (resolveAxis(c.pos, HALF, c.vel.z, platforms, 'z').hitRef) c.vel.z = 0;

    c.pos.y += c.vel.y * dt;
    const resY = resolveAxis(c.pos, HALF, c.vel.y, platforms, 'y');
    c.groundPlatform = null;
    if (resY.hitNeg) {
      c.grounded = true;
      c.groundPlatform = resY.hitRef;
      c.dashAvailable = true;
      c.vel.y = 0;
    } else if (resY.hitPos) {
      c.vel.y = 0; // head bonk
    }
    const groundPlatform = c.groundPlatform;

    // --- transitions and events ---
    if (c.grounded && !wasGrounded) {
      // heavy landing plants: absorb horizontal momentum unless the player
      // is actively running through the touchdown. Bounce pads never plant —
      // the launch keeps your full horizontal speed.
      if (!groundPlatform.def.bounce && fwd === 0 && strafe === 0) {
        c.vel.x *= LANDING_PLANT;
        c.vel.z *= LANDING_PLANT;
      }
      const impactSpeed = Math.abs(preVy);
      if (groundPlatform.def.checkpoint || groundPlatform === startPad) {
        c.activeCheckpoint = groundPlatform;
      }
      emit('land', {
        impactSpeed,
        intensity: Math.min(impactSpeed / T.TERMINAL_VELOCITY, 1),
        fx: impactSpeed > LAND_FX_MIN_IMPACT,
        platform: groundPlatform,
        position: { x: c.pos.x, y: groundPlatform.max.y, z: c.pos.z },
      });
      if (groundPlatform.def.goal && !c.won) {
        c.won = true;
        emit('win', { height: c.feetY() });
      }
      // bounce pad: auto-launch. The dash was already restored by the
      // Y-resolve; consume any buffered jump so it can't double-fire later,
      // and disarm the jump-cut so releasing Space can't kill the launch.
      if (groundPlatform.def.bounce) {
        c.vel.y = T.BOUNCE_VY;
        c.grounded = false;
        c.groundPlatform = null;
        c.jumpCutDone = true;
        c.bufferTimer = 0;
        emit('bounce', {
          platform: groundPlatform,
          position: { x: c.pos.x, y: groundPlatform.max.y, z: c.pos.z },
        });
      }
    }
    if (!c.grounded && wasGrounded && c.vel.y <= 0) {
      c.coyoteTimer = COYOTE_TIME; // stepped off an edge (not a jump)
    }

    // --- fell too far below the checkpoint -> respawn ---
    if (!c.invincible && c.pos.y < c.activeCheckpoint.max.y - RESPAWN_DROP) {
      placeOn(c.activeCheckpoint);
      emit('respawn');
    }
  }

  reset();
  return c;
}
