// Sun ray attacks — from LEVEL 4 the sun hunts you. Cycle:
//   IDLE -(cooldown)-> CHARGE (aim line tracks you, then locks red)
//        -> FIRE (beam flash + hit test + knockback) -> IDLE
// Dodgeable by design: during the final LOCK_TIME the aim is frozen, so
// sprinting (12 m sideways) or jumping (~26 m up) clears the 3 m hit radius;
// standing still gets blasted off the platform.
import * as THREE from 'three';
import { emit, on } from '../core/events.js';

const ACTIVE_LEVEL = 4;
const COOLDOWN_BY_LEVEL = { 4: 7.0, 5: 6.0, 6: 5.2, 7: 4.4, 8: 3.7, 9: 3.0 }; // 9 = level >= 9
const COOLDOWN_JITTER = 1.0; // +- uniform seconds
const CHARGE_TIME = 1.2; // total telegraph
const LOCK_TIME = 0.35; // final part of the charge: aim frozen, line red
const FIRE_TIME = 0.25; // beam flash lifetime
const HIT_RADIUS = 3.0; // player center to beam segment
const KNOCK_H = 50; // horizontal shove m/s
const KNOCK_V = 30; // upward pop m/s (apex ~13 m at GRAVITY_UP 35)
const OVERSHOOT = 80; // beam extends past the lock point
const FLASH_TIME = 0.3;

const AIM_COLOR = 0xffd166;
const LOCK_COLOR = 0xff5533;
const BEAM_COLOR = 0xfff3c4;

// --- pure helpers (plain {x,y,z}, node-testable) ---------------------------

export function segmentPointDistance(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2)) : 0;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Knock direction: horizontal continuation of the beam; when the beam is
// near-vertical, push the player away from under the sun instead.
export function computeKnock(from, to, playerPos) {
  let dx = to.x - from.x, dz = to.z - from.z;
  let len = Math.hypot(dx, dz);
  if (len < 0.1) {
    dx = playerPos.x - from.x;
    dz = playerPos.z - from.z;
    len = Math.hypot(dx, dz) || 1;
  }
  return { x: (dx / len) * KNOCK_H, y: KNOCK_V, z: (dz / len) * KNOCK_H };
}

// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

function beamMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

export function createSunRays(scene, { sun, player, getLevel, isEclipsed = () => false }) {
  // aim line (thin, telegraph), beam (fat, fire), core (thin white, fire),
  // impact flash (sphere at the hit point)
  const aim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1, 6, 1, true), beamMaterial(AIM_COLOR, 0.3));
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 1, 8, 1, true), beamMaterial(BEAM_COLOR, 0.9));
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 1, 6, 1, true), beamMaterial(0xffffff, 1));
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 12, 8), beamMaterial(AIM_COLOR, 0.8));
  // ground ring under the player: the aim line is nearly invisible when it
  // points AT you (foreshortened), so this is the telegraph you actually see.
  // Normal blending — additive would wash out against the bright pastel tops.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 32),
    new THREE.MeshBasicMaterial({
      color: AIM_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }));
  ring.rotation.x = -Math.PI / 2;
  for (const m of [aim, beam, core, flash, ring]) {
    m.visible = false;
    scene.add(m);
  }

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const end = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();

  let state = 'idle'; // 'idle' | 'charge' | 'fire'
  let timer = 0; // time inside the current state
  let cooldown = 0;
  let flashTimer = Infinity;
  let enabled = true;
  let cooldownOverride = 0; // 0 = auto by level
  let forced = false; // debug forceFire: bypass level/lock/enabled gates

  function rollCooldown() {
    if (cooldownOverride > 0) return cooldownOverride;
    const base = COOLDOWN_BY_LEVEL[Math.min(Math.max(getLevel(), 4), 9)];
    return base + (Math.random() * 2 - 1) * COOLDOWN_JITTER;
  }

  function orient(mesh, a, b) {
    dir.copy(b).sub(a);
    const length = dir.length();
    mesh.position.copy(mid.copy(a).add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    mesh.scale.set(1, length, 1);
  }

  function toIdle() {
    const wasActive = state !== 'idle';
    state = 'idle';
    timer = 0;
    forced = false;
    cooldown = rollCooldown();
    aim.visible = beam.visible = core.visible = ring.visible = false;
    sun.setAngry(0);
    // audio needs an abort signal to kill the charge tone
    if (wasActive) emit('sunray', { phase: 'idle' });
  }

  function startCharge(preLocked) {
    state = 'charge';
    // forceFire enters at the lock boundary: 0.35 s to impact
    timer = preLocked ? CHARGE_TIME - LOCK_TIME : 0;
    // aim snapshot NOW — a pre-locked charge skips the tracking phase
    from.copy(sun.position);
    to.set(player.pos.x, player.pos.y + 0.3, player.pos.z);
    aim.visible = ring.visible = true;
    sun.setAngry(1);
    emit('sunray', { phase: 'charge' });
  }

  function fire() {
    state = 'fire';
    timer = 0;
    aim.visible = ring.visible = false;
    sun.setAngry(0);
    dir.copy(to).sub(from).normalize();
    end.copy(to).addScaledVector(dir, OVERSHOOT);
    orient(beam, from, end);
    orient(core, from, end);
    beam.visible = core.visible = true;

    if (segmentPointDistance(from, end, player.pos) <= HIT_RADIUS) {
      const knock = computeKnock(from, to, player.pos);
      player.knockback(knock);
      flash.position.set(player.pos.x, player.pos.y, player.pos.z);
      flash.visible = true;
      flashTimer = 0;
      emit('rayhit', { direction: { x: knock.x / KNOCK_H, z: knock.z / KNOCK_H } });
    }
    emit('sunray', { phase: 'fire' });
  }

  // a respawn mid-charge would fire at a ghost — stand down instead
  on('respawn', () => { if (state !== 'idle') toIdle(); });

  function update(dt, locked) {
    const canAttack = forced
      ? !sun.isEating()
      : enabled && locked && !player.won && !isEclipsed() &&
        getLevel() >= ACTIVE_LEVEL && !sun.isVisiting() && !sun.isEating();

    // impact flash animates independently of the attack cycle
    if (flashTimer < FLASH_TIME) {
      flashTimer += dt;
      const t = Math.min(flashTimer / FLASH_TIME, 1);
      flash.scale.setScalar(1 + 3 * t);
      flash.material.opacity = 0.8 * (1 - t);
      if (t >= 1) flash.visible = false;
    }

    if (state === 'idle') {
      if (!canAttack) return; // cooldown only ticks while an attack is possible
      cooldown -= dt;
      if (cooldown <= 0) startCharge(false);
      return;
    }

    if (!canAttack) { toIdle(); return; } // visit/eat/pause/win aborts cleanly

    timer += dt;

    if (state === 'charge') {
      const locked_aim = timer >= CHARGE_TIME - LOCK_TIME;
      if (!locked_aim) {
        // tracking phase: aim follows the player
        from.copy(sun.position);
        to.set(player.pos.x, player.pos.y + 0.3, player.pos.z);
      }
      aim.material.color.setHex(locked_aim ? LOCK_COLOR : AIM_COLOR);
      aim.material.opacity = locked_aim
        ? 0.55
        : 0.15 + 0.15 * Math.sin(timer * 20);
      orient(aim, from, to);
      // danger ring at the target's feet — during lock it goes red and tight
      ring.position.set(to.x, to.y - 1.15, to.z);
      ring.material.color.setHex(locked_aim ? LOCK_COLOR : AIM_COLOR);
      ring.material.opacity = locked_aim ? 0.85 : 0.35 + 0.2 * Math.sin(timer * 12);
      ring.scale.setScalar(locked_aim ? 1 : 1.15 + 0.1 * Math.sin(timer * 12));
      if (timer >= CHARGE_TIME) fire();
      return;
    }

    if (state === 'fire') {
      const t = timer / FIRE_TIME;
      beam.material.opacity = 0.9 * (1 - t);
      core.material.opacity = 1 - t;
      if (timer >= FIRE_TIME) toIdle();
    }
  }

  function reset() {
    toIdle();
    flash.visible = false;
    flashTimer = Infinity;
  }

  toIdle();

  return {
    update,
    reset,
    setEnabled: (v) => { enabled = v; if (!v) toIdle(); },
    setCooldownOverride: (s) => { cooldownOverride = s; },
    forceFire: () => {
      if (sun.isEating() || state !== 'idle') return;
      forced = true;
      startCharge(true);
    },
    state: () => state,
  };
}
